import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  X, Send, Loader2, AlertTriangle, CheckCheck, Sparkles, Rocket, Users2,
  Wand2, MessageSquare,
} from "lucide-react";
import { useSmAccounts } from "../../../services/sosyal/useSmAccounts";
import { useSmYayin } from "../../../services/sosyal/useSmYayin";
import { useSmOtomasyon } from "../../../services/sosyal/useSmOtomasyon";
import { useSmSeo, useSmSeoOneri } from "../../../services/sosyal/useSmSeo";
import { metinKur, ONERILEN_KURAL } from "../../../services/sosyal/otomasyonMetin";
import type {
  SmMedya, MusteriId, SmYayinFormat, SmYayinHedefi,
} from "../../../services/sosyal/types";
import {
  FONT_BASLIK, FONT_METIN, SM_RENK, YAYIN_PLATFORMLARI, CAPTION_SINIRI,
  buton, videoMu, formatlar,
} from "../ortak";
import { useEkran } from "../ekran";
import { HedefKarti, type HedefDurumu } from "./HedefKarti";
import { YayinSatiri } from "./YayinSatiri";
import { YayinOnizleme } from "./YayinOnizleme";

interface Props {
  medya: SmMedya;
  url?: string;
  ownerId: string | undefined;
  customerId: MusteriId;
  lang: string;
  onKapat: () => void;
  /** Yayın başarıyla başladığında kütüphaneyi tazelemek için. */
  onYayinlandi?: () => void;
}

/**
 * "Bu görseli nerede yayınlayayım?" ekranı.
 *
 * Sol yarı vitrin (önizleme + metin), sağ yarı karar (hedefler + metin).
 * Yayına basıldığında aynı modal canlı durum görünümüne geçer — kullanıcı
 * pencereyi kapatıp kuyruğa gitmek zorunda kalmasın.
 */
