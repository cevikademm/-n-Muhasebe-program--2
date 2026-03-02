import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabaseService";
import { AccountRow, Invoice, InvoiceItem, Language, MenuKey } from "../types";
import { analyzeInvoiceWithAI } from "./geminiService";
import {
  loadRulesFromLS,
  applyRulesToItems,
  loadRulesFromSupabase,
  saveRulesToSupabase,
  learnFromManualOverride,
} from "./ruleEngine";
import { useToast } from "../contexts/ToastContext";

interface UseInvoicesOptions {
  session: any;
  activeMenu: MenuKey;
  accountPlansData: AccountRow[];
  lang: Language;
  duplicateMessage: string;
  deleteConfirm: string;
}

export function useInvoices({
  session,
  activeMenu,
  accountPlansData,
  lang,
  duplicateMessage,
  deleteConfirm,
}: UseInvoicesOptions) {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const lastUploadRef = useRef<number>(0);

  const fetchInvoices = useCallback(async () => {
    if (!session?.user?.id) return;
    setInvoicesLoading(true);
    // ⚠ GÜVENLİK: user_id filtresi ile yalnızca oturumdaki kullanıcının faturaları çekilir (IDOR koruması)
    const { data: invData } = await supabase
      .from("invoices")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    if (invData) {
      setInvoices(invData as Invoice[]);
      const ids = invData.map((i) => i.id);
      if (ids.length > 0) {
        const { data: items } = await supabase
          .from("invoice_items")
          .select("*")
          .in("invoice_id", ids);
        if (items) setInvoiceItems(items as InvoiceItem[]);
      }
    }
    setInvoicesLoading(false);
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session) return;
    if (activeMenu === "invoices" || activeMenu === "dashboard" || activeMenu === "bankDocuments") {
      if (invoices.length === 0) fetchInvoices();
    }
  }, [session, activeMenu, fetchInvoices, invoices.length]);

  // ─── Upload & AI Analiz ───────────────────────────────────────────
  const handleUploadInvoice = useCallback(
    async (file: File): Promise<Invoice | null> => {
      if (!session?.user?.id) return null;

      const COOLDOWN_MS = 8_000;
      const now = Date.now();
      if (now - lastUploadRef.current < COOLDOWN_MS) {
        toast(
          lang === "tr"
            ? "Lütfen bir sonraki yükleme için birkaç saniye bekleyin."
            : "Bitte warten Sie einige Sekunden vor dem nächsten Upload.",
          "warn"
        );
        return null;
      }

      // ⚠ GÜVENLİK (ORT-04): Sunucu tarafı rate limiting
      // Son 1 saat içindeki yükleme sayısını kontrol et (max 20/saat)
      try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { count } = await supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .eq("user_id", session.user.id)
          .gte("created_at", oneHourAgo);

        if (count != null && count >= 20) {
          toast(
            lang === "tr"
              ? "Saatlik yükleme limitine ulaştınız (maks. 20). Lütfen daha sonra tekrar deneyin."
              : "Stündliches Upload-Limit erreicht (max. 20). Bitte versuchen Sie es später erneut.",
            "warn"
          );
          return null;
        }
      } catch {
        // Rate limit sorgusu başarısız olursa devam et (istemci tarafı cooldown yeterli)
      }

      const MAX_SIZE = 15 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        toast(
          lang === "tr"
            ? "Dosya boyutu 15 MB'dan büyük olamaz."
            : "Die Datei darf nicht größer als 15 MB sein.",
          "error"
        );
        return null;
      }

      const ALLOWED_TYPES = new Set([
        "application/pdf",
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
      ]);
      if (!ALLOWED_TYPES.has(file.type)) {
        toast(
          lang === "tr"
            ? "Sadece PDF, JPG, PNG ve WebP dosyaları kabul edilmektedir."
            : "Nur PDF-, JPG-, PNG- und WebP-Dateien werden akzeptiert.",
          "error"
        );
        return null;
      }

      lastUploadRef.current = now;
      setUploading(true);

      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
        const fileName = `${session.user.id}/${Date.now()}_${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("invoices")
          .upload(fileName, file);

        if (uploadError) throw new Error("Dosya yükleme hatası: " + uploadError.message);

        const { data: urlData } = supabase.storage
          .from("invoices")
          .getPublicUrl(fileName);
        const fileUrl = urlData.publicUrl;

        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const res = reader.result as string;
            resolve(res.includes(",") ? res.split(",")[1] : res);
          };
          reader.onerror = () => reject(new Error("Dosya okunamadı"));
          reader.readAsDataURL(file);
        });

        let allAccountPlans = accountPlansData.length > 0 ? accountPlansData : [];
        if (allAccountPlans.length === 0) {
          const { data: ap } = await supabase
            .from("account_plans")
            .select("*")
            .order("id", { ascending: true });
          if (ap) allAccountPlans = ap as AccountRow[];
        }

        const analysis = await analyzeInvoiceWithAI(base64, file.type, allAccountPlans);

        const safeHeader = analysis.header;
        let safeItems = Array.isArray(analysis.items) ? analysis.items : [];

        try {
          const currentRules = loadRulesFromLS();
          safeItems = applyRulesToItems(safeItems, safeHeader.supplier_name, currentRules);
        } catch (ruleErr) {
          console.warn("[RuleEngine] Post-pass hatası:", ruleErr);
        }

        let invoiceStatus = safeItems.length > 0 ? "analyzed" : "error";
        if (safeHeader.invoice_number && safeHeader.supplier_name) {
          const { count } = await supabase
            .from("invoices")
            .select("*", { count: "exact", head: true })
            .eq("invoice_number", safeHeader.invoice_number)
            .ilike("supplier_name", safeHeader.supplier_name);

          if (count && count > 0) {
            invoiceStatus = "duplicate";
            toast(duplicateMessage, "warn");
          }
        }

        const { data: insertedInvoice, error: invError } = await supabase
          .from("invoices")
          .insert({
            user_id: session.user.id,
            invoice_number: safeHeader.invoice_number || "BELGESİZ",
            supplier_name: safeHeader.supplier_name || "Bilinmiyor",
            invoice_date: safeHeader.invoice_date,
            total_net: safeHeader.total_net,
            total_vat: safeHeader.total_vat,
            total_gross: safeHeader.total_gross,
            currency: safeHeader.currency || "EUR",
            file_url: fileUrl,
            file_type: file.type || "application/octet-stream",
            status: invoiceStatus,
          })
          .select()
          .single();

        if (invError) throw new Error("Fatura kaydı başarısız: " + invError.message);
        if (!insertedInvoice) throw new Error("Kayıt oluşturuldu fakat veri alınamadı.");

        if (safeItems.length > 0) {
          const itemsToInsert = safeItems.map((item: any) => ({
            invoice_id: insertedInvoice.id,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            vat_rate: item.vat_rate,
            vat_amount: item.vat_amount,
            net_amount: item.net_amount,
            gross_amount: item.gross_amount,
            account_code: item.account_code,
            account_name: item.account_name,
            account_name_tr: item.account_name_tr,
            match_score: item.match_score,
            match_justification: item.match_justification,
            hgb_reference: item.hgb_reference,
            tax_note: item.tax_note,
            period_note: item.period_note,
            expense_type: item.expense_type,
            datev_counter_account: item.datev_counter_account,
            match_source: item.match_source || "ai",
          }));
          const { error: itemError } = await supabase.from("invoice_items").insert(itemsToInsert);
          if (itemError) console.error("[invoice_items] Kalem ekleme hatası:", itemError);
        }

        await fetchInvoices();
        toast(lang === "tr" ? "Fatura başarıyla analiz edildi." : "Rechnung erfolgreich analysiert.", "success");
        return insertedInvoice as Invoice;
      } catch (err: any) {
        console.error("[handleUploadInvoice]", err);
        toast("Hata: " + (err.message || "Bilinmeyen bir hata oluştu"), "error");
        return null;
      } finally {
        setUploading(false);
      }
    },
    [session, accountPlansData, lang, duplicateMessage, toast, fetchInvoices]
  );

  // ─── Sil ──────────────────────────────────────────────────────────
  const handleDeleteInvoice = useCallback(
    async (invoice: Invoice): Promise<boolean> => {
      if (!window.confirm(deleteConfirm)) return false;

      const { error } = await supabase.from("invoices").delete().eq("id", invoice.id);
      if (!error) {
        await fetchInvoices();
        toast(lang === "tr" ? "Fatura silindi." : "Rechnung gelöscht.", "success");
        return true;
      } else {
        toast("Silme hatası: " + error.message, "error");
        return false;
      }
    },
    [deleteConfirm, lang, toast, fetchInvoices]
  );

  // ─── Durum Güncelle ───────────────────────────────────────────────
  const handleUpdateStatus = useCallback(
    async (invoice: Invoice, newStatus: string): Promise<Invoice | null> => {
      const { data, error } = await supabase
        .from("invoices")
        .update({ status: newStatus })
        .eq("id", invoice.id)
        .select()
        .single();

      if (!error && data) {
        setInvoices((prev) =>
          prev.map((inv) => (inv.id === invoice.id ? (data as Invoice) : inv))
        );
        return data as Invoice;
      }
      return null;
    },
    []
  );

  // ─── Kalem Güncelle ───────────────────────────────────────────────
  const handleUpdateInvoiceItem = useCallback(
    async (itemId: string, newAccount: AccountRow): Promise<InvoiceItem | null> => {
      const { data, error } = await supabase
        .from("invoice_items")
        .update({
          account_code: newAccount.account_code,
          account_name: newAccount.account_description,
          account_name_tr: newAccount.account_description,
          match_score: 100,
          match_justification: "Manuel olarak kullanıcı tarafından düzeltildi.",
          match_source: "manual",
        })
        .eq("id", itemId)
        .select()
        .single();

      if (!error && data) {
        setInvoiceItems((prev) =>
          prev.map((item) => (item.id === itemId ? (data as InvoiceItem) : item))
        );

        // Otomatik öğrenme
        try {
          if (session?.user?.id) {
            const currentRules = await loadRulesFromSupabase(session.user.id, supabase);
            const item = invoiceItems.find((i) => i.id === itemId);
            const inv = item ? invoices.find((v) => v.id === item.invoice_id) : null;
            const supplierName = inv?.supplier_name || "";
            if (item) {
              const updatedRules = learnFromManualOverride(
                item as any,
                supplierName,
                newAccount.account_code || "",
                newAccount.account_description || "",
                currentRules
              );
              await saveRulesToSupabase(updatedRules, session.user.id, supabase);
            }
          }
        } catch (learnErr) {
          console.warn("[RuleEngine] Öğrenme hatası (kritik değil):", learnErr);
        }

        return data as InvoiceItem;
      } else {
        toast("Güncelleme hatası: " + (error?.message || "Bilinmiyor"), "error");
        return null;
      }
    },
    [session, invoiceItems, invoices, toast]
  );

  return {
    invoices,
    invoiceItems,
    invoicesLoading,
    uploading,
    fetchInvoices,
    handleUploadInvoice,
    handleDeleteInvoice,
    handleUpdateStatus,
    handleUpdateInvoiceItem,
  };
}
