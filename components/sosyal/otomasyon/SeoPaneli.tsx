import React, { useState, useEffect } from "react";
import {
  Search, Brain, Loader2, Save, Sparkles, AlertTriangle, Globe2, Ban, Check,
} from "lucide-react";
import { useSmSeo, VARSAYILAN_SEO_PROFIL } from "../../../services/sosyal/useSmSeo";
import type { MusteriId, SmSeoProfil } from "../../../services/sosyal/types";
import { FONT_BASLIK, FONT_METIN, SM_RENK, buton, kart, girdi } from "../ortak";
import { useEkran } from "../ekran";
import { EtiketGirdisi } from "./EtiketGirdisi";

interface Props {
  ownerId: string | undefined;
  customerId: MusteriId;
  lang: string;
}

const DILLER: { id: string; ad: string }[] = [
  { id: "de", ad: "Deutsch" },
  { id: "tr", ad: "Türkçe" },
  { id: "en", ad: "English" },
];

/** Serbest metni virgülle ayrılmış listeye çevirir (kelime alanları için). */
const listeyeCevir = (ham: string): string[] =>
  ham.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);

/**
 * "İçeriğim bulunsun" ekranı.
 *
 * Ajanın kim için, kime, hangi tonda yazacağı burada bir kez tanımlanır.
 * İki mod var ve fark önemli:
 *   · Havuz modu   → ajan yalnızca etiket HAVUZUNU doldurur; gönderi anındaki
 *                    seçim eskisi gibi deterministik kalır (metin sizde).
 *   · Gönderi modu → ajan her içerik için başlık/metin/etiket yazar; yayın
 *                    modali de o metni gösterir, gönderilen metin aynısıdır.
 */