export const YayinModal: React.FC<Props> = ({
  medya, url, ownerId, customerId, lang, onKapat, onYayinlandi,
}) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);
  const ekran = useEkran();
  const video = videoMu(medya.mime_tipi);

  const { hesaplar, loading: hesaplarYukleniyor } = useSmAccounts(ownerId, customerId);
  const {
    yayinlar, baslat, tekrarDene, iptal, gonderiliyor, hata,
  } = useSmYayin(ownerId, customerId);

  const [ortakCaption, setOrtakCaption] = useState(medya.aciklama || "");
  const [secimler, setSecimler] = useState<Record<string, HedefDurumu>>({});
  const [asama, setAsama] = useState<"secim" | "durum">("secim");
  const [yerelHata, setYerelHata] = useState<string | null>(null);
  /** Otomasyon bu gönderi için uygulansın mı (kural açık olsa bile). */
  const [otomasyonAcik, setOtomasyonAcik] = useState(true);

  const {
    kuralAl, kaydet: otomasyonKaydet, kaydediliyor: otomasyonKaydediliyor,
  } = useSmOtomasyon(ownerId, customerId);

  const buMedyaninYayinlari = useMemo(
    () => yayinlar.filter((y) => y.media_id === medya.id),
    [yayinlar, medya.id],
  );

  // Bu medyanın devam eden işi varsa modal doğrudan durum görünümünde açılsın.
  // Yalnızca İLK yüklemede karar verilir — kullanıcı sonra "yeni yayın"a
  // dönebilmeli, her tazelemede zorla durum ekranına atılmamalı.
  const ilkKarar = useRef(false);
  useEffect(() => {
    if (ilkKarar.current || !yayinlar.length) return;
    ilkKarar.current = true;
    if (buMedyaninYayinlari.some((y) => y.durum === "kuyrukta" || y.durum === "yayinlaniyor")) {
      setAsama("durum");
    }
  }, [yayinlar, buMedyaninYayinlari]);

  // Esc ile kapat + arkadaki sayfa kaymasın (özellikle mobilde önemli).
  useEffect(() => {
    const tus = (e: KeyboardEvent) => { if (e.key === "Escape") onKapat(); };
    window.addEventListener("keydown", tus);
    const öncekiOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tus);
      document.body.style.overflow = öncekiOverflow;
    };
  }, [onKapat]);

  /** Hesap seçilebilir mi; değilse sebebi. */
  const engelBul = (platform: string, dogrulandi: boolean): string | null => {
    if (!YAYIN_PLATFORMLARI.includes(platform as any)) return tr("Yakında", "Bald");
    if (!dogrulandi) return tr("Doğrulanmamış", "Nicht geprüft");
    // Platformun bu medya tipi için hiç formatı yoksa hedef seçilemez.
    // (YouTube görsel kabul etmiyor → formatlar() boş döner.)
    if (!formatlar(platform as any, video).length) {
      return tr("Video gerekir", "Video nötig");
    }
    return null;
  };

  const durumAl = (hesapId: string, platform: string): HedefDurumu =>
    secimler[hesapId] ?? {
      secili: false,
      format: (formatlar(platform as any, video)[0] ?? (video ? "reel" : "feed")) as SmYayinFormat,
      ozelCaption: null,
    };

  const degistir = (hesapId: string, platform: string, yama: Partial<HedefDurumu>) =>
    setSecimler((önce) => ({
      ...önce,
      [hesapId]: { ...durumAl(hesapId, platform), ...yama },
    }));

  const secilebilirler = hesaplar.filter((h) => !engelBul(h.platform, h.dogrulandi));
  const seciliIdler = secilebilirler
    .filter((h) => durumAl(h.id, h.platform).secili)
    .map((h) => h.id);
  const hepsiSecili = !!secilebilirler.length && seciliIdler.length === secilebilirler.length;

  const hepsiniDegistir = () => {
    const yeni: Record<string, HedefDurumu> = { ...secimler };
    for (const h of secilebilirler) {
      yeni[h.id] = { ...durumAl(h.id, h.platform), secili: !hepsiSecili };
    }
    setSecimler(yeni);
  };

  /**
   * Otomasyonun bu gönderiye ne ekleyeceğinin önizlemesi.
   *
   * Seçili ilk hedef üzerinden hesaplanır (hedef yoksa listedeki ilk hesap):
   * her platform için ayrı bir blok göstermek modali okunmaz hâle getirirdi;
   * platformlar arasında değişen tek şey zaten "yorum mu, metin altı mı".
   *
   * Kural açık olsa da olmasa da HESAPLANIR — blok kaybolmasın ki kullanıcı
   * kapattığı otomasyonu geri açabilsin.
   */
  const onizlemeHesabi =
    secilebilirler.find((h) => durumAl(h.id, h.platform).secili) ?? secilebilirler[0] ?? null;

  /**
   * SEO ajanı: her hedef için başlık + açıklama + hashtag'i AI üretir.
   *
   * İki tetikleme var:
   *   · Otomatik → profil "gonderi" + otomatik üretim açıksa modal açılınca.
   *   · Elle     → "AI ile üret" düğmesi (moddan bağımsız çalışır).
   *
   * Kritik: sm-publish AYNI satırı okuyor. Bu yüzden aşağıda görülen metin,
   * yayınlanacak metnin ta kendisidir.
   */
  const { profil: seoProfil } = useSmSeo(ownerId, customerId);
  const seoOto = seoProfil.hashtag_modu === "gonderi"
    && seoProfil.otomatik_uret
    && otomasyonAcik;
  const { oneriBul, yukleniyor: seoYukleniyor, uret: seoUret, hata: seoHata } = useSmSeoOneri(
    ownerId, customerId, medya.id,
    {
      oto: seoOto,
      platformlar: [...new Set(secilebilirler.map((h) => h.platform))],
      format: onizlemeHesabi
        ? durumAl(onizlemeHesabi.id, onizlemeHesabi.platform).format
        : null,
    },
  );

  const oneri = onizlemeHesabi && otomasyonAcik
    ? oneriBul(onizlemeHesabi.platform, durumAl(onizlemeHesabi.id, onizlemeHesabi.platform).format)
    : null;

  /**
   * "AI ile üret" — moddan bağımsız. Ürettikten sonra her seçili hedefin
   * caption'ını kendi platformunun AI metniyle DOLDURUR: kullanıcı gördüğünü
   * düzenleyebilsin ve yayınlanan metin gördüğüyle birebir olsun. Başlık ve
   * hashtag'ler öneri satırından yayına gider (sm-publish onları okur).
   */
  const aiUret = async () => {
    setYerelHata(null);
    try {
      const satirlar = await seoUret(true);
      if (!satirlar.length) return;
      setSecimler((önce) => {
        const yeni = { ...önce };
        for (const h of secilebilirler) {
          const d = durumAl(h.id, h.platform);
          const r = satirlar.find((x) => x.platform === h.platform && x.format === d.format)
                 ?? satirlar.find((x) => x.platform === h.platform);
          if (r?.caption) yeni[h.id] = { ...d, ozelCaption: r.caption };
        }
        return yeni;
      });
    } catch {
      // hata seoHata'da; ayrıca yerelHata gösterimi için sm-seo mesajı kullanılır.
    }
  };

  const otomasyon = onizlemeHesabi
    ? metinKur({
        kural: kuralAl(onizlemeHesabi.platform),
        // Kullanıcı bir şey yazdıysa o kazanır; yazmadıysa ajanın metni taban.
        // sm-publish'teki hamCaption seçimiyle BİREBİR aynı kural.
        caption: durumAl(onizlemeHesabi.id, onizlemeHesabi.platform).ozelCaption
          ?? (ortakCaption.trim() || oneri?.caption || ortakCaption),
        platform: onizlemeHesabi.platform,
        format: durumAl(onizlemeHesabi.id, onizlemeHesabi.platform).format,
        tohum: medya.id,
        baslik: oneri?.baslik ?? medya.baslik,
        handle: onizlemeHesabi.handle,
        captionSiniri: CAPTION_SINIRI[onizlemeHesabi.platform] ?? 2200,
        hazirHashtagler: oneri?.hashtagler ?? null,
        hazirYorum: oneri?.ilk_yorum ?? null,
      })
    : null;

  const otomasyonVar = !!otomasyon && (!!otomasyon.hashtagler.length || !!otomasyon.yorum);

  /**
   * Kural hiç kurulmamış (ya da kapalı). Bu durumda blok SESSİZCE GİZLENMEZ:
   * kullanıcı "otomatik hashtag nerede?" diye ekrana bakıp cevap bulamazdı.
   * Bunun yerine tek tıkla önerilen kurulumu açan bir şerit gösterilir —
   * "zahmet etmeden" isteğinin karşılığı, ayar sekmesine yolculuk değil.
   */
  const kuralYok = !!onizlemeHesabi && !otomasyonVar;

  const otomasyonuKur = async () => {
    setYerelHata(null);
    try {
      await otomasyonKaydet({
        aktif: true,
        hashtag_havuzu: ONERILEN_KURAL.hashtag_havuzu,
        sabit_hashtagler: ONERILEN_KURAL.sabit_hashtagler,
        hashtag_adet: ONERILEN_KURAL.hashtag_adet,
        hashtag_yeri: ONERILEN_KURAL.hashtag_yeri,
        yorum_aktif: ONERILEN_KURAL.yorum_aktif,
        yorum_sablonlari: ONERILEN_KURAL.yorum_sablonlari,
      });
      setOtomasyonAcik(true);
    } catch (e: any) {
      setYerelHata(e?.message || tr("Otomasyon açılamadı.", "Automatik konnte nicht aktiviert werden."));
    }
  };

  const gonder = async () => {
    setYerelHata(null);
    const hedefler: SmYayinHedefi[] = secilebilirler
      .filter((h) => durumAl(h.id, h.platform).secili)
      .map((h) => {
        const d = durumAl(h.id, h.platform);
        return {
          accountId: h.id,
          format: d.format,
          caption: (d.ozelCaption ?? ortakCaption).trim() || undefined,
        };
      });

    if (!hedefler.length) {
      setYerelHata(tr("En az bir hedef seçin.", "Mindestens ein Ziel auswählen."));
      return;
    }
    try {
      await baslat(medya.id, hedefler, otomasyonAcik);
      setAsama("durum");
      onYayinlandi?.();
    } catch {
      // hata state'i hook'tan geliyor; burada ek bir şey yapmaya gerek yok.
    }
  };

  const genislik = ekran.mobil ? "100vw" : ekran.tablet ? "94vw" : "min(1020px, 94vw)";
  const yukseklik = ekran.mobil ? "100dvh" : "min(88vh, 760px)";

  return (
    <div
      onClick={onKapat}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(2,6,23,.62)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: ekran.mobil ? "flex-end" : "center",
        justifyContent: "center", padding: ekran.mobil ? 0 : 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width: genislik, maxHeight: yukseklik, height: ekran.mobil ? yukseklik : "auto",
          background: "var(--panel)",
          border: ekran.mobil ? "none" : "1px solid var(--border)",
          borderRadius: ekran.mobil ? "16px 16px 0 0" : 20,
          boxShadow: "0 30px 80px rgba(2,6,23,.45)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* Başlık şeridi */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          padding: "13px 15px", borderBottom: "1px solid var(--border)",
          background: `linear-gradient(120deg, ${SM_RENK}12, transparent 55%)`,
        }}>
          <span style={{
            width: 32, height: 32, borderRadius: 10, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: `linear-gradient(140deg, ${SM_RENK}, #6228d7)`, color: "#fff",
          }}>
            <Rocket size={16} />
          </span>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text-1)", fontFamily: FONT_BASLIK }}>
              {asama === "secim" ? tr("Yayınla", "Veröffentlichen") : tr("Yayın durumu", "Veröffentlichungsstatus")}
            </span>
            <span style={{
              fontSize: 10.5, color: "var(--text-3)", fontFamily: FONT_METIN,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {asama === "secim"
                ? tr("Nerede yayınlansın? Birini, birkaçını ya da hepsini seçin.",
                     "Wo soll es erscheinen? Eines, mehrere oder alle auswählen.")
                : medya.baslik || tr("(başlıksız)", "(ohne Titel)")}
            </span>
          </div>
          <button onClick={onKapat} aria-label={tr("Kapat", "Schließen")} style={{
            display: "flex", padding: 7, borderRadius: 9, cursor: "pointer",
            background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text-2)",
          }}>
            <X size={15} />
          </button>
        </div>

        {/* Gövde */}
        <div style={{
          flex: 1, minHeight: 0, display: "flex",
          flexDirection: ekran.dar ? "column" : "row",
          overflowY: ekran.dar ? "auto" : "hidden",
        }}>
          <YayinOnizleme
            medya={medya} url={url} caption={ortakCaption} lang={lang} dar={ekran.dar}
          />

          <div style={{
            flex: 1, minWidth: 0, minHeight: 0,
            overflowY: ekran.dar ? "visible" : "auto",
            padding: 15, display: "flex", flexDirection: "column", gap: 12,
          }}>
            {asama === "secim" ? (
              <>
                {/* Ortak metin */}
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{
                    display: "flex", alignItems: "center", gap: 5,
                    fontSize: 10, fontWeight: 800, letterSpacing: ".04em",
                    color: "var(--text-3)", fontFamily: FONT_BASLIK,
                  }}>
                    <Sparkles size={11} style={{ color: SM_RENK }} />
                    {tr("ORTAK METİN", "GEMEINSAMER TEXT")}
                  </span>
                  <textarea
                    value={ortakCaption}
                    onChange={(e) => setOrtakCaption(e.target.value)}
                    rows={ekran.mobil ? 3 : 4}
                    placeholder={tr("Gönderi metni, hashtag'ler…", "Beitragstext, Hashtags…")}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 11, resize: "vertical",
                      background: "var(--panel-2)", border: "1px solid var(--border)",
                      color: "var(--text-1)", fontSize: 12.5, lineHeight: 1.55,
                      fontFamily: FONT_METIN, outline: "none",
                    }}
                  />
                </label>

                {/* AI ile üret — moddan bağımsız tek tuş. Her hedefin başlık,
                    açıklama ve etiketini kendi platformuna göre AI yazar. */}
                {onizlemeHesabi && otomasyonAcik && (
                  <button
                    type="button"
                    onClick={aiUret}
                    disabled={seoYukleniyor}
                    style={{
                      ...buton(SM_RENK, !oneri),
                      alignSelf: "flex-start",
                      cursor: seoYukleniyor ? "not-allowed" : "pointer",
                      opacity: seoYukleniyor ? 0.6 : 1,
                    }}
                  >
                    {seoYukleniyor ? <Loader2 size={12} className="spin" /> : <Wand2 size={12} />}
                    {seoYukleniyor
                      ? tr("AI yazıyor…", "KI schreibt…")
                      : oneri
                        ? tr("AI ile yeniden üret", "Mit KI neu erstellen")
                        : tr("AI ile başlık, açıklama ve etiket üret",
                             "Titel, Text & Hashtags mit KI erstellen")}
                  </button>
                )}

                {/* SEO ajanı hatası — üretim başarısızsa görünür (yayın durmaz) */}
                {seoHata && (
                  <div style={{
                    display: "flex", alignItems: "flex-start", gap: 7,
                    padding: "9px 12px", borderRadius: 12,
                    background: "#f59e0b14", border: "1px solid #f59e0b33",
                  }}>
                    <AlertTriangle size={13} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
                    <span style={{
                      fontSize: 11, lineHeight: 1.45, color: "var(--text-2)", fontFamily: FONT_METIN,
                    }}>
                      {seoHata}
                    </span>
                  </div>
                )}

                {/* Ajanın önerdiği başlık — YouTube'da yayına giden başlık budur */}
                {oneri?.baslik && (
                  <div style={{
                    display: "flex", flexDirection: "column", gap: 3,
                    padding: "9px 12px", borderRadius: 12,
                    background: "var(--panel-2)", border: "1px solid var(--border)",
                  }}>
                    <span style={{
                      fontSize: 9.5, fontWeight: 800, letterSpacing: ".04em",
                      color: "var(--text-3)", fontFamily: FONT_BASLIK,
                    }}>
                      {tr("AJANIN BAŞLIĞI", "TITEL DES AGENTEN")}
                    </span>
                    <span style={{
                      fontSize: 12, lineHeight: 1.5, color: "var(--text-1)",
                      fontFamily: FONT_METIN, wordBreak: "break-word",
                    }}>
                      {oneri.baslik}
                    </span>
                  </div>
                )}

                {/* Kural yok/kapalı → sessiz gizleme yerine tek tıklık kurulum */}
                {kuralYok && !seoYukleniyor && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                    padding: "9px 12px", borderRadius: 12,
                    background: "var(--panel-2)", border: "1px dashed var(--border-md)",
                  }}>
                    <Wand2 size={13} style={{ color: "var(--text-3)", flexShrink: 0 }} />
                    <span style={{
                      flex: 1, minWidth: 150, fontSize: 11, lineHeight: 1.45,
                      color: "var(--text-2)", fontFamily: FONT_METIN,
                    }}>
                      {tr("Otomatik hashtag ve ilk yorum kapalı.",
                          "Automatische Hashtags und erster Kommentar sind aus.")}
                    </span>
                    <button
                      type="button"
                      onClick={otomasyonuKur}
                      disabled={otomasyonKaydediliyor}
                      style={{
                        ...buton(SM_RENK),
                        cursor: otomasyonKaydediliyor ? "not-allowed" : "pointer",
                        opacity: otomasyonKaydediliyor ? 0.6 : 1,
                      }}
                    >
                      {otomasyonKaydediliyor ? <Loader2 size={12} className="spin" /> : <Wand2 size={12} />}
                      {tr("Önerilen ayarlarla aç", "Mit Empfehlung aktivieren")}
                    </button>
                  </div>
                )}

                {/* Otomasyonun ekleyecekleri — gönderi gitmeden ÖNCE görünür */}
                {otomasyonVar && otomasyon && (
                  <div style={{
                    display: "flex", flexDirection: "column", gap: 8,
                    padding: "10px 12px", borderRadius: 12,
                    background: otomasyonAcik ? `${SM_RENK}0d` : "var(--panel-2)",
                    border: `1px solid ${otomasyonAcik ? `${SM_RENK}2e` : "var(--border)"}`,
                    opacity: otomasyonAcik ? 1 : 0.65,
                    transition: "all .18s",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <Wand2 size={12} style={{ color: SM_RENK, flexShrink: 0 }} />
                      <span style={{
                        flex: 1, minWidth: 120, fontSize: 10, fontWeight: 800, letterSpacing: ".04em",
                        color: "var(--text-3)", fontFamily: FONT_BASLIK,
                      }}>
                        {!otomasyonAcik
                          ? tr("OTOMASYON KAPALI", "AUTOMATIK AUS")
                          : oneri
                            ? tr("SEO AJANI YAZDI", "VOM SEO-AGENTEN")
                            : tr("OTOMATİK EKLENECEK", "WIRD AUTOMATISCH ERGÄNZT")}
                      </span>
                      <button
                        type="button"
                        onClick={() => setOtomasyonAcik((ö) => !ö)}
                        style={{
                          background: "none", border: "none", padding: 0, cursor: "pointer",
                          fontSize: 10.5, fontWeight: 700, fontFamily: FONT_BASLIK,
                          color: otomasyonAcik ? "var(--text-3)" : SM_RENK,
                        }}
                      >
                        {otomasyonAcik
                          ? tr("Bu gönderi için kapat", "Für diesen Beitrag aus")
                          : tr("Geri aç", "Wieder an")}
                      </button>
                    </div>

                    {!!otomasyon.hashtagler.length && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {otomasyon.hashtagler.map((e) => (
                          <span key={e} style={{
                            fontSize: 10.5, fontWeight: 700, fontFamily: FONT_METIN,
                            padding: "2px 7px", borderRadius: 6,
                            background: "var(--panel)", color: SM_RENK,
                            border: `1px solid ${SM_RENK}2e`,
                          }}>
                            {e}
                          </span>
                        ))}
                      </div>
                    )}

                    {otomasyon.yorum && (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                        <MessageSquare size={12} style={{ color: "var(--text-3)", flexShrink: 0, marginTop: 2 }} />
                        <span style={{
                          flex: 1, minWidth: 0, fontSize: 11, lineHeight: 1.5,
                          color: "var(--text-2)", fontFamily: FONT_METIN,
                          whiteSpace: "pre-wrap", wordBreak: "break-word",
                        }}>
                          {otomasyon.yorum}
                        </span>
                      </div>
                    )}

                    <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: FONT_BASLIK, lineHeight: 1.4 }}>
                      {otomasyon.yer === "yorum"
                        ? tr("Etiketler gönderinin altına ilk yorum olarak yazılır.",
                             "Die Hashtags erscheinen als erster Kommentar unter dem Beitrag.")
                        : tr("Etiketler gönderi metninin sonuna eklenir.",
                             "Die Hashtags werden an den Beitragstext angehängt.")}
                      {" · "}
                      {oneri?.gerekce?.metin
                        || tr("Otomasyon sekmesinden değiştirilir.", "Änderbar im Tab „Automatik“.")}
                    </span>
                  </div>
                )}

                {/* Hedefler */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{
                    flex: 1, fontSize: 10, fontWeight: 800, letterSpacing: ".04em",
                    color: "var(--text-3)", fontFamily: FONT_BASLIK,
                  }}>
                    {tr("HEDEFLER", "ZIELE")}
                    {!!secilebilirler.length && ` · ${seciliIdler.length}/${secilebilirler.length}`}
                  </span>
                  {secilebilirler.length > 1 && (
                    <button onClick={hepsiniDegistir} style={buton(SM_RENK, hepsiSecili)}>
                      <CheckCheck size={12} />
                      {hepsiSecili ? tr("Seçimi kaldır", "Auswahl aufheben") : tr("Hepsini seç", "Alle auswählen")}
                    </button>
                  )}
                </div>

                {hesaplarYukleniyor ? (
                  <div style={{ padding: 26, textAlign: "center", color: "var(--text-3)" }}>
                    <Loader2 size={18} className="spin" />
                  </div>
                ) : !hesaplar.length ? (
                  <div style={{
                    padding: "26px 16px", textAlign: "center", borderRadius: 12,
                    background: "var(--panel-2)", border: "1px dashed var(--border-md)",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                  }}>
                    <Users2 size={22} style={{ color: "var(--text-3)" }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", fontFamily: FONT_METIN }}>
                      {tr("Bağlı hesap yok", "Keine verbundenen Konten")}
                    </span>
                    <span style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: FONT_BASLIK, maxWidth: 300 }}>
                      {tr("Hesaplar sekmesinden bir hesap bağlayıp doğrulayın; sonra buradan yayınlayabilirsiniz.",
                          "Verbinden Sie zuerst ein Konto im Tab „Konten“.")}
                    </span>
                  </div>
                ) : (
                  <div style={{
                    display: "grid", gap: 9,
                    gridTemplateColumns: ekran.mobil ? "1fr" : "repeat(auto-fill, minmax(240px, 1fr))",
                  }}>
                    {hesaplar.map((h) => (
                      <HedefKarti
                        key={h.id}
                        hesap={h}
                        durum={durumAl(h.id, h.platform)}
                        video={video}
                        sure={medya.sure}
                        cozunurluk={medya.cozunurluk}
                        engel={engelBul(h.platform, h.dogrulandi)}
                        ortakCaption={ortakCaption}
                        lang={lang}
                        onDegis={(yama) => degistir(h.id, h.platform, yama)}
                      />
                    ))}
                  </div>
                )}

                {!!buMedyaninYayinlari.length && (
                  <span style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
                    {tr("Bu medya için", "Für dieses Medium")} {buMedyaninYayinlari.length}{" "}
                    {tr("önceki yayın kaydı var.", "frühere Einträge vorhanden.")}
                  </span>
                )}
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {buMedyaninYayinlari.map((y) => (
                  <YayinSatiri
                    key={y.id}
                    yayin={y}
                    hesap={hesaplar.find((h) => h.id === y.account_id)}
                    lang={lang}
                    dar={ekran.mobil}
                    onTekrar={tekrarDene}
                    onIptal={iptal}
                  />
                ))}
                <span style={{
                  fontSize: 10.5, color: "var(--text-3)", fontFamily: FONT_BASLIK, lineHeight: 1.5,
                }}>
                  {tr("Video yüklemeleri platform tarafında 30-120 saniye sürebilir; durum kendiliğinden güncellenir. Pencereyi kapatabilirsiniz.",
                      "Video-Uploads dauern plattformseitig 30-120 Sekunden; der Status aktualisiert sich selbst. Sie können das Fenster schließen.")}
                </span>
              </div>
            )}

            {(hata || yerelHata) && (
              <div style={{
                display: "flex", alignItems: "center", gap: 7,
                fontSize: 11.5, color: "var(--red)", fontFamily: FONT_METIN,
                background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)",
                borderRadius: 10, padding: "8px 11px",
              }}>
                <AlertTriangle size={13} style={{ flexShrink: 0 }} /> {hata || yerelHata}
              </div>
            )}
          </div>
        </div>

        {/* Alt aksiyon çubuğu */}
        <div style={{
          display: "flex", alignItems: "center", gap: 9, flexShrink: 0, flexWrap: "wrap",
          padding: ekran.mobil ? "11px 15px calc(11px + env(safe-area-inset-bottom))" : "11px 15px",
          borderTop: "1px solid var(--border)", background: "var(--panel-2)",
        }}>
          {asama === "secim" ? (
            <>
              <span style={{
                flex: 1, minWidth: 120, fontSize: 11, color: "var(--text-3)", fontFamily: FONT_BASLIK,
              }}>
                {seciliIdler.length
                  ? `${seciliIdler.length} ${tr("hedefe yayınlanacak", "Ziel(e) ausgewählt")}`
                  : tr("Hedef seçilmedi", "Kein Ziel gewählt")}
              </span>
              <button
                onClick={gonder}
                disabled={gonderiliyor || !seciliIdler.length}
                style={{
                  ...buton(SM_RENK, true),
                  padding: "10px 18px", fontSize: 13, borderRadius: 11,
                  background: `linear-gradient(135deg, ${SM_RENK}, #6228d7)`,
                  border: "none", flex: ekran.mobil ? 1 : "0 0 auto",
                  justifyContent: "center",
                  opacity: gonderiliyor || !seciliIdler.length ? 0.55 : 1,
                  cursor: gonderiliyor || !seciliIdler.length ? "not-allowed" : "pointer",
                }}
              >
                {gonderiliyor ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                {tr("Şimdi yayınla", "Jetzt veröffentlichen")}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setAsama("secim")} style={{ ...buton(SM_RENK), flex: ekran.mobil ? 1 : "0 0 auto", justifyContent: "center" }}>
                <Send size={12} /> {tr("Yeni yayın", "Neue Veröffentlichung")}
              </button>
              <button onClick={onKapat} style={{ ...buton("#64748b"), marginLeft: ekran.mobil ? 0 : "auto", flex: ekran.mobil ? 1 : "0 0 auto", justifyContent: "center" }}>
                {tr("Kapat", "Schließen")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
