import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabaseService";
import { Invoice, InvoiceItem, InvoiceAnalysisResult } from "../types";
import { getLearningRules } from "./learningEngine";

export interface SubscriptionCheck {
  isActive: boolean;
  isExpired: boolean;
  plan: string;
  expiresAt: Date | null;
}

export function useInvoices(session: any, subscriptionInfo?: SubscriptionCheck) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const prevInvoicesRef = useRef<Invoice[]>([]);

  useEffect(() => {
    prevInvoicesRef.current = invoices;
  }, [invoices]);

  const fetchInvoices = useCallback(async () => {
    // Veritabanı kullanımı devredışı. (Sadece Prompt + AI modunda çalışıyoruz)
    // Supabase den fetch yapmayı engelliyoruz ki önbellek sıfırlanmasın.
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const fetchInvoiceItems = useCallback(async (invoiceId: string): Promise<InvoiceItem[]> => {
    const { data, error } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[useInvoices] items fetch error:", error);
      return [];
    }
    return data || [];
  }, []);

  const uploadAndAnalyze = useCallback(async (file: File): Promise<InvoiceAnalysisResult | null> => {
    // ── Abonelik Dönem Kontrolü ──
    if (subscriptionInfo) {
      if (!subscriptionInfo.isActive || subscriptionInfo.isExpired) {
        const expDateStr = subscriptionInfo.expiresAt
          ? subscriptionInfo.expiresAt.toLocaleDateString("tr-TR")
          : "—";
        throw new Error(
          `Abonelik süreniz dolmuş veya aktif değil (Son geçerlilik: ${expDateStr}). ` +
          `Fatura yükleyebilmek için lütfen aboneliğinizi yenileyin.`
        );
      }
    }

    // Oturum kontrolu - expire olmussa refresh
    let { data: { session: currentSession } } = await supabase.auth.getSession();
    if (currentSession?.expires_at && currentSession.expires_at * 1000 < Date.now() + 30000) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed.session) currentSession = refreshed.session;
    }
    if (!currentSession?.access_token) {
      throw new Error("Oturum bulunamadi. Lutfen tekrar giris yapin.");
    }

    setUploading(true);
    try {
      const base64 = await fileToBase64(file);

      const currentUserId = currentSession?.user?.id;
      const rules = getLearningRules(currentUserId); // user-specific

      // Ayarlar sekmesindeki "Manuel Kurallar" ve "Öğrenilen Kurallar"ı çek
      let activeSettingsRules: any[] = [];
      let companyName = "";
      let companyVatId = "";
      try {
        const settingsKey = currentUserId ? `fibu_de_settings_${currentUserId}` : "fibu_de_settings";
        const settingsData = localStorage.getItem(settingsKey);
        if (settingsData) {
          const parsed = JSON.parse(settingsData);
          if (parsed.rules && Array.isArray(parsed.rules)) {
            // Yalnızca aktif olanları gönder
            activeSettingsRules = parsed.rules.filter((r: any) => r.active === true);
          }
          // Şirket bilgilerini al (fatura yön doğrulaması için)
          companyName = parsed?.company?.company_name || "";
          companyVatId = parsed?.company?.ust_id || "";
        }
      } catch (err) {
        console.warn("fibu_de_settings okunamadı", err);
      }

      const { data, error } = await supabase.functions.invoke("super-worker", {
        body: {
          fileBase64: base64,
          fileType: file.type,
          learningRules: rules,
          settingsRules: activeSettingsRules,
          companyName,
          companyVatId,
        },
        headers: {
          Authorization: `Bearer ${currentSession.access_token}`,
        },
      });

      if (error) {
        let errorBody = "";
        try {
          if (error.context && typeof error.context.text === "function") {
            errorBody = await error.context.text();
          }
        } catch (e) {}
        console.error("Invoke Error Detail:", error, errorBody);
        throw new Error(`Sunucu Hatası: ${errorBody || error.message}`);
      }
      
      if (!data?.success) throw new Error(data?.error || "Analiz başarısız");

      const aiData = data.data; // { header, items, context }

      // ── Post-processing Doğrulama: Gelen faturalarda 8xxx hesap kodu engelle ──
      // Satıcısı biz olmayan faturalar kesinlikle gelir (8xxx) hesabına atanamaz
      if (aiData?.items && Array.isArray(aiData.items)) {
        const supplierName = (aiData?.header?.supplier_name || "").toLowerCase();
        const supplierVat = aiData?.header?.satici_vkn || "";
        const ownName = companyName.toLowerCase();
        const ownVat = companyVatId;

        // Satıcı biz değilsek → gelen fatura → 8xxx yasak
        const isOwnCompanySeller =
          (ownVat && supplierVat && supplierVat === ownVat) ||
          (ownName && supplierName && supplierName.includes(ownName));

        if (!isOwnCompanySeller) {
          for (const item of aiData.items) {
            if (item.account_code && String(item.account_code).startsWith("8")) {
              console.warn(`[useInvoices] 8xxx hesap kodu düzeltildi: ${item.account_code} → 4960 (Satıcı biz değiliz)`);
              item.account_code = "4960";
              item.account_name = "Verschiedene betriebliche Aufwendungen";
              item.account_name_tr = "Çeşitli İşletme Giderleri";
              item.match_justification = "Gelen fatura: 8xxx gelir hesabı engellendi, manuel inceleme gerekli";
              item.match_score = 50;
            }
          }
        }
      }

      // Invoices tablosuna mock olarak ekle (Yeni Modele Gore)
      const mappedResult = {
        ...aiData,
        fatura_bilgileri: aiData?.header || {},
        finansal_ozet: {
          ara_toplam: aiData?.header?.total_net || 0,
          toplam_kdv: aiData?.header?.total_vat || 0,
          genel_toplam: aiData?.header?.total_gross || 0,
        },
        kalemler: aiData?.items || [],
        uyarilar: aiData?.context ? [aiData.context] : []
      };

      const mockInvoiceId = "mock-" + Date.now().toString();

      const isDuplicate = prevInvoicesRef.current.some(inv => 
        inv.fatura_no === mappedResult.fatura_bilgileri.invoice_number && 
        inv.satici_adi === mappedResult.fatura_bilgileri.supplier_name
      );

      if (isDuplicate) {
        mappedResult.uyarilar.push("Mükerrer Fatura: Bu dosya/fatura numarası daha önce yüklenmiş görünüyor.");
      }

      const mockInvoice: Invoice = {
        id: mockInvoiceId,
        user_id: currentSession.user.id,
        fatura_no: mappedResult.fatura_bilgileri.invoice_number || null,
        tarih: mappedResult.fatura_bilgileri.invoice_date || null,
        satici_vkn: mappedResult.fatura_bilgileri.supplier_vat_id || null,
        satici_adi: mappedResult.fatura_bilgileri.supplier_name || null,
        alici_vkn: mappedResult.fatura_bilgileri.buyer_vat_id || null,
        ara_toplam: mappedResult.finansal_ozet.ara_toplam,
        toplam_kdv: mappedResult.finansal_ozet.toplam_kdv,
        genel_toplam: mappedResult.finansal_ozet.genel_toplam,
        status: isDuplicate ? "mükerrer" : "analyzed",
        raw_ai_response: mappedResult,
        uyarilar: mappedResult.uyarilar,
        file_url: `data:${file.type};base64,${base64}`,
        created_at: new Date().toISOString()
      };

      // Invoices listesini yalnızca React state üzerinden güncelle (DB KAPALI)
      setInvoices(prev => [mockInvoice, ...prev]);

      return mappedResult as InvoiceAnalysisResult;
    } catch (err: any) {
      console.error("[useInvoices] uploadAndAnalyze error:", err);
      throw new Error(err?.message || "Bir hata oluştu");
    } finally {
      setUploading(false);
    }
  }, [fetchInvoices]);

  const deleteInvoice = useCallback(async (invoiceId: string) => {
    // Veritabanı devre dışı, sadece React state den siliyoruz.
    setInvoices(prev => prev.filter(i => i.id !== invoiceId));
  }, []);

  const updateInvoice = useCallback((invoiceId: string, updates: Partial<Invoice>) => {
    setInvoices(prev => prev.map(inv => {
      if (inv.id !== invoiceId) return inv;
      const updated = { ...inv, ...updates };
      // raw_ai_response içindeki header bilgilerini de güncelle
      if (updated.raw_ai_response) {
        const header = updated.raw_ai_response.header || updated.raw_ai_response.fatura_bilgileri || {};
        if (updates.fatura_no !== undefined) header.invoice_number = updates.fatura_no;
        if (updates.tarih !== undefined) header.invoice_date = updates.tarih;
        if (updates.satici_adi !== undefined) header.supplier_name = updates.satici_adi;
        if (updates.satici_vkn !== undefined) header.supplier_vat_id = updates.satici_vkn;
        if (updates.alici_vkn !== undefined) header.buyer_vat_id = updates.alici_vkn;
        if ((updates as any).alici_adi !== undefined) header.buyer_name = (updates as any).alici_adi;
        if (updates.ara_toplam !== undefined) header.total_net = updates.ara_toplam;
        if (updates.toplam_kdv !== undefined) header.total_vat = updates.toplam_kdv;
        if (updates.genel_toplam !== undefined) header.total_gross = updates.genel_toplam;
        if (updated.raw_ai_response.header) updated.raw_ai_response.header = { ...header };
        if (updated.raw_ai_response.fatura_bilgileri) updated.raw_ai_response.fatura_bilgileri = { ...header };
      }
      // Manuel düzenleme yapıldıysa status'u güncelle
      if (!updated.status || updated.status === "error") {
        updated.status = "analyzed";
      }
      return updated;
    }));
  }, []);

  const updateInvoiceItems = useCallback((invoiceId: string, updatedItems: any[]) => {
    setInvoices(prev => prev.map(inv => {
      if (inv.id !== invoiceId) return inv;
      const updated = { ...inv };
      if (updated.raw_ai_response) {
        updated.raw_ai_response = {
          ...updated.raw_ai_response,
          items: updatedItems,
          kalemler: updatedItems,
        };
      }
      return updated;
    }));
  }, []);

  return {
    invoices,
    loading,
    uploading,
    fetchInvoices,
    fetchInvoiceItems,
    uploadAndAnalyze,
    deleteInvoice,
    updateInvoice,
    updateInvoiceItems,
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // data:image/jpeg;base64,/9j/4AAQ... → sadece base64 kısmı
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