export const SeoPaneli: React.FC<Props> = ({ ownerId, customerId, lang }) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);
  const ekran = useEkran();
  const {
    profil, anahtarlar, loading, kaydediliyor, uretiliyor, hata,
    kaydet, tara, havuz,
  } = useSmSeo(ownerId, customerId);

  const [form, setForm] = useState<SmSeoProfil>(VARSAYILAN_SEO_PROFIL);
  const [yuklendi, setYuklendi] = useState(false);
  const [kaydedildi, setKaydedildi] = useState(false);
  const [uretilenHavuz, setUretilenHavuz] = useState<string[] | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [yerelHata, setYerelHata] = useState<string | null>(null);

  useEffect(() => {
    if (loading || yuklendi) return;
    setForm({ ...VARSAYILAN_SEO_PROFIL, ...profil });
    setYuklendi(true);
  }, [profil, loading, yuklendi]);

  // Marka değişince form yeniden yüklensin.
  useEffect(() => { setYuklendi(false); setUretilenHavuz(null); }, [ownerId, customerId]);

  const yama = (parca: Partial<SmSeoProfil>) => {
    setForm((önce) => ({ ...önce, ...parca }));
    setKaydedildi(false);
  };

  const kaydetVeBildir = async () => {
    setYerelHata(null);
    try {
      await kaydet({
        sektor: form.sektor, hedef_kitle: form.hedef_kitle, bolge: form.bolge,
        diller: form.diller, marka_sesi: form.marka_sesi,
        cekirdek_kelimeler: form.cekirdek_kelimeler,
        yasakli_kelimeler: form.yasakli_kelimeler,
        rakip_hesaplar: form.rakip_hesaplar,
        hashtag_modu: form.hashtag_modu,
        baslik_uret: form.baslik_uret,
        otomatik_uret: form.otomatik_uret,
      });
      setKaydedildi(true);
    } catch { /* hata state'i hook'tan geliyor */ }
  };

  const taramaCalistir = async () => {
    setYerelHata(null); setBilgi(null);
    try {
      const c = await tara({ adet: 40 });
      setBilgi(c.ozet
        ?? tr(`${c.eklenen} yeni kelime bulundu.`, `${c.eklenen} neue Begriffe gefunden.`));
    } catch (e: any) {
      setYerelHata(e?.message || tr("Tarama yapılamadı.", "Recherche fehlgeschlagen."));
    }
  };

  const havuzCalistir = async (uygula: boolean) => {
    setYerelHata(null); setBilgi(null);
    try {
      const c = await havuz({ uygula });
      setUretilenHavuz(c.havuz);
      if (c.uygulandi) {
        setBilgi(tr("Havuz otomasyon kuralına yazıldı.",
                    "Der Pool wurde in die Automatik-Regel übernommen."));
      }
    } catch (e: any) {
      setYerelHata(e?.message || tr("Havuz üretilemedi.", "Pool konnte nicht erstellt werden."));
    }
  };

  const baslikSatiri = (Ikon: React.FC<any>, baslik: string, alt: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{
        width: 28, height: 28, borderRadius: 9, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: `${SM_RENK}14`, color: SM_RENK, border: `1px solid ${SM_RENK}2e`,
      }}>
        <Ikon size={14} />
      </span>
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text-1)", fontFamily: FONT_BASLIK }}>
          {baslik}
        </span>
        <span style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: FONT_BASLIK, lineHeight: 1.4 }}>
          {alt}
        </span>
      </span>
    </div>
  );

  const alan = (
    etiket: string,
    deger: string,
    onDegis: (v: string) => void,
    placeholder: string,
    cokSatir = false,
  ) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{
        fontSize: 10, fontWeight: 800, letterSpacing: ".04em",
        color: "var(--text-3)", fontFamily: FONT_BASLIK,
      }}>
        {etiket}
      </span>
      {cokSatir ? (
        <textarea
          value={deger}
          onChange={(e) => onDegis(e.target.value)}
          placeholder={placeholder}
          rows={2}
          style={{ ...girdi, resize: "vertical", lineHeight: 1.5 }}
        />
      ) : (
        <input
          value={deger}
          onChange={(e) => onDegis(e.target.value)}
          placeholder={placeholder}
          style={girdi}
        />
      )}
    </label>
  );

  if (loading && !yuklendi) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>
        <Loader2 size={20} className="spin" />
      </div>
    );
  }

  const modlar: { id: "havuz" | "gonderi"; ad: [string, string]; not: [string, string] }[] = [
    {
      id: "havuz",
      ad: ["Havuzu doldursun", "Pool befüllen"],
      not: ["Ajan etiket havuzunu araştırır; metni siz yazarsınız, etiket seçimi eskisi gibi otomatik.",
            "Der Agent recherchiert den Hashtag-Pool; den Text schreiben Sie, die Auswahl bleibt automatisch."],
    },
    {
      id: "gonderi",
      ad: ["Metni de yazsın", "Auch den Text schreiben"],
      not: ["Ajan her içerik için başlık, metin ve etiketleri yazar. Yayın modalinde gördüğünüz metin aynen gider.",
            "Der Agent schreibt Titel, Text und Hashtags pro Inhalt. Was Sie im Dialog sehen, wird genau so veröffentlicht."],
    },
  ];
  const secilenMod = modlar.find((m) => m.id === form.hashtag_modu) ?? modlar[0];

  return (
    <div style={{
      display: "flex", flexDirection: ekran.dar ? "column" : "row",
      gap: 14, alignItems: "flex-start",
    }}>
      {/* ── Sol: marka bağlamı ──────────────────────────────────────── */}
      <div style={{
        flex: 1, minWidth: 0, width: ekran.dar ? "100%" : undefined,
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        <div style={{ ...kart, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          {baslikSatiri(
            Brain,
            tr("SEO ajanı", "SEO-Agent"),
            tr("İçeriğinizin aranıp bulunmasını sağlayan kelimeleri araştırır.",
               "Recherchiert die Begriffe, über die Ihre Inhalte gefunden werden."),
          )}

          {alan(
            tr("SEKTÖR / İŞ", "BRANCHE"),
            form.sektor ?? "",
            (v) => yama({ sektor: v || null }),
            tr("ör. dijital ön muhasebe hizmeti", "z. B. digitale Buchhaltung"),
          )}
          {alan(
            tr("HEDEF KİTLE", "ZIELGRUPPE"),
            form.hedef_kitle ?? "",
            (v) => yama({ hedef_kitle: v || null }),
            tr("ör. Almanya'daki küçük işletme sahipleri", "z. B. Kleinunternehmer in Deutschland"),
          )}
          {alan(
            tr("MARKA SESİ", "MARKENSTIMME"),
            form.marka_sesi ?? "",
            (v) => yama({ marka_sesi: v || null }),
            tr("ör. samimi, jargonsuz, öğretici", "z. B. nahbar, ohne Fachjargon, erklärend"),
            true,
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 110 }}>
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: ".04em",
                color: "var(--text-3)", fontFamily: FONT_BASLIK,
              }}>
                {tr("PAZAR", "MARKT")}
              </span>
              <input
                value={form.bolge}
                onChange={(e) => yama({ bolge: e.target.value.toUpperCase().slice(0, 5) })}
                placeholder="DE"
                style={girdi}
              />
            </label>

            <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 160 }}>
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: ".04em",
                color: "var(--text-3)", fontFamily: FONT_BASLIK,
              }}>
                {tr("METİN DİLLERİ", "TEXTSPRACHEN")}
              </span>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {DILLER.map((d) => {
                  const secili = form.diller.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => yama({
                        // En az bir dil kalmalı: hiç dil yoksa ajan ne üreteceğini bilemez.
                        diller: secili
                          ? (form.diller.length > 1 ? form.diller.filter((x) => x !== d.id) : form.diller)
                          : [...form.diller, d.id],
                      })}
                      style={{
                        padding: "6px 11px", borderRadius: 9, cursor: "pointer",
                        fontSize: 11.5, fontWeight: 700, fontFamily: FONT_METIN,
                        background: secili ? `${SM_RENK}18` : "var(--panel-2)",
                        color: secili ? SM_RENK : "var(--text-2)",
                        border: `1px solid ${secili ? `${SM_RENK}45` : "var(--border)"}`,
                      }}
                    >
                      {d.ad}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Kelime kontrolü */}
        <div style={{ ...kart, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          {baslikSatiri(
            Ban,
            tr("Kelime kuralları", "Wortregeln"),
            tr("Çekirdek kelimeler her metinde geçer; yasaklılar hiçbir metinde geçmez.",
               "Kernbegriffe kommen in jedem Text vor, verbotene in keinem."),
          )}
          {alan(
            tr("ÇEKİRDEK KELİMELER", "KERNBEGRIFFE"),
            form.cekirdek_kelimeler.join(", "),
            (v) => yama({ cekirdek_kelimeler: listeyeCevir(v) }),
            tr("virgülle ayırın", "mit Komma trennen"),
            true,
          )}
          {alan(
            tr("YASAKLI KELİMELER", "VERBOTENE WÖRTER"),
            form.yasakli_kelimeler.join(", "),
            (v) => yama({ yasakli_kelimeler: listeyeCevir(v) }),
            tr("virgülle ayırın", "mit Komma trennen"),
            true,
          )}
          {alan(
            tr("İZLENECEK HESAPLAR", "BEOBACHTETE PROFILE"),
            form.rakip_hesaplar.join(", "),
            (v) => yama({ rakip_hesaplar: listeyeCevir(v) }),
            tr("@hesap1, @hesap2 — taramada incelenir", "@profil1, @profil2 — werden mitrecherchiert"),
            true,
          )}
        </div>
      </div>

      {/* ── Sağ: mod + araştırma ────────────────────────────────────── */}
      <div style={{
        flex: 1, minWidth: 0, width: ekran.dar ? "100%" : undefined,
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        <div style={{ ...kart, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          {baslikSatiri(
            Sparkles,
            tr("Ajan ne kadarını yazsın?", "Wie viel soll der Agent schreiben?"),
            tr("İstediğiniz zaman değiştirebilirsiniz.", "Jederzeit umstellbar."),
          )}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {modlar.map((m) => {
              const aktif = form.hashtag_modu === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => yama({ hashtag_modu: m.id })}
                  style={{
                    padding: "7px 13px", borderRadius: 9, cursor: "pointer",
                    fontSize: 11.5, fontWeight: 700, fontFamily: FONT_METIN,
                    background: aktif ? `${SM_RENK}18` : "var(--panel-2)",
                    color: aktif ? SM_RENK : "var(--text-2)",
                    border: `1px solid ${aktif ? `${SM_RENK}45` : "var(--border)"}`,
                  }}
                >
                  {tr(m.ad[0], m.ad[1])}
                </button>
              );
            })}
          </div>
          <span style={{
            fontSize: 11, lineHeight: 1.5, color: "var(--text-2)", fontFamily: FONT_METIN,
          }}>
            {tr(secilenMod.not[0], secilenMod.not[1])}
          </span>

          {form.hashtag_modu === "gonderi" && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.otomatik_uret}
                onChange={(e) => yama({ otomatik_uret: e.target.checked })}
                style={{ accentColor: SM_RENK, width: 15, height: 15 }}
              />
              <span style={{ fontSize: 11.5, color: "var(--text-2)", fontFamily: FONT_METIN }}>
                {tr("Üretim kütüphaneye düşer düşmez metni hazırla",
                    "Text vorbereiten, sobald die Produktion in der Bibliothek landet")}
              </span>
            </label>
          )}
        </div>

        {/* Araştırma */}
        <div style={{ ...kart, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          {baslikSatiri(
            Globe2,
            tr("Anahtar kelime araştırması", "Keyword-Recherche"),
            tr("Ajan web'de güncel arama ve etiket eğilimlerine bakar — yarım dakika sürebilir.",
               "Der Agent prüft aktuelle Such- und Hashtag-Trends im Web — kann eine halbe Minute dauern."),
          )}

          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={taramaCalistir}
              disabled={uretiliyor}
              style={{
                ...buton(SM_RENK),
                cursor: uretiliyor ? "not-allowed" : "pointer",
                opacity: uretiliyor ? 0.6 : 1,
              }}
            >
              {uretiliyor ? <Loader2 size={12} className="spin" /> : <Search size={12} />}
              {tr("Trendleri tara", "Trends recherchieren")}
            </button>
            <button
              type="button"
              onClick={() => havuzCalistir(false)}
              disabled={uretiliyor}
              style={{
                ...buton(SM_RENK),
                cursor: uretiliyor ? "not-allowed" : "pointer",
                opacity: uretiliyor ? 0.6 : 1,
              }}
            >
              {uretiliyor ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />}
              {tr("Havuz öner", "Pool vorschlagen")}
            </button>
          </div>

          {!!anahtarlar.length && (
            <span style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
              {tr(`${anahtarlar.length} kelime kayıtlı · son tarama ${
                    new Date(anahtarlar[0].son_tarama).toLocaleDateString(lang === "tr" ? "tr-TR" : "de-DE")}`,
                  `${anahtarlar.length} Begriffe gespeichert · letzte Recherche ${
                    new Date(anahtarlar[0].son_tarama).toLocaleDateString("de-DE")}`)}
            </span>
          )}

          {uretilenHavuz && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Salt gösterim: kullanıcı uygulamadan önce ne geleceğini görsün.
                  Düzenleme yeri havuzun asıl sahibi olan otomasyon kartı. */}
              <EtiketGirdisi
                etiketler={uretilenHavuz}
                onDegis={setUretilenHavuz}
                placeholder={tr("etiket ekle", "Hashtag hinzufügen")}
                lang={lang}
              />
              <button
                type="button"
                onClick={() => havuzCalistir(true)}
                disabled={uretiliyor}
                style={{ ...buton(SM_RENK, true), alignSelf: "flex-start" }}
              >
                {uretiliyor ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
                {tr("Havuzu uygula", "Pool übernehmen")}
              </button>
            </div>
          )}

          {bilgi && (
            <span style={{
              fontSize: 11, lineHeight: 1.5, color: "var(--text-2)", fontFamily: FONT_METIN,
            }}>
              {bilgi}
            </span>
          )}
        </div>

        {(hata || yerelHata) && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 7,
            padding: "9px 12px", borderRadius: 11,
            background: "#ef444414", border: "1px solid #ef444433",
          }}>
            <AlertTriangle size={13} style={{ color: "#ef4444", flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 11.5, lineHeight: 1.5, color: "#ef4444", fontFamily: FONT_METIN }}>
              {yerelHata || hata}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={kaydetVeBildir}
          disabled={kaydediliyor}
          style={{
            ...buton(SM_RENK, true), alignSelf: "flex-start",
            cursor: kaydediliyor ? "not-allowed" : "pointer",
            opacity: kaydediliyor ? 0.6 : 1,
          }}
        >
          {kaydediliyor ? <Loader2 size={13} className="spin" />
            : kaydedildi ? <Check size={13} /> : <Save size={13} />}
          {kaydedildi ? tr("Kaydedildi", "Gespeichert") : tr("SEO ayarlarını kaydet", "SEO-Einstellungen speichern")}
        </button>
      </div>
    </div>
  );
};
