import React, { useState, useEffect, useMemo } from "react";
import {
  Wand2, Hash, MessageSquare, Save, Loader2, AlertTriangle, Info,
  Plus, Trash2, Sparkles, RotateCcw,
} from "lucide-react";
import { useSmOtomasyon } from "../../../services/sosyal/useSmOtomasyon";
import {
  metinKur, ONERILEN_KURAL, VARSAYILAN_KURAL, HASHTAG_SINIRI, YORUM_DESTEKLI,
} from "../../../services/sosyal/otomasyonMetin";
import type { OtomasyonKurali, SmHashtagYeri } from "../../../services/sosyal/otomasyonMetin";
import type { MusteriId } from "../../../services/sosyal/types";
import { FONT_BASLIK, FONT_METIN, SM_RENK, buton, kart, girdi } from "../ortak";
import { useEkran } from "../ekran";
import { EtiketGirdisi } from "./EtiketGirdisi";
import { KotaKarti } from "./KotaKarti";

interface Props {
  ownerId: string | undefined;
  customerId: MusteriId;
  lang: string;
}

const ORNEK_CAPTION = "Neues Video ist online 🎬";

/** Kayıttan forma — kolon adları birebir aynı olduğu için düz kopya. */
function formaCevir(kaynak: any): OtomasyonKurali {
  return {
    aktif: !!kaynak.aktif,
    hashtag_havuzu: [...(kaynak.hashtag_havuzu ?? [])],
    sabit_hashtagler: [...(kaynak.sabit_hashtagler ?? [])],
    hashtag_adet: kaynak.hashtag_adet ?? 8,
    hashtag_yeri: kaynak.hashtag_yeri ?? "yorum",
    yorum_aktif: !!kaynak.yorum_aktif,
    yorum_sablonlari: [...(kaynak.yorum_sablonlari ?? [])],
  };
}

/**
 * "Gönderi kendiliğinden şekillensin" ekranı.
 *
 * Kullanıcı videoyu yükleyip yayınla dediğinde etiketlerin ve ilk yorumun
 * nasıl üretileceği burada bir kez tanımlanır. Ekranın sağ yarısı CANLI
 * ÖNİZLEME: aynı fonksiyon (metinKur) sunucuda da çalıştığı için burada
 * görülen metin, yayınlanacak metnin ta kendisidir.
 */
