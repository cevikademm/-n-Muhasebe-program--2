import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabaseService";
import { Invoice, InvoiceItem, InvoiceAnalysisResult } from "../types";
import { getLearningRules } from "./learningEngine";
// freePlanLimits importları kaldırıldı — abonelik sistemi devre dışı

export function useInvoices(session: any, effectiveOwnerIdArg?: string | null) {
  const effectiveOwnerId = effectiveOwnerIdArg || session?.user?.id;
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const prevInvoicesRef = useRef<Invoice[]>([]);

  useEffect(() => {
    prevInvoicesRef.current = invoices;
  }, [invoices]);

  const fetchInvoices = useCallback(async () => {
    const scopeId = effectiveOwnerId;
    if (!scopeId) {
      setInvoices([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("user_id", scopeId)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("[useInvoices] fetch error:", error);
        setInvoices([]);
      } else {
        setInvoices((data || []) as Invoice[]);
      }
    } catch (e) {
      console.error("[useInvoices] fetch exception:", e);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [effectiveOwnerId]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // ── Canlı senkron: Supabase Realtime + sekme/odak değişiminde refetch ──
  // Mobil tarayıcılarda uygulama arka plana alınıp tekrar açıldığında veriyi
  // taze tutmak için visibilitychange/focus, ve diğer cihazlardan yapılan
  // değişiklikleri anında yansıtmak için Postgres changes aboneliği kullanılır.
  useEffect(() => {
    const userId = effectiveOwnerId;
    if (!userId) return;

    // 1) Realtime kanal — bu kullanıcıya ait invoices satırlarındaki değişiklikler
    const channel = supabase
      .channel(`invoices-rt-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices", filter: `user_id=eq.${userId}` },
        () => { fetchInvoices(); }
      )
      .subscribe();

    // 2) Sekme tekrar görünür olduğunda / pencere odaklandığında / online olunca
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchInvoices();
    };
    const onFocus = () => fetchInvoices();
    const onOnline = () => fetchInvoices();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    return () => {
      try { supabase.removeChannel(channel); } catch {}
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [effectiveOwnerId, fetchInvoices]);

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

  const uploadAndAnalyze = useCallback(async (file: File, period?: { year: number; month: number }): Promise<InvoiceAnalysisResult | null> => {
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
      const isPayrollDoc = (aiData?.header?.invoice_type || "").toLowerCase().includes("lohn");
      if (aiData?.items && Array.isArray(aiData.items) && !isPayrollDoc) {
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

      const isDuplicate = prevInvoicesRef.current.some(inv =>
        inv.fatura_no === mappedResult.fatura_bilgileri.invoice_number &&
        inv.satici_adi === mappedResult.fatura_bilgileri.supplier_name
      );
      if (isDuplicate) {
        mappedResult.uyarilar.push("Mükerrer Fatura: Bu dosya/fatura numarası daha önce yüklenmiş görünüyor.");
      }

      // ── Dosyayı Storage'a yükle (paylaşımlı erişim için) ──
      let storedFileUrl: string | null = null;
      try {
        const safeName = file.name.replace(/[^\w.\-]/g, "_");
        const path = `${currentSession.user.id}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("invoices")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          console.warn("[useInvoices] Storage upload uyarı:", upErr.message);
        } else {
          const { data: pub } = supabase.storage.from("invoices").getPublicUrl(path);
          storedFileUrl = pub?.publicUrl ?? null;
        }
      } catch (storageErr: any) {
        console.warn("[useInvoices] Storage exception:", storageErr?.message);
      }

      // Kullanıcı dönem seçtiyse faturayı o döneme zorla (tarih ayın 1'i olarak ayarlanır)
      let overriddenTarih: string | null = null;
      if (period && period.year && period.month) {
        const mm = String(period.month).padStart(2, "0");
        overriddenTarih = `${period.year}-${mm}-01`;
        mappedResult.fatura_bilgileri.invoice_date = overriddenTarih;
        if (mappedResult.header) mappedResult.header.invoice_date = overriddenTarih;
      }

      // ── DB'ye kaydet ──
      let dbInvoiceId: string | null = null;
      try {
        const { data: dbRow, error: dbErr } = await supabase
          .from("invoices")
          .insert({
            file_url: storedFileUrl,
            user_id: effectiveOwnerId || currentSession.user.id,
            created_by: currentSession.user.id,
            fatura_no: mappedResult.fatura_bilgileri.invoice_number || null,
            tarih: overriddenTarih ?? ((mappedResult.fatura_bilgileri.invoice_date && /^\d{4}-\d{2}-\d{2}/.test(mappedResult.fatura_bilgileri.invoice_date)) ? mappedResult.fatura_bilgileri.invoice_date.substring(0,10) : null),
            period_year: period?.year ?? null,
            period_month: period?.month ?? null,
            satici_vkn: mappedResult.fatura_bilgileri.supplier_vat_id || null,
            satici_adi: mappedResult.fatura_bilgileri.supplier_name || null,
            alici_vkn: mappedResult.fatura_bilgileri.buyer_vat_id || null,
            alici_adi: mappedResult.fatura_bilgileri.buyer_name || null,
            ara_toplam: mappedResult.finansal_ozet.ara_toplam || 0,
            toplam_kdv: mappedResult.finansal_ozet.toplam_kdv || 0,
            genel_toplam: mappedResult.finansal_ozet.genel_toplam || 0,
            status: isDuplicate ? "mükerrer" : "analyzed",
            raw_ai_response: mappedResult,
            uyarilar: mappedResult.uyarilar || [],
            file_name: file.name,
          })
          .select("id")
          .single();
        if (dbErr) {
          console.error("[useInvoices] DB insert error:", dbErr);
          throw new Error("Fatura DB'ye kaydedilemedi: " + dbErr.message);
        }
        dbInvoiceId = dbRow?.id ?? null;
      } catch (dbException: any) {
        console.error("[useInvoices] DB insert exception:", dbException);
        throw dbException;
      }

      const mockInvoiceId = dbInvoiceId || ("mock-" + Date.now().toString());

      const mockInvoice: Invoice = {
        id: mockInvoiceId,
        user_id: effectiveOwnerId || currentSession.user.id,
        fatura_no: mappedResult.fatura_bilgileri.invoice_number || null,
        tarih: overriddenTarih || mappedResult.fatura_bilgileri.invoice_date || null,
        period_year: period?.year ?? null,
        period_month: period?.month ?? null,
        satici_vkn: mappedResult.fatura_bilgileri.supplier_vat_id || null,
        satici_adi: mappedResult.fatura_bilgileri.supplier_name || null,
        satici_adres: mappedResult.fatura_bilgileri.supplier_address || null,
        alici_vkn: mappedResult.fatura_bilgileri.buyer_vat_id || null,
        alici_adi: mappedResult.fatura_bilgileri.buyer_name || null,
        alici_adres: mappedResult.fatura_bilgileri.buyer_address || null,
        ara_toplam: mappedResult.finansal_ozet.ara_toplam,
        toplam_kdv: mappedResult.finansal_ozet.toplam_kdv,
        genel_toplam: mappedResult.finansal_ozet.genel_toplam,
        status: isDuplicate ? "mükerrer" : "analyzed",
        raw_ai_response: mappedResult,
        uyarilar: mappedResult.uyarilar,
        file_url: storedFileUrl || `data:${file.type};base64,${base64}`,
        created_at: new Date().toISOString()
      };

      // Invoices listesini yalnızca React state üzerinden güncelle (DB KAPALI)
      setInvoices(prev => [mockInvoice, ...prev]);

      // Abonelik sistemi kaldırıldı — sayaç artırma yok

      return mappedResult as InvoiceAnalysisResult;
    } catch (err: any) {
      console.error("[useInvoices] uploadAndAnalyze error:", err);
      throw new Error(err?.message || "Bir hata oluştu");
    } finally {
      setUploading(false);
    }
  }, [fetchInvoices]);

  const createManualInvoice = useCallback(async (payload: {
    fatura_no: string;
    tarih: string;
    donem_baslangic?: string;
    donem_bitis?: string;
    satici_adi: string;
    satici_vkn?: string;
    satici_adres?: string;
    alici_adi: string;
    alici_vkn?: string;
    alici_adres?: string;
    items: Array<{
      urun_adi: string;
      miktar: number;
      kdv_orani: number;
      net: number;
      gross: number;
      hesap_kodu?: string;
      hesap_adi?: string;
    }>;
    notlar?: string;
  }): Promise<Invoice> => {
    let { data: { session: currentSession } } = await supabase.auth.getSession();
    if (!currentSession?.user?.id) {
      throw new Error("Oturum bulunamadı. Lütfen tekrar giriş yapın.");
    }
    const userId = effectiveOwnerId || currentSession.user.id;
    const createdBy = currentSession.user.id;

    const ara_toplam = payload.items.reduce((s, it) => s + (Number(it.net) || 0), 0);
    const genel_toplam = payload.items.reduce((s, it) => s + (Number(it.gross) || 0), 0);
    const toplam_kdv = +(genel_toplam - ara_toplam).toFixed(2);

    const header = {
      invoice_number: payload.fatura_no,
      invoice_date: payload.tarih,
      period_start: payload.donem_baslangic || null,
      period_end: payload.donem_bitis || null,
      supplier_name: payload.satici_adi,
      supplier_vat_id: payload.satici_vkn || null,
      supplier_address: payload.satici_adres || null,
      buyer_name: payload.alici_adi,
      buyer_vat_id: payload.alici_vkn || null,
      buyer_address: payload.alici_adres || null,
      total_net: ara_toplam,
      total_vat: toplam_kdv,
      total_gross: genel_toplam,
      manual_entry: true,
    };

    const mappedItems = payload.items.map((it) => ({
      description: it.urun_adi,
      urun_adi: it.urun_adi,
      quantity: it.miktar,
      miktar: it.miktar,
      vat_rate: it.kdv_orani,
      kdv_orani: it.kdv_orani,
      net_amount: it.net,
      gross_amount: it.gross,
      satir_toplami: it.gross,
      account_code: it.hesap_kodu || null,
      hesap_kodu: it.hesap_kodu || null,
      account_name: it.hesap_adi || null,
      account_name_tr: it.hesap_adi || null,
      match_justification: "Manuel olarak girildi",
      match_score: 100,
    }));

    const mappedResult = {
      header,
      fatura_bilgileri: header,
      items: mappedItems,
      kalemler: mappedItems,
      finansal_ozet: { ara_toplam, toplam_kdv, genel_toplam },
      uyarilar: payload.notlar ? [payload.notlar] : [],
      manual: true,
    };

    let dbInvoiceId: string | null = null;
    try {
      const { data: dbRow, error: dbErr } = await supabase
        .from("invoices")
        .insert({
          file_url: null,
          user_id: userId,
          created_by: createdBy,
          fatura_no: payload.fatura_no || null,
          tarih: /^\d{4}-\d{2}-\d{2}/.test(payload.tarih) ? payload.tarih.substring(0, 10) : null,
          satici_vkn: payload.satici_vkn || null,
          satici_adi: payload.satici_adi || null,
          alici_vkn: payload.alici_vkn || null,
          alici_adi: payload.alici_adi || null,
          ara_toplam,
          toplam_kdv,
          genel_toplam,
          status: "analyzed",
          raw_ai_response: mappedResult,
          uyarilar: mappedResult.uyarilar,
          file_name: `manuel_${payload.fatura_no || Date.now()}`,
        })
        .select("id")
        .single();
      if (dbErr) {
        console.error("[useInvoices] manual insert error:", dbErr);
        throw new Error("Manuel fatura kaydedilemedi: " + dbErr.message);
      }
      dbInvoiceId = dbRow?.id ?? null;
    } catch (e: any) {
      console.error("[useInvoices] manual insert exception:", e);
      throw e;
    }

    const newInvoice: Invoice = {
      id: dbInvoiceId || ("mock-" + Date.now().toString()),
      user_id: userId,
      fatura_no: payload.fatura_no,
      tarih: payload.tarih,
      satici_vkn: payload.satici_vkn || null,
      satici_adi: payload.satici_adi,
      satici_adres: payload.satici_adres || null,
      alici_vkn: payload.alici_vkn || null,
      alici_adi: payload.alici_adi,
      alici_adres: payload.alici_adres || null,
      ara_toplam,
      toplam_kdv,
      genel_toplam,
      status: "analyzed",
      raw_ai_response: mappedResult,
      uyarilar: mappedResult.uyarilar,
      file_url: null,
      created_at: new Date().toISOString(),
    };

    setInvoices((prev) => [newInvoice, ...prev]);
    return newInvoice;
  }, []);

  const deleteInvoice = useCallback(async (invoiceId: string) => {
    // Mock id (DB'ye girmemiş) ise sadece state'ten sil
    if (!invoiceId.startsWith("mock-")) {
      const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
      if (error) {
        console.error("[useInvoices] delete error:", error);
        throw new Error(error.message);
      }
    }
    setInvoices(prev => prev.filter(i => i.id !== invoiceId));
  }, []);

  const updateInvoice = useCallback(async (invoiceId: string, updates: Partial<Invoice>) => {
    let persistPayload: any = null;
    setInvoices(prev => prev.map(inv => {
      if (inv.id !== invoiceId) return inv;
      const updated: any = { ...inv, ...updates };
      // raw_ai_response içindeki header bilgilerini de güncelle
      if (updated.raw_ai_response) {
        const header = { ...(updated.raw_ai_response.header || updated.raw_ai_response.fatura_bilgileri || {}) };
        if (updates.fatura_no !== undefined) header.invoice_number = updates.fatura_no;
        if (updates.tarih !== undefined) header.invoice_date = updates.tarih;
        if (updates.satici_adi !== undefined) header.supplier_name = updates.satici_adi;
        if (updates.satici_vkn !== undefined) header.supplier_vat_id = updates.satici_vkn;
        if (updates.alici_vkn !== undefined) header.buyer_vat_id = updates.alici_vkn;
        if ((updates as any).alici_adi !== undefined) header.buyer_name = (updates as any).alici_adi;
        if (updates.ara_toplam !== undefined) header.total_net = updates.ara_toplam;
        if (updates.toplam_kdv !== undefined) header.total_vat = updates.toplam_kdv;
        if (updates.genel_toplam !== undefined) header.total_gross = updates.genel_toplam;
        updated.raw_ai_response = {
          ...updated.raw_ai_response,
          header: { ...header },
          fatura_bilgileri: { ...header },
        };
      }
      if (!updated.status || updated.status === "error") {
        updated.status = "analyzed";
      }
      // Supabase'e yazılacak alanları topla
      persistPayload = {
        fatura_no: updated.fatura_no,
        tarih: updated.tarih,
        satici_adi: updated.satici_adi,
        satici_vkn: updated.satici_vkn,
        alici_adi: updated.alici_adi,
        alici_vkn: updated.alici_vkn,
        ara_toplam: updated.ara_toplam,
        toplam_kdv: updated.toplam_kdv,
        genel_toplam: updated.genel_toplam,
        raw_ai_response: updated.raw_ai_response,
        status: updated.status,
      };
      return updated;
    }));
    if (persistPayload) {
      const { error } = await supabase.from("invoices").update(persistPayload).eq("id", invoiceId);
      if (error) console.error("[useInvoices] updateInvoice persist error:", error);
    }
  }, []);

  const updateInvoiceItems = useCallback(async (invoiceId: string, updatedItems: any[]) => {
    let newRaw: any = null;
    let newAra = 0, newKdv = 0, newGenel = 0;
    for (const it of updatedItems) {
      const net = Number(it.net_amount ?? it.net_tutar ?? 0) || 0;
      const vat = Number(it.vat_amount ?? it.kdv_tutar ?? 0) || 0;
      const gross = Number(it.gross_amount ?? it.brut_tutar ?? (net + vat)) || 0;
      newAra += net;
      newKdv += vat;
      newGenel += gross;
    }
    newAra = +newAra.toFixed(2);
    newKdv = +newKdv.toFixed(2);
    newGenel = +newGenel.toFixed(2);

    setInvoices(prev => prev.map(inv => {
      if (inv.id !== invoiceId) return inv;
      const updated: any = { ...inv };
      const baseRaw: any = updated.raw_ai_response || {};
      const newHeader = { ...(baseRaw.header || {}), total_net: newAra, total_vat: newKdv, total_gross: newGenel };
      const newFatBilg = { ...(baseRaw.fatura_bilgileri || {}) };
      const newFinOzet = { ...(baseRaw.finansal_ozet || {}), ara_toplam: newAra, toplam_kdv: newKdv, genel_toplam: newGenel };
      updated.raw_ai_response = {
        ...baseRaw,
        items: updatedItems,
        kalemler: updatedItems,
        header: newHeader,
        fatura_bilgileri: newFatBilg,
        finansal_ozet: newFinOzet,
      };
      updated.ara_toplam = newAra;
      updated.toplam_kdv = newKdv;
      updated.genel_toplam = newGenel;
      newRaw = updated.raw_ai_response;
      return updated;
    }));
    if (newRaw && !invoiceId.startsWith("mock-")) {
      const { error } = await supabase
        .from("invoices")
        .update({
          raw_ai_response: newRaw,
          ara_toplam: newAra,
          toplam_kdv: newKdv,
          genel_toplam: newGenel,
        })
        .eq("id", invoiceId);
      if (error) console.error("[useInvoices] updateInvoiceItems persist error:", error);
    }
  }, []);

  // ─────────────────────────────────────────────
  //  TEKRAR ANALİZ — Sadece admin
  //  Mevcut bir faturanın depoda saklı dosyasını yeniden indirip
  //  super-worker (Claude Haiku 4.5) ile baştan analiz eder ve
  //  invoices tablosundaki satırı yerinde günceller.
  // ─────────────────────────────────────────────
  const reanalyzeInvoice = useCallback(async (invoice: Invoice): Promise<{ changedFields: string[] }> => {
    if (!invoice?.id) throw new Error("Geçersiz fatura");
    if (!invoice.file_url) throw new Error("Bu faturanın saklı dosyası yok, tekrar analiz yapılamaz.");

    // Oturum
    let { data: { session: currentSession } } = await supabase.auth.getSession();
    if (currentSession?.expires_at && currentSession.expires_at * 1000 < Date.now() + 30000) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed.session) currentSession = refreshed.session;
    }
    if (!currentSession?.access_token) throw new Error("Oturum bulunamadı");

    // Dosyayı indir → base64
    const resp = await fetch(invoice.file_url);
    if (!resp.ok) throw new Error("Dosya indirilemedi: HTTP " + resp.status);
    const blob = await resp.blob();
    const fileType = blob.type || "application/pdf";
    const arrBuf = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrBuf);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)) as any);
    }
    const base64 = btoa(binary);

    // Kullanıcı bağlamı
    const currentUserId = currentSession?.user?.id;
    const rules = getLearningRules(currentUserId);
    let activeSettingsRules: any[] = [];
    let companyName = "";
    let companyVatId = "";
    try {
      const settingsKey = currentUserId ? `fibu_de_settings_${currentUserId}` : "fibu_de_settings";
      const settingsData = localStorage.getItem(settingsKey);
      if (settingsData) {
        const parsed = JSON.parse(settingsData);
        if (Array.isArray(parsed?.rules)) activeSettingsRules = parsed.rules.filter((r: any) => r.active === true);
        companyName = parsed?.company?.company_name || "";
        companyVatId = parsed?.company?.ust_id || "";
      }
    } catch {}

    // Super-worker (Haiku 4.5) yeniden çalıştır
    const { data, error } = await supabase.functions.invoke("super-worker", {
      body: { fileBase64: base64, fileType, learningRules: rules, settingsRules: activeSettingsRules, companyName, companyVatId },
    });
    if (error) throw new Error("Sunucu hatası: " + (error.message || ""));
    if (!data?.success) throw new Error(data?.error || "Tekrar analiz başarısız");

    const aiData = data.data;
    const mappedResult: any = {
      ...aiData,
      fatura_bilgileri: aiData?.header || {},
      finansal_ozet: {
        ara_toplam: aiData?.header?.total_net || 0,
        toplam_kdv: aiData?.header?.total_vat || 0,
        genel_toplam: aiData?.header?.total_gross || 0,
      },
      kalemler: aiData?.items || [],
      uyarilar: aiData?.context ? [aiData.context] : [],
    };

    // Önceki manuel ayarlanan dönemi koru (kullanıcı set ettiyse)
    const prevFb: any = (invoice as any).raw_ai_response?.fatura_bilgileri || (invoice as any).raw_ai_response?.header || {};
    if (prevFb.period_start || prevFb.period_end) {
      mappedResult.fatura_bilgileri.period_start = prevFb.period_start || mappedResult.fatura_bilgileri.period_start || null;
      mappedResult.fatura_bilgileri.period_end = prevFb.period_end || mappedResult.fatura_bilgileri.period_end || null;
      mappedResult.header = { ...(mappedResult.header || {}), period_start: mappedResult.fatura_bilgileri.period_start, period_end: mappedResult.fatura_bilgileri.period_end };
    }

    const updatePayload: any = {
      fatura_no: mappedResult.fatura_bilgileri.invoice_number || null,
      tarih: (mappedResult.fatura_bilgileri.invoice_date && /^\d{4}-\d{2}-\d{2}/.test(mappedResult.fatura_bilgileri.invoice_date)) ? mappedResult.fatura_bilgileri.invoice_date.substring(0, 10) : null,
      satici_vkn: mappedResult.fatura_bilgileri.supplier_vat_id || null,
      satici_adi: mappedResult.fatura_bilgileri.supplier_name || null,
      alici_vkn: mappedResult.fatura_bilgileri.buyer_vat_id || null,
      alici_adi: mappedResult.fatura_bilgileri.buyer_name || null,
      ara_toplam: mappedResult.finansal_ozet.ara_toplam || 0,
      toplam_kdv: mappedResult.finansal_ozet.toplam_kdv || 0,
      genel_toplam: mappedResult.finansal_ozet.genel_toplam || 0,
      status: "analyzed",
      raw_ai_response: mappedResult,
      uyarilar: mappedResult.uyarilar || [],
    };

    const { error: dbErr } = await supabase.from("invoices").update(updatePayload).eq("id", invoice.id);
    if (dbErr) throw new Error("DB güncelleme hatası: " + dbErr.message);

    // Değişen alanları hesapla (görsel highlight için)
    const num = (v: any) => Number(v || 0);
    const norm = (v: any) => String(v ?? "").trim().toLowerCase();
    const before: any = invoice;
    const after: any = { ...invoice, ...updatePayload };
    const changedFields: string[] = [];
    if (norm(before.fatura_no) !== norm(after.fatura_no)) changedFields.push("fatura_no");
    if (norm(before.tarih) !== norm(after.tarih)) changedFields.push("tarih");
    if (norm(before.satici_adi) !== norm(after.satici_adi)) changedFields.push("satici_adi");
    if (norm(before.satici_vkn) !== norm(after.satici_vkn)) changedFields.push("satici_vkn");
    if (norm(before.alici_adi) !== norm(after.alici_adi)) changedFields.push("alici_adi");
    if (norm(before.alici_vkn) !== norm(after.alici_vkn)) changedFields.push("alici_vkn");
    if (Math.abs(num(before.ara_toplam) - num(after.ara_toplam)) > 0.005) changedFields.push("ara_toplam");
    if (Math.abs(num(before.toplam_kdv) - num(after.toplam_kdv)) > 0.005) changedFields.push("toplam_kdv");
    if (Math.abs(num(before.genel_toplam) - num(after.genel_toplam)) > 0.005) changedFields.push("genel_toplam");
    const beforeItemCount = (before?.raw_ai_response?.kalemler || before?.raw_ai_response?.items || []).length;
    const afterItemCount = (after?.raw_ai_response?.kalemler || after?.raw_ai_response?.items || []).length;
    if (beforeItemCount !== afterItemCount) changedFields.push("kalemler");

    // Local state senkron
    setInvoices(prev => prev.map(inv => inv.id === invoice.id ? { ...inv, ...updatePayload } : inv));

    return { changedFields };
  }, []);

  return {
    invoices,
    loading,
    uploading,
    fetchInvoices,
    fetchInvoiceItems,
    uploadAndAnalyze,
    createManualInvoice,
    deleteInvoice,
    updateInvoice,
    updateInvoiceItems,
    reanalyzeInvoice,
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