export const OtomasyonPaneli: React.FC<Props> = ({ ownerId, customerId, lang }) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);
  const ekran = useEkran();
  const { genel, loading, kaydediliyor, hata, kaydet } = useSmOtomasyon(ownerId, customerId);

  const [form, setForm] = useState<OtomasyonKurali>(VARSAYILAN_KURAL);
  const [yuklendi, setYuklendi] = useState(false);
  const [ornek, setOrnek] = useState(ORNEK_CAPTION);
  const [kaydedildi, setKaydedildi] = useState(false);

  // Kayıt varsa onu, yoksa ÖNERİLEN kurulumu forma bas: boş bir form
  // kullanıcıya "kendin kur" demek olurdu, oysa istenen tam tersi.
  useEffect(() => {
    if (loading || yuklendi) return;
    setForm(genel ? formaCevir(genel) : { ...ONERILEN_KURAL });
    setYuklendi(true);
  }, [genel, loading, yuklendi]);

  // Marka değişince form yeniden yüklensin.
  useEffect(() => { setYuklendi(false); }, [ownerId, customerId]);

  const yama = (parca: Partial<OtomasyonKurali>) => {
    setForm((önce) => ({ ...önce, ...parca }));
    setKaydedildi(false);
  };

  const onizleme = useMemo(
    () => metinKur({
      kural: form,
      caption: ornek,
      platform: "instagram",
      format: "reel",
      tohum: "onizleme",
      handle: "fikoai",
    }),
    [form, ornek],
  );

  const kaydetVeBildir = async () => {
    try {
      await kaydet({
        aktif: form.aktif,
        hashtag_havuzu: form.hashtag_havuzu,
        sabit_hashtagler: form.sabit_hashtagler,
        hashtag_adet: form.hashtag_adet,
        hashtag_yeri: form.hashtag_yeri,
        yorum_aktif: form.yorum_aktif,
        yorum_sablonlari: form.yorum_sablonlari.map((s) => s.trim()).filter(Boolean),
      });
      setKaydedildi(true);
    } catch {
      // hata state'i hook'tan geliyor.
    }
  };

  const YERLER: { id: SmHashtagYeri; tr: string; de: string; not: [string, string] }[] = [
    {
      id: "yorum", tr: "İlk yoruma", de: "In den ersten Kommentar",
      not: ["Metin temiz kalır; etiketler gönderinin altındaki ilk yorumda görünür.",
            "Der Text bleibt sauber; die Hashtags stehen im ersten Kommentar."],
    },
    {
      id: "caption", tr: "Metnin altına", de: "Unter den Text",
      not: ["Etiketler doğrudan gönderi metninin sonuna eklenir.",
            "Die Hashtags werden direkt an den Beitragstext angehängt."],
    },
    {
      id: "yok", tr: "Ekleme", de: "Keine",
      not: ["Otomatik etiket eklenmez; yalnızca ilk yorum çalışır.",
            "Keine automatischen Hashtags; nur der erste Kommentar läuft."],
    },
  ];

  const secilenYer = YERLER.find((y) => y.id === form.hashtag_yeri) ?? YERLER[0];
  const toplamEtiket = form.hashtag_havuzu.length + form.sabit_hashtagler.length;

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
        <span style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
          {alt}
        </span>
      </span>
    </div>
  );

  const anahtar = (acik: boolean, onDegis: () => void, etiket: string) => (
    <button
      type="button"
      role="switch"
      aria-checked={acik}
      onClick={onDegis}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start",
        background: "none", border: "none", padding: 0, cursor: "pointer",
      }}
    >
      <span style={{
        width: 36, height: 20, borderRadius: 999, flexShrink: 0, position: "relative",
        background: acik ? SM_RENK : "var(--border-md)", transition: "background .18s",
      }}>
        <span style={{
          position: "absolute", top: 2, left: acik ? 18 : 2,
          width: 16, height: 16, borderRadius: "50%", background: "#fff",
          transition: "left .18s", boxShadow: "0 1px 3px rgba(2,6,23,.3)",
        }} />
      </span>
      <span style={{
        fontSize: 12, fontWeight: 700, fontFamily: FONT_METIN,
        color: acik ? "var(--text-1)" : "var(--text-3)",
      }}>
        {etiket}
      </span>
    </button>
  );

  if (loading && !yuklendi) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>
        <Loader2 size={20} className="spin" />
      </div>
    );
  }

  return (
    <div style={{
      height: "100%", overflowY: "auto",
      padding: ekran.mobil ? 12 : 16,
      display: "flex", flexDirection: ekran.dar ? "column" : "row",
      gap: 14, alignItems: "flex-start",
    }}>
      {/* ── Sol: kurallar ─────────────────────────────────────────── */}
      <div style={{
        flex: 1, minWidth: 0, width: ekran.dar ? "100%" : undefined,
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        {/* Kalan kullanım hakları — otomasyonu durduran kotalar en üstte,
            çünkü kural ayarlamadan önce hakkın var mı ona bakılır. */}
        <KotaKarti lang={lang} />

        {/* Ana anahtar */}
        <div style={{ ...kart, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {baslikSatiri(
            Wand2,
            tr("Otomatik şekillendirme", "Automatische Aufbereitung"),
            tr("Yayınla'ya bastığınızda etiketler ve ilk yorum kendiliğinden eklenir.",
               "Beim Veröffentlichen werden Hashtags und erster Kommentar automatisch ergänzt."),
          )}
          {anahtar(
            form.aktif,
            () => yama({ aktif: !form.aktif }),
            form.aktif ? tr("Açık", "Aktiv") : tr("Kapalı", "Aus"),
          )}
        </div>

        {/* Hashtag'ler */}
        <div style={{
          ...kart, padding: 14, display: "flex", flexDirection: "column", gap: 12,
          opacity: form.aktif ? 1 : 0.5, pointerEvents: form.aktif ? "auto" : "none",
        }}>
          {baslikSatiri(
            Hash,
            tr("Hashtag'ler", "Hashtags"),
            tr(`Havuzdan gönderi başına ${form.hashtag_adet} etiket seçilir.`,
               `Pro Beitrag werden ${form.hashtag_adet} Hashtags aus dem Pool gewählt.`),
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".04em", color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
              {tr("NEREYE EKLENSİN?", "WOHIN?")}
            </span>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {YERLER.map((y) => {
                const aktif = form.hashtag_yeri === y.id;
                return (
                  <button
                    key={y.id}
                    type="button"
                    onClick={() => yama({ hashtag_yeri: y.id })}
                    style={{
                      padding: "6px 12px", borderRadius: 9, cursor: "pointer",
                      fontSize: 11.5, fontWeight: 700, fontFamily: FONT_METIN,
                      background: aktif ? `${SM_RENK}18` : "var(--panel-2)",
                      color: aktif ? SM_RENK : "var(--text-2)",
                      border: `1px solid ${aktif ? `${SM_RENK}45` : "var(--border)"}`,
                      transition: "all .15s",
                    }}
                  >
                    {tr(y.tr, y.de)}
                  </button>
                );
              })}
            </div>
            <span style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: FONT_BASLIK, lineHeight: 1.45 }}>
              {tr(secilenYer.not[0], secilenYer.not[1])}
            </span>
          </div>

          {form.hashtag_yeri === "yorum" && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 6,
              padding: "8px 10px", borderRadius: 9,
              background: "rgba(6,182,212,.08)", border: "1px solid rgba(6,182,212,.25)",
              fontSize: 10.5, lineHeight: 1.45, color: "var(--text-2)", fontFamily: FONT_METIN,
            }}>
              <Info size={12} style={{ flexShrink: 0, marginTop: 1, color: "#06b6d4" }} />
              <span>
                {tr(`İlk yorum şu an yalnızca ${YORUM_DESTEKLI.join(", ")} tarafında yazılabiliyor. Diğer platformlarda etiketler otomatik olarak metnin altına düşer — hiç yayınlanmadan kaybolmaz.`,
                    `Der erste Kommentar ist derzeit nur bei ${YORUM_DESTEKLI.join(", ")} möglich. Bei anderen Plattformen wandern die Hashtags automatisch unter den Text.`)}
              </span>
            </div>
          )}

          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".04em", color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
              {tr("GÖNDERİ BAŞINA ETİKET", "HASHTAGS PRO BEITRAG")} · {form.hashtag_adet}
            </span>
            <input
              type="range"
              min={0}
              max={HASHTAG_SINIRI}
              value={form.hashtag_adet}
              onChange={(e) => yama({ hashtag_adet: Number(e.target.value) })}
              style={{ width: "100%", accentColor: SM_RENK }}
            />
            <span style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
              {tr(`Sabitler dâhil. Instagram bir gönderide en fazla ${HASHTAG_SINIRI} etiket sayar.`,
                  `Inklusive fixer Tags. Instagram zählt maximal ${HASHTAG_SINIRI} Hashtags pro Beitrag.`)}
            </span>
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".04em", color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
              {tr("SABİT ETİKETLER", "FESTE HASHTAGS")}
            </span>
            <EtiketGirdisi
              etiketler={form.sabit_hashtagler}
              onDegis={(y) => yama({ sabit_hashtagler: y })}
              placeholder={tr("Marka etiketiniz — her gönderide çıkar", "Marken-Hashtag — bei jedem Beitrag")}
              bosMetin={tr("Her gönderide mutlaka çıkması gereken etiketler (marka, kampanya).",
                           "Hashtags, die in jedem Beitrag erscheinen (Marke, Kampagne).")}
              lang={lang}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".04em", color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
              {tr("ETİKET HAVUZU", "HASHTAG-POOL")} · {form.hashtag_havuzu.length}
            </span>
            <EtiketGirdisi
              etiketler={form.hashtag_havuzu}
              onDegis={(y) => yama({ hashtag_havuzu: y })}
              placeholder={tr("Etiket yazıp Enter'a basın", "Hashtag eingeben, Enter drücken")}
              bosMetin={tr("Havuz boşken yalnızca sabit etiketler eklenir.",
                           "Ist der Pool leer, werden nur die festen Hashtags ergänzt.")}
              lang={lang}
            />
            <span style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: FONT_BASLIK, lineHeight: 1.45 }}>
              {tr("Havuz ne kadar genişse gönderiler o kadar farklılaşır: her gönderide aynı etiket bloğunu paylaşmak Instagram tarafında tekrar sinyali sayılıyor.",
                  "Je größer der Pool, desto unterschiedlicher die Beiträge: identische Hashtag-Blöcke gelten bei Instagram als Wiederholung.")}
            </span>
          </div>
        </div>

        {/* İlk yorum */}
        <div style={{
          ...kart, padding: 14, display: "flex", flexDirection: "column", gap: 11,
          opacity: form.aktif ? 1 : 0.5, pointerEvents: form.aktif ? "auto" : "none",
        }}>
          {baslikSatiri(
            MessageSquare,
            tr("Otomatik ilk yorum", "Automatischer erster Kommentar"),
            tr("Gönderi yayınlanır yayınlanmaz altına yazılır.",
               "Wird direkt nach der Veröffentlichung gepostet."),
          )}
          {anahtar(
            form.yorum_aktif,
            () => yama({ yorum_aktif: !form.yorum_aktif }),
            form.yorum_aktif ? tr("Açık", "Aktiv") : tr("Kapalı", "Aus"),
          )}

          {form.yorum_aktif && (
            <>
              <span style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: FONT_BASLIK, lineHeight: 1.5 }}>
                {tr("Şablonlar sırayla döner — her gönderi aynı cümleyle başlamasın. Yer tutucular:",
                    "Die Vorlagen rotieren — nicht jeder Beitrag beginnt gleich. Platzhalter:")}{" "}
                <code style={{ fontFamily: FONT_BASLIK, color: SM_RENK }}>{"{baslik} {handle} {hashtag}"}</code>
              </span>

              {form.yorum_sablonlari.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <textarea
                    value={s}
                    onChange={(e) => {
                      const yeni = [...form.yorum_sablonlari];
                      yeni[i] = e.target.value;
                      yama({ yorum_sablonlari: yeni });
                    }}
                    rows={2}
                    placeholder={tr("Yorum metni…", "Kommentartext…")}
                    style={{ ...girdi, flex: 1, minWidth: 0, resize: "vertical", lineHeight: 1.5 }}
                  />
                  <button
                    type="button"
                    onClick={() => yama({ yorum_sablonlari: form.yorum_sablonlari.filter((_, j) => j !== i) })}
                    aria-label={tr("Şablonu sil", "Vorlage löschen")}
                    style={{
                      display: "flex", padding: 7, borderRadius: 8, cursor: "pointer", flexShrink: 0,
                      background: "transparent", border: "1px solid var(--border)", color: "var(--text-3)",
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => yama({ yorum_sablonlari: [...form.yorum_sablonlari, ""] })}
                style={{ ...buton(SM_RENK), alignSelf: "flex-start" }}
              >
                <Plus size={12} /> {tr("Şablon ekle", "Vorlage hinzufügen")}
              </button>
            </>
          )}
        </div>

        {/* Kaydet */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <button
            onClick={kaydetVeBildir}
            disabled={kaydediliyor}
            style={{
              ...buton(SM_RENK, true),
              padding: "10px 18px", fontSize: 13, borderRadius: 11, border: "none",
              background: `linear-gradient(135deg, ${SM_RENK}, #6228d7)`,
              opacity: kaydediliyor ? 0.6 : 1,
              cursor: kaydediliyor ? "not-allowed" : "pointer",
            }}
          >
            {kaydediliyor ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            {tr("Kaydet", "Speichern")}
          </button>

          <button
            onClick={() => { setForm({ ...ONERILEN_KURAL }); setKaydedildi(false); }}
            style={buton("#64748b")}
            title={tr("Önerilen kuruluma dön", "Auf Empfehlung zurücksetzen")}
          >
            <RotateCcw size={12} /> {tr("Önerilen ayarlar", "Empfohlene Einstellungen")}
          </button>

          {kaydedildi && (
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "#10b981", fontFamily: FONT_BASLIK }}>
              {tr("Kaydedildi", "Gespeichert")}
            </span>
          )}
          {toplamEtiket === 0 && form.aktif && form.hashtag_yeri !== "yok" && (
            <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
              {tr("Etiket havuzu boş — etiket eklenmeyecek.", "Pool ist leer — es werden keine Hashtags ergänzt.")}
            </span>
          )}
        </div>

        {hata && (
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            fontSize: 11.5, color: "var(--red)", fontFamily: FONT_METIN,
            background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)",
            borderRadius: 10, padding: "8px 11px",
          }}>
            <AlertTriangle size={13} style={{ flexShrink: 0 }} /> {hata}
          </div>
        )}
      </div>

      {/* ── Sağ: canlı önizleme ───────────────────────────────────── */}
      <div style={{
        width: ekran.dar ? "100%" : 340, flexShrink: 0,
        position: ekran.dar ? "static" : "sticky", top: 0,
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{ ...kart, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {baslikSatiri(
            Sparkles,
            tr("Canlı önizleme", "Live-Vorschau"),
            tr("Instagram Reels örneği", "Beispiel: Instagram Reels"),
          )}

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".04em", color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
              {tr("YAZDIĞINIZ METİN", "IHR TEXT")}
            </span>
            <textarea
              value={ornek}
              onChange={(e) => setOrnek(e.target.value)}
              rows={2}
              style={{ ...girdi, resize: "vertical", lineHeight: 1.5 }}
            />
          </label>

          <div style={{
            display: "flex", flexDirection: "column", gap: 3,
            padding: "10px 12px", borderRadius: 11,
            background: "var(--panel-2)", border: "1px solid var(--border)",
          }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".04em", color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
              {tr("GÖNDERİ METNİ", "BEITRAGSTEXT")}
            </span>
            <span style={{
              fontSize: 12, color: "var(--text-1)", fontFamily: FONT_METIN,
              lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {onizleme.caption || tr("(boş)", "(leer)")}
            </span>
          </div>

          <div style={{
            display: "flex", flexDirection: "column", gap: 3,
            padding: "10px 12px", borderRadius: 11,
            background: onizleme.yorum ? `${SM_RENK}0d` : "var(--panel-2)",
            border: `1px solid ${onizleme.yorum ? `${SM_RENK}2e` : "var(--border)"}`,
          }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".04em", color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
              {tr("İLK YORUM", "ERSTER KOMMENTAR")}
            </span>
            <span style={{
              fontSize: 12, fontFamily: FONT_METIN, lineHeight: 1.55,
              color: onizleme.yorum ? "var(--text-1)" : "var(--text-3)",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {onizleme.yorum || tr("(yorum yazılmayacak)", "(kein Kommentar)")}
            </span>
          </div>

          <span style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: FONT_BASLIK, lineHeight: 1.45 }}>
            {tr(`Bu gönderiye ${onizleme.hashtagler.length} etiket eklendi. Her videoda havuzun farklı bir bölümü kullanılır.`,
                `${onizleme.hashtagler.length} Hashtags ergänzt. Jedes Video nutzt einen anderen Teil des Pools.`)}
          </span>
        </div>
      </div>
    </div>
  );
};
