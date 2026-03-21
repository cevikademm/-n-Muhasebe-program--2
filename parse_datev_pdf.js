import fs from 'fs';
import path from 'path';

// Read the full extracted text from datev.pdf
const text = fs.readFileSync(path.join(process.cwd(), 'datev_full_text.txt'), 'utf8');

// Read existing skr03Full.ts to get account codes
const tsContent = fs.readFileSync(path.join(process.cwd(), 'data/skr03Full.ts'), 'utf8');
const existingCodes = new Set();
const codeMatches = tsContent.matchAll(/code:\s*"(\d{4})"/g);
for (const m of codeMatches) existingCodes.add(m[1]);
console.log(`Existing account codes: ${existingCodes.size}`);

// ===== BUILD ACCOUNT METADATA FROM PDF =====
// We'll extract:
//   1. description (Açıklama) - what the account is for
//   2. keywords (Anahtar Kelimeler) - rule engine matching words
//   3. examples (Örnek İşlemler) - example transactions

const accountMeta = new Map();

// Helper: add context for an account code
function addMeta(code, field, value) {
    if (!existingCodes.has(code)) return;
    if (!accountMeta.has(code)) {
        accountMeta.set(code, { description: '', keywords: new Set(), examples: new Set() });
    }
    const meta = accountMeta.get(code);
    if (field === 'description') {
        if (value.length > meta.description.length) meta.description = value;
    } else if (field === 'keyword') {
        value.split(/[,;|\/]/).forEach(k => {
            k = k.trim();
            if (k.length > 1 && k.length < 60) meta.keywords.add(k);
        });
    } else if (field === 'example') {
        if (value.length > 3 && value.length < 120) meta.examples.add(value);
    }
}

// ===== STRATEGY 1: Extract code-description pairs from text =====
// Patterns like "4920 Bürobedarf (Kırtasiye Giderleri)" or "0015 Konzessionen (İmtiyazlar)"
const codeDescPattern = /\b(\d{4})\s+([A-ZÄÖÜa-zäöüß][A-Za-zÄÖÜäöüß\s\-,.()/&§%+'°²³]+?)(?:\s*\(([^)]+)\))?(?:\s*[\[\(]|\s*hesab|[\s,.])/g;
let match;
while ((match = codeDescPattern.exec(text)) !== null) {
    const code = match[1];
    if (!existingCodes.has(code)) continue;
    const name = match[2].trim();
    const turkishName = match[3] ? match[3].trim() : '';
    if (name.length > 3) {
        addMeta(code, 'description', turkishName || name);
    }
}

// ===== STRATEGY 2: Manually curated comprehensive keyword database =====
// Based on thorough analysis of the 90-page datev.pdf content

const keywordDB = {
    // === SINIF 0: Anlage- und Kapitalkonten ===
    '0010': { desc: 'Entgeltlich erworbene Konzessionen und Rechte (Satın Alınan İmtiyazlar ve Haklar)', kw: 'Patent,Lizenz,Konzession,Markenrecht,Nutzungsrecht,Schutzrecht,Recht,İmtiyaz,Lisans,Patent,Marka', ex: 'Yazılım lisansı satın alımı,Patent alımı,Marka tescil bedeli' },
    '0015': { desc: 'Konzessionen (İmtiyazlar)', kw: 'Konzession,İmtiyaz,Genehmigung,Betriebserlaubnis,Ruhsat', ex: 'Belediye işletme ruhsatı,Ticaret izni bedeli' },
    '0020': { desc: 'Gewerbliche Schutzrechte (Ticari Koruma Hakları / Patentler)', kw: 'Patent,Schutzrecht,Gebrauchsmuster,Geschmacksmuster,Warenzeichen', ex: 'Patent tescil bedeli,Endüstriyel tasarım hakkı' },
    '0027': { desc: 'EDV-Software (Bilgisayar Yazılımları)', kw: 'Software,Lizenz,EDV,IT,Programm,Datenbank,ERP,CRM,Yazılım,Program', ex: 'ERP yazılımı alımı,Muhasebe programı lisansı,CRM yazılımı,Antivirüs lisansı' },
    '0030': { desc: 'Lizenzen (Lisanslar)', kw: 'Lizenz,Franchise,Nutzungsrecht,Vertrag,Lisans', ex: 'Franchise anlaşması,Kullanım hakkı bedeli' },
    '0035': { desc: 'Geschäfts- oder Firmenwert (Şerefiye / Marka Değeri)', kw: 'Firmenwert,Geschäftswert,Goodwill,Şerefiye,Marka,Übernahme', ex: 'Şirket satın alımında şerefiye,İşletme devir bedeli' },
    '0043': { desc: 'Selbst geschaffene immaterielle Vermögensgegenstände (Kurum İçi Geliştirilen Maddi Olmayan Varlıklar)', kw: 'Eigenentwicklung,Selbst erstellt,F&E,Forschung,Entwicklung,Ar-Ge', ex: 'Kurum içi yazılım geliştirme,Ar-Ge projesi maliyeti' },
    '0050': { desc: 'Grundstücke (Arsalar ve Araziler)', kw: 'Grundstück,Boden,Grund,Land,Fläche,Arsa,Arazi', ex: 'Fabrika arsası alımı,İnşaat arazisi satın alımı' },
    '0080': { desc: 'Bauten auf eigenen Grundstücken (Kendi Arsaları Üzerindeki Binalar)', kw: 'Gebäude,Bau,Bauten,Immobilie,Halle,Bina,Fabrika,Ofis', ex: 'Fabrika binası inşaatı,Ofis binası alımı' },
    '0200': { desc: 'Technische Anlagen und Maschinen (Teknik Tesisler ve Makineler)', kw: 'Maschine,Anlage,Produktion,Fertigung,Makine,Tesis,Üretim,CNC,Fräse,Drehmaschine', ex: 'CNC tezgah alımı,Üretim hattı makinesi,Paketleme makinesi' },
    '0300': { desc: 'Betriebs- und Geschäftsausstattung (İşletme ve Ofis Donanımları)', kw: 'Ausstattung,Einrichtung,Möbel,Büro,Mobilya,Donanım,Ofis,Bilgisayar,Drucker,Computer', ex: 'Büro mobilyası alımı,Bilgisayar alımı,Yazıcı alımı' },
    '0400': { desc: 'Geringwertige Wirtschaftsgüter (Düşük Değerli İktisadi Kıymetler)', kw: 'GWG,Geringwertig,Sofortabschreibung,Kleinmöbel,Düşük değerli,Demirbaş', ex: 'Küçük ofis eşyası,250€ altı demirbaş alımı' },
    '0500': { desc: 'Beteiligungen (İştirakler)', kw: 'Beteiligung,Anteile,Aktien,Gesellschaft,Hisse,İştirak,Ortaklık', ex: 'Başka şirkette hisse alımı,İştirak payı alımı' },
    '0630': { desc: 'Darlehen (Verilen Borçlar)', kw: 'Darlehen,Kredit,Ausleihung,Borç,Kredi,Verilen', ex: 'Personele verilen borç,İştirak şirkete verilen kredi' },
    '0800': { desc: 'Gezeichnetes Kapital (Tescilli Sermaye)', kw: 'Kapital,Stammkapital,Grundkapital,Sermaye,Esas,Tescil', ex: 'Şirket kuruluş sermayesi,Sermaye artırımı' },
    '0840': { desc: 'Gewinnrücklagen (Yedek Akçeler)', kw: 'Rücklage,Gewinnrücklage,Reserve,Yedek,Akçe', ex: 'Yasal yedek akçe ayrılması' },
    '0860': { desc: 'Gewinnvortrag / Verlustvortrag (Geçmiş Yıl Karı/Zararı)', kw: 'Vortrag,Gewinnvortrag,Verlustvortrag,Devir,Kar,Zarar', ex: 'Geçmiş yıl karının devri' },
    '0950': { desc: 'Rückstellungen (Karşılıklar)', kw: 'Rückstellung,Karşılık,Provision,Verpflichtung,Tazminat', ex: 'Emeklilik karşılığı,Vergi cezası karşılığı' },

    // === SINIF 1: Finanz- und Privatkonten ===
    '1000': { desc: 'Kasse (Kasa)', kw: 'Kasse,Bargeld,Bar,Nakit,Kasa,Peşin', ex: 'Kasadan nakit ödeme,Peşin tahsilat' },
    '1010': { desc: 'Nebenkasse 1 (Yardımcı Kasa 1)', kw: 'Nebenkasse,Portokasse,Handkasse,Yardımcı kasa', ex: 'Küçük kasa ödemesi' },
    '1100': { desc: 'Bank (Postbank) (Banka Hesabı)', kw: 'Bank,Postbank,Konto,Girokonto,Banka,Havale,EFT', ex: 'Banka havalesi,EFT ile ödeme,Banka hesabına para girişi' },
    '1200': { desc: 'Bank (Banka)', kw: 'Bank,Konto,Girokonto,Banka,Hesap,Havale', ex: 'Banka hesabı hareketi,Otomatik ödeme talimatı' },
    '1300': { desc: 'Finanzanlagen (Mali Varlıklar)', kw: 'Wertpapier,Anleihe,Finanzanlage,Menkul,Tahvil,Bono', ex: 'Hazine bonosu alımı,Menkul değer yatırımı' },
    '1400': { desc: 'Forderungen aus Lieferungen und Leistungen (Ticari Alacaklar)', kw: 'Forderung,Debitor,Rechnung,Alacak,Müşteri,Fatura', ex: 'Müşteriden tahsil edilecek fatura bedeli' },
    '1500': { desc: 'Sonstige Vermögensgegenstände (Diğer Varlıklar)', kw: 'Vermögen,Sonstige,Kaution,Teminat,Diğer,Varlık', ex: 'Kira teminatı,Depozito ödemesi' },
    '1518': { desc: 'Steuererstattungsansprüche (Vergi İade Alacakları)', kw: 'Steuererstattung,Erstattung,Finanzamt,Vergi,İade,Alacak', ex: 'Fazla ödenen verginin iadesi' },
    '1570': { desc: 'Vorsteuer (Abziehbare Vorsteuer) (İndirilecek KDV)', kw: 'Vorsteuer,Abziehbar,VSt,KDV,İndirilecek,Giriş vergisi', ex: 'Mal alımında ödenen KDV' },
    '1571': { desc: 'Abziehbare Vorsteuer 7% (İndirilecek KDV %7)', kw: 'Vorsteuer,7%,VSt 7,KDV %7', ex: 'Gıda alımında %7 KDV' },
    '1576': { desc: 'Abziehbare Vorsteuer 19% (İndirilecek KDV %19)', kw: 'Vorsteuer,19%,VSt 19,KDV %19', ex: 'Mal alımında %19 KDV' },
    '1580': { desc: 'Vorsteuer Gesamtkonto (KDV Toplu Hesabı)', kw: 'Vorsteuer,Gesamt,KDV,Toplam,Mahsup', ex: 'Aylık KDV mahsuplaşması' },
    '1600': { desc: 'Verbindlichkeiten aus Lieferungen und Leistungen (Ticari Borçlar)', kw: 'Verbindlichkeit,Kreditor,Lieferant,Borç,Tedarikçi,Fatura', ex: 'Tedarikçiye ödenecek fatura bedeli' },
    '1700': { desc: 'Sonstige Verbindlichkeiten (Diğer Borçlar)', kw: 'Verbindlichkeit,Sonstige,Darlehen,Borç,Diğer,Kredi', ex: 'Banka kredi taksidi,Diğer borçlar' },
    '1740': { desc: 'Verbindlichkeiten Finanzamt (Vergi Dairesi Borçları)', kw: 'Finanzamt,Steuerschuld,Vergi,Dairesi,Borç,Ödeme', ex: 'KDV beyanname borcu,Gelir vergisi borcu' },
    '1770': { desc: 'Umsatzsteuer (Hesaplanan KDV / Çıkış KDV)', kw: 'Umsatzsteuer,USt,MwSt,KDV,Hesaplanan,Çıkış', ex: 'Satış faturasında hesaplanan KDV' },
    '1771': { desc: 'Umsatzsteuer 7% (KDV %7)', kw: 'Umsatzsteuer,7%,USt 7,KDV %7', ex: 'Gıda satışı %7 KDV' },
    '1776': { desc: 'Umsatzsteuer 19% (KDV %19)', kw: 'Umsatzsteuer,19%,USt 19,KDV %19', ex: 'Standart satış faturası %19 KDV' },
    '1780': { desc: 'Umsatzsteuer-Vorauszahlung (KDV Avans Ödemesi)', kw: 'Vorauszahlung,Voranmeldung,KDV,Avans,Peşin,Ödeme', ex: 'Aylık KDV avans ödemesi' },
    '1790': { desc: 'Umsatzsteuer Vorjahr (Geçmiş Yıl KDV)', kw: 'Vorjahr,Umsatzsteuer,Geçmiş yıl,KDV,Düzeltme', ex: 'Geçmiş yıl KDV düzeltmesi' },
    '1800': { desc: 'Privatentnahmen (Kişisel Çekimler)', kw: 'Privat,Entnahme,Çekim,Kişisel,Özel,Sahip', ex: 'İşletme sahibinin kişisel çekimi' },
    '1890': { desc: 'Privateinlagen (Kişisel Sermaye Koyma)', kw: 'Privat,Einlage,Koyma,Sermaye,Kişisel,Ekleme', ex: 'İşletme sahibinin cebinden sermaye koyması' },

    // === SINIF 2: Abgrenzungskonten ===
    '2100': { desc: 'Zinsen und ähnliche Aufwendungen (Faiz ve Benzeri Giderler)', kw: 'Zinsen,Zinsaufwand,Kredit,Darlehen,Faiz,Gider,Banka,Finanzierung', ex: 'Banka kredi faizi ödemesi,Overdraft faizi' },
    '2200': { desc: 'Körperschaftsteuer (Kurumlar Vergisi)', kw: 'Körperschaftsteuer,KSt,Steuer,Kurumlar,Vergisi', ex: 'Yıllık kurumlar vergisi taksidi' },
    '2280': { desc: 'Gewerbesteuer (Ticaret Vergisi)', kw: 'Gewerbesteuer,GewSt,Gewerbe,Ticaret,Vergisi', ex: 'Ticaret vergisi ödeme taksidi' },
    '2300': { desc: 'Sonstige Aufwendungen (Diğer Olağandışı Giderler)', kw: 'Verlust,Außerordentlich,Sonstige,Olağandışı,Gider,Zarar', ex: 'Beklenmeyen hasar gideri,Ceza ödemesi' },
    '2400': { desc: 'Forderungsverluste (Alacak Zararları)', kw: 'Forderungsverlust,Abschreibung,Uneinbringlich,Alacak,Zarar,Tahsil', ex: 'Tahsil edilemeyen müşteri alacağı,İflas eden müşteri borcu' },
    '2650': { desc: 'Sonstige Zinsen und ähnliche Erträge (Diğer Faiz ve Benzeri Gelirler)', kw: 'Zinsertrag,Zinsen,Ertrag,Faiz,Gelir,Getiri', ex: 'Vadeli mevduat faiz geliri,Verilen borç faiz geliri' },
    '2700': { desc: 'Sonstige betriebsfremde Erträge (Dönem Dışı ve İşletme Dışı Gelirler)', kw: 'Periodenfremde,Betriebsfremde,Sonstige,Dönem dışı,Olağandışı,Gelir', ex: 'Geçmiş dönem gelir düzeltmesi,Sigorta tazminat geliri' },

    // === SINIF 3: Wareneingangs- und Bestandskonten ===
    '3000': { desc: 'Roh-, Hilfs- und Betriebsstoffe (Hammadde, Yardımcı Madde ve İşletme Malzemeleri)', kw: 'Rohstoff,Hilfsstoff,Betriebsstoff,Material,Hammadde,Malzeme,Yardımcı', ex: 'Üretim hammaddesi alımı,İşletme malzemesi alımı' },
    '3100': { desc: 'Fremdleistungen (Dış Hizmet Alımları)', kw: 'Fremdleistung,Subunternehmer,Dienstleistung,Dış hizmet,Taşeron,Fason', ex: 'Taşeron iş bedeli,Fason üretim hizmeti' },
    '3120': { desc: 'Bauleistungen eines im Inland ansässigen Unternehmers (Yurt İçi İnşaat Hizmetleri)', kw: 'Bauleistung,Bauunternehmer,İnşaat,Hizmet,Yapı,Tadilat', ex: 'İnşaat firmasından hizmet alımı' },
    '3123': { desc: 'Reverse Charge Hizmet Alımı §13b (Yurt Dışı Hizmet Alımı)', kw: 'Reverse Charge,§13b,EU,Import,Yurt dışı,Hizmet,İthal', ex: 'AB ülkesinden yazılım hizmeti alımı,Yurt dışı danışmanlık' },
    '3300': { desc: 'Wareneingang 7% Vorsteuer (Mal Alımı %7 KDV)', kw: 'Ware,Einkauf,7%,Lebensmittel,Mal,Alım,Gıda', ex: '%7 KDV ile gıda ürünü alımı' },
    '3400': { desc: 'Wareneingang 19% Vorsteuer (Mal Alımı %19 KDV)', kw: 'Ware,Einkauf,Wareneingang,19%,Mal,Alım,Ticari,Satış', ex: 'Ticari mal alımı %19 KDV,Satılmak üzere ürün alımı' },
    '3500': { desc: 'Wareneingang steuerfrei (Vergiden Muaf Mal Alımı)', kw: 'Steuerfrei,Import,Zollfrei,Vergisiz,İthalat,Muaf', ex: 'AB içi vergisiz mal alımı' },
    '3700': { desc: 'Erhaltene Nachlässe (Alınan İndirimler)', kw: 'Nachlass,Rabatt,Skonto,İndirim,İskonto,Erken ödeme', ex: 'Tedarikçiden alınan toplu alım indirimi' },
    '3730': { desc: 'Erhaltene Skonti (Erken Ödeme İndirimleri)', kw: 'Skonto,Zahlungsziel,İskonto,Erken ödeme,İndirim', ex: 'Erken ödeme iskontosu (%2)' },
    '3970': { desc: 'Bestand Roh-, Hilfs- und Betriebsstoffe (Hammadde Stoku)', kw: 'Bestand,Lager,Inventur,Stok,Envanter,Depo', ex: 'Yıl sonu hammadde stok değeri' },
    '3980': { desc: 'Bestand Waren (Ticari Mal Stoku)', kw: 'Bestand,Ware,Lager,Inventur,Stok,Mal,Depo', ex: 'Yıl sonu ticari mal stok değeri' },

    // === SINIF 4: Betriebliche Aufwendungen ===
    '4100': { desc: 'Löhne und Gehälter (Ücretler ve Maaşlar)', kw: 'Lohn,Gehalt,Bezüge,Personal,Vergütung,Maaş,Ücret,Personel', ex: 'Aylık personel maaş ödemesi,İşçi ücreti' },
    '4110': { desc: 'Löhne (İşçi Ücretleri)', kw: 'Lohn,Arbeiter,Stundenlohn,İşçi,Ücret,Saatlik', ex: 'Saatlik ücretli işçi maaşı' },
    '4120': { desc: 'Gehälter (Maaşlar)', kw: 'Gehalt,Angestellter,Monatsgehalt,Maaş,Çalışan,Aylık', ex: 'Beyaz yaka personel aylık maaşı' },
    '4124': { desc: 'Geschäftsführergehälter (Müdür Maaşları)', kw: 'Geschäftsführer,GF,Vorstand,Müdür,Yönetici,Maaş', ex: 'Şirket müdürü aylık maaşı' },
    '4125': { desc: 'Ehegattengehalt (Eş Maaşı)', kw: 'Ehegatte,Ehefrau,Partner,Eş,Maaş', ex: 'Çalışan eş aylık maaşı' },
    '4130': { desc: 'Soziale Abgaben und Aufwendungen (Sosyal Kesintiler)', kw: 'Sozialversicherung,Krankenkasse,Rente,Sozial,Sigorta,SGK,Prim,Emekli', ex: 'İşveren sosyal güvenlik primi,Sağlık sigortası payı' },
    '4140': { desc: 'Freiwillige Sozialleistungen (Gönüllü Sosyal Yardımlar)', kw: 'Freiwillig,Sozialleistung,Benefit,Zuschuss,Gönüllü,Yardım,Ek', ex: 'Çalışan yemek kartı katkısı,Spor salonu üyelik desteği' },
    '4150': { desc: 'Vermögenswirksame Leistungen (Sermaye Birikimi Ödemeleri)', kw: 'Vermögenswirksam,VWL,VL,Bauspar,Sermaye,Birikim', ex: 'Çalışan tasarruf planı işveren katkısı' },
    '4170': { desc: 'Fahrtkosten Arbeitnehmer (Personel Yol Masrafları)', kw: 'Fahrtkosten,Pendlerpauschale,Fahrtkostenzuschuss,Yol,Ulaşım,Masraf', ex: 'Personel ulaşım masrafı desteği' },
    '4190': { desc: 'Aushilfslöhne (Geçici İşçi Ücretleri)', kw: 'Aushilfe,Minijob,Teilzeit,Geçici,Part-time,Stajyer', ex: 'Yarı zamanlı çalışan ücreti,Minijob maaşı' },
    '4200': { desc: 'Raumkosten (Mekan/Kira Giderleri)', kw: 'Miete,Pacht,Raum,Gebäude,Kira,Mekan,Ofis,Büro', ex: 'Aylık ofis kirası,Depo kiralama bedeli' },
    '4210': { desc: 'Miete für Büroräume (Ofis Kirası)', kw: 'Miete,Büro,Büroraum,Geschäftsraum,Ofis,Kira', ex: 'Aylık ofis kira ödemesi' },
    '4220': { desc: 'Nebenkosten (Ek Masraflar / Aidat)', kw: 'Nebenkosten,Betriebskosten,Hausgeld,Aidat,Ortak gider,Ek masraf', ex: 'Bina yönetim aidatı,Ortak alan giderleri' },
    '4230': { desc: 'Heizung (Isıtma Giderleri)', kw: 'Heizung,Gas,Heizöl,Wärme,Isıtma,Doğalgaz,Yakıt', ex: 'Ofis doğalgaz faturası,Kalorifer yakıt gideri' },
    '4240': { desc: 'Gas, Strom, Wasser (Gaz, Elektrik, Su)', kw: 'Strom,Elektrizität,Wasser,Gas,Energie,Elektrik,Su,Enerji,Fatura', ex: 'Aylık elektrik faturası,Su faturası,Enerji gideri' },
    '4250': { desc: 'Reinigung (Temizlik Giderleri)', kw: 'Reinigung,Sauberkeit,Putz,Gebäudereinigung,Temizlik,Hijyen', ex: 'Ofis temizlik firması ödemesi,Temizlik malzemesi alımı' },
    '4260': { desc: 'Instandhaltung Betriebsräume (İşyeri Bakım Onarım)', kw: 'Instandhaltung,Renovierung,Reparatur,Wartung,Bakım,Onarım,Tadilat', ex: 'Ofis tadilatı,Boya-badana gideri,Tesisat tamiri' },
    '4280': { desc: 'Sonstige Raumkosten (Diğer Mekan Giderleri)', kw: 'Raumkosten,Sonstige,Umzug,Diğer,Mekan,Taşınma', ex: 'Ofis taşınma masrafı,Dekorasyon gideri' },
    '4360': { desc: 'Versicherung (Sigortalar — Sigorta Giderleri)', kw: 'Versicherung,Haftpflicht,Kasko,Police,Sigorta,Poliçe,Prim', ex: 'İşyeri sigortası primi,Meslek sorumluluk sigortası' },
    '4500': { desc: 'Fahrzeugkosten (Araç Giderleri)', kw: 'Fahrzeug,Auto,PKW,LKW,KFZ,Araç,Oto,Araba,Taşıt', ex: 'Şirket aracı yakıt gideri,Araç tamiri' },
    '4510': { desc: 'KFZ-Steuern (Araç Vergileri)', kw: 'KFZ-Steuer,Fahrzeugsteuer,Araç vergisi,Motorlu taşıt', ex: 'Yıllık motorlu taşıt vergisi' },
    '4520': { desc: 'KFZ-Versicherung (Araç Sigortası)', kw: 'KFZ-Versicherung,Autoversicherung,Kasko,Araç,Sigorta,Trafik', ex: 'Araç kasko sigortası,Trafik sigortası primi' },
    '4530': { desc: 'Laufende KFZ-Betriebskosten (Araç İşletme Giderleri)', kw: 'Benzin,Diesel,Tanken,Kraftstoff,Yakıt,Benzin,Motorin,Akaryakıt', ex: 'Yakıt alımı,Motorin gideri,Benzin faturası' },
    '4540': { desc: 'KFZ-Reparaturen (Araç Tamir Bakım)', kw: 'Reparatur,Werkstatt,Inspektion,TÜV,Wartung,Tamir,Bakım,Servis', ex: 'Araç servis bakımı,TÜV muayene bedeli' },
    '4570': { desc: 'KFZ-Leasing (Araç Kiralama)', kw: 'Leasing,Miete,Fahrzeug,Leasing,Kiralama,Araç', ex: 'Aylık araç leasing taksidi' },
    '4580': { desc: 'Sonstige KFZ-Kosten (Diğer Araç Giderleri)', kw: 'Parkgebühr,Maut,Waschanlage,Park,Otopark,Köprü,Geçiş', ex: 'Otopark ücreti,Otoyol geçiş ücreti,Araç yıkama' },
    '4600': { desc: 'Werbekosten (Reklam Giderleri)', kw: 'Werbung,Marketing,Anzeige,Kampagne,Reklam,Pazarlama,İlan', ex: 'Google Ads reklam gideri,Gazete ilanı,Broşür basımı' },
    '4610': { desc: 'Werbekosten (Reklam ve Tanıtım)', kw: 'Werbung,Reklam,Banner,Flyer,Plakat,Prospekt,Afiş,Broşür', ex: 'Reklam panosu kiralama,Katalog basımı' },
    '4630': { desc: 'Geschenke an Kunden (Müşteri Hediyeleri)', kw: 'Geschenk,Kundengeschenk,Giveaway,Give-away,Hediye,Müşteri,Promosyon', ex: 'Müşteri yılbaşı hediyesi (max 50€),Promosyon ürünü' },
    '4650': { desc: 'Bewirtungskosten (Ağırlama/İkram Giderleri)', kw: 'Bewirtung,Restaurant,Essen,Geschäftsessen,Ağırlama,Yemek,İkram,Restoran', ex: 'İş yemeği restoran faturası,Müşteri ağırlama gideri' },
    '4653': { desc: 'Aufmerksamkeiten (Küçük İkramlar)', kw: 'Aufmerksamkeit,Blumen,Pralinen,Kleinigkeit,İkram,Çiçek,Çikolata', ex: 'Çiçek gönderme,Küçük hediye (max 60€)' },
    '4660': { desc: 'Reisekosten Arbeitnehmer (Personel Seyahat Giderleri)', kw: 'Reise,Dienstreise,Flug,Hotel,Übernachtung,Seyahat,Uçak,Otel,Konaklama', ex: 'İş seyahati uçak bileti,Otel konaklama,Seyahat gideri' },
    '4663': { desc: 'Reisekosten Arbeitnehmer Verpflegung (Seyahat Harcırahı)', kw: 'Verpflegung,Tagegeld,Spesen,Harcırah,Yemek,Gündelik', ex: 'İş seyahatinde günlük harcırah' },
    '4670': { desc: 'Reisekosten Unternehmer (İşletme Sahibi Seyahat Giderleri)', kw: 'Reisekosten,Unternehmer,Geschäftsreise,Seyahat,İşveren,Sahip', ex: 'İşletme sahibinin iş seyahati gideri' },
    '4710': { desc: 'Verpackungsmaterial (Ambalaj Malzemesi)', kw: 'Verpackung,Karton,Folie,Palette,Ambalaj,Paketleme,Kutu,Koli', ex: 'Koli ve ambalaj malzemesi alımı' },
    '4730': { desc: 'Ausgangsfrachten (Nakliye/Kargo Giderleri)', kw: 'Fracht,Versand,Spedition,Porto,Versandkosten,Nakliye,Kargo,Gönderi', ex: 'Müşteriye kargo gönderim ücreti,Nakliye firması ödemesi' },
    '4750': { desc: 'Transportversicherung (Nakliye Sigortası)', kw: 'Transportversicherung,Warenversicherung,Nakliye,Sigorta', ex: 'Mal nakliye sigortası primi' },
    '4800': { desc: 'Reparaturen und Instandhaltung (Tamir ve Bakım)', kw: 'Reparatur,Instandhaltung,Wartung,Service,Tamir,Bakım,Onarım,Servis', ex: 'Makine bakım onarımı,Tesis servis gideri' },
    '4822': { desc: 'Abschreibungen auf Sachanlagen (Amortisman — Maddi Varlıklar)', kw: 'Abschreibung,AfA,Wertminderung,Amortisman,Değer kaybı,Yıpranma', ex: 'Yıllık makine amortismanı,Bilgisayar amortisman gideri' },
    '4830': { desc: 'Abschreibungen auf immaterielle Vermögensgegenstände (Amortisman — Maddi Olmayan Varlıklar)', kw: 'Abschreibung,AfA,Immateriell,Amortisman,Yazılım,Patent', ex: 'Yazılım lisansı amortismanı' },
    '4855': { desc: 'Sofortabschreibung GWG (Düşük Değerli Varlık Anlık Amortisman)', kw: 'Sofortabschreibung,GWG,Geringwertig,Anlık,Amortisman,Gider', ex: '250€ altı demirbaş anlık giderleştirme' },
    '4900': { desc: 'Sonstige betriebliche Aufwendungen (Diğer İşletme Giderleri)', kw: 'Sonstige,Aufwendung,Betrieblich,Diğer,Genel,Gider,İşletme', ex: 'Sınıflandırılamayan diğer giderler' },
    '4910': { desc: 'Porto (Posta ve Kargo Giderleri)', kw: 'Porto,Brief,Paket,Post,Frankierung,Posta,Mektup,Gönderi,Pul', ex: 'Posta pulu alımı,Kargo gönderim ücreti' },
    '4920': { desc: 'Bürobedarf (Kırtasiye Giderleri)', kw: 'Bürobedarf,Büromaterial,Papier,Toner,Druckerpapier,Stift,Ordner,Kırtasiye,Kalem,Kağıt,Toner,Dosya,Klasör,Zımba,Makas', ex: 'Yazıcı toneri,A4 kağıt alımı,Dosya ve klasör,Kalem ve kırtasiye malzemesi' },
    '4925': { desc: 'Zeitungen und Zeitschriften (Gazete ve Dergiler)', kw: 'Zeitung,Zeitschrift,Abo,Magazin,Gazete,Dergi,Abonelik,Yayın', ex: 'Meslek dergisi aboneliği,Gazete abonelik bedeli' },
    '4930': { desc: 'Bücher und Fachliteratur (Kitap ve Uzmanlık Yayınları)', kw: 'Buch,Fachliteratur,Lehrbuch,Nachschlagewerk,Kitap,Yayın,Kaynak', ex: 'Muhasebe kitabı alımı,Teknik el kitabı' },
    '4940': { desc: 'Beiträge (Aidat ve Üyelik Giderleri)', kw: 'Beitrag,Mitgliedschaft,Verein,Verband,Kammer,IHK,Aidat,Üyelik,Oda', ex: 'IHK (Ticaret Odası) aidatı,Meslek birliği üyelik bedeli' },
    '4945': { desc: 'Aus- und Weiterbildung (Eğitim Giderleri)', kw: 'Weiterbildung,Fortbildung,Schulung,Seminar,Kurs,Eğitim,Kurs,Seminer', ex: 'Personel eğitim semineri,Online kurs bedeli' },
    '4950': { desc: 'Rechts- und Beratungskosten (Hukuk ve Danışmanlık Giderleri)', kw: 'Rechtsanwalt,Anwalt,Beratung,Notar,Steuerberater,Avukat,Danışman,Hukuk,Müşavir,Noter', ex: 'Avukat danışma ücreti,Mali müşavir bedeli,Noter masrafları' },
    '4955': { desc: 'Buchführungskosten (Muhasebe Giderleri)', kw: 'Buchführung,Buchhaltung,Jahresabschluss,Muhasebe,Defter,Bilanço', ex: 'Muhasebe bürosu aylık ücreti,Yüllık bilanço hazırlama bedeli' },
    '4957': { desc: 'Abschluss- und Prüfungskosten (Denetim ve Kapanış Giderleri)', kw: 'Prüfung,Abschluss,Audit,Wirtschaftsprüfer,Denetim,Bağımsız', ex: 'Bağımsız denetim ücreti' },
    '4960': { desc: 'Miete für Geräte (Cihaz Kiralama)', kw: 'Miete,Gerät,Leasing,Kopierer,Drucker,Kiralama,Cihaz,Fotokopi,Yazıcı', ex: 'Fotokopi makinesi kiralama,Yazıcı leasing bedeli' },
    '4964': { desc: 'Nicht abziehbare Vorsteuer (İndirilemez KDV)', kw: 'Nicht abziehbar,Vorsteuer,İndirilemez,KDV', ex: 'İş dışı kullanım KDV gideri' },
    '4969': { desc: 'Telefon (Telefon Giderleri)', kw: 'Telefon,Handy,Mobilfunk,Smartphone,Telefon,Cep,Mobil,Hat', ex: 'Aylık telefon faturası,Cep telefonu hattı ödemesi' },
    '4970': { desc: 'Nebenkosten des Geldverkehrs (Banka Masrafları)', kw: 'Bankgebühr,Kontoführung,Überweisungsgebühr,Banka,Masraf,Komisyon,Havale', ex: 'Aylık hesap işletim ücreti,Havale komisyonu' },
    '4980': { desc: 'Sonstige Aufwendungen betrieblich (Diğer İşletme Giderleri)', kw: 'Sonstige,Betriebsausgabe,Verschiedene,Diğer,Çeşitli,Gider', ex: 'Çeşitli işletme giderleri' },
    '4985': { desc: 'Werkzeuge und Kleingeräte (Alet ve Küçük Cihazlar)', kw: 'Werkzeug,Kleingerät,Arbeitsmittel,Alet,Cihaz,Küçük,Edevat', ex: 'El aleti alımı,Küçük ölçüm cihazı' },

    // === SINIF 8: Erlöskonten ===
    '8100': { desc: 'Steuerfreie Umsätze (Vergiden Muaf Satışlar)', kw: 'Steuerfrei,Umsatz,Export,Vergisiz,Muaf,Satış,İhracat', ex: 'Vergiden muaf yurt dışı satış,İhracat geliri' },
    '8120': { desc: 'Steuerfreie Innergemeinschaftliche Lieferungen (AB İçi Vergisiz Teslimat)', kw: 'Innergemeinschaftlich,Lieferung,EU,AB içi,Teslimat,Vergisiz', ex: 'AB ülkesine vergisiz mal teslimatı' },
    '8125': { desc: 'Steuerfreie Innergemeinschaftliche Lieferung an Unternehmen (AB İçi Kurumsal Teslimat)', kw: 'Innergemeinschaftlich,EU,Unternehmen,AB,Kurumsal,Teslimat', ex: 'AB ülkesindeki şirkete KDV\'siz satış' },
    '8300': { desc: 'Erlöse 7% USt (Satış Geliri %7 KDV)', kw: 'Erlöse,Umsatz,7%,Lebensmittel,Satış,Gelir,Gıda', ex: '%7 KDV ile gıda ürünü satışı' },
    '8336': { desc: 'Erlöse §13b Reverse Charge (Tersine Vergileme ile Satış)', kw: 'Reverse Charge,§13b,Drittland,Tersine,Vergileme,Yurt dışı', ex: 'Yurt dışı hizmet satışı (§13b)' },
    '8400': { desc: 'Erlöse 19% USt (Satış Geliri %19 KDV)', kw: 'Erlöse,Umsatz,Verkauf,19%,Satış,Gelir,Hasılat,Ciro', ex: 'Standart %19 KDV ile ürün satışı,Hizmet satışı' },
    '8700': { desc: 'Erlösschmälerungen (Gelir İndirimleri)', kw: 'Erlösschmälerung,Nachlass,Rabatt,İndirim,İskonto,Satış', ex: 'Müşteriye verilen iskonto' },
    '8736': { desc: 'Gewährte Skonti 19% USt (Verilen İskonto %19)', kw: 'Skonto,Gewährt,19%,İskonto,Erken ödeme', ex: 'Müşteriye erken ödeme iskontosu' },
    '8800': { desc: 'Erlöse aus Anlageabgängen (Duran Varlık Satış Geliri)', kw: 'Anlageabgang,Verkauf,Anlagevermögen,Duran varlık,Satış', ex: 'Eski makine satışı geliri,İkinci el bilgisayar satışı' },
    '8900': { desc: 'Unentgeltliche Wertabgaben (Bedelsiz Şahsi Kullanım)', kw: 'Wertabgabe,Sachenentnahme,Privatverbrauch,Bedelsiz,Şahsi,Kullanım', ex: 'İşletme malının sahibi tarafından şahsi kullanımı' },

    // === SINIF 9: Vortrags- und Statistische Konten ===
    '9000': { desc: 'Saldenvorträge Sachkonten (Hesap Bakiyeleri Devri)', kw: 'Saldenvortrag,Eröffnung,Devir,Bakiye,Açılış', ex: 'Yeni yıla bakiye devri' },
    '9008': { desc: 'Saldenvorträge Debitoren (Müşteri Bakiye Devri)', kw: 'Debitor,Saldenvortrag,Müşteri,Devir,Alacak', ex: 'Müşteri alacak bakiyesi devri' },
    '9009': { desc: 'Saldenvorträge Kreditoren (Tedarikçi Bakiye Devri)', kw: 'Kreditor,Saldenvortrag,Tedarikçi,Devir,Borç', ex: 'Tedarikçi borç bakiyesi devri' },
    '9100': { desc: 'Statistische Konten (İstatistiksel Hesaplar)', kw: 'Statistik,Mengeneinheit,Arbeitstage,İstatistik,Veri,Rapor', ex: 'Aylık satış günleri girişi' },
};

// Apply keyword DB
let appliedCount = 0;
for (const [code, data] of Object.entries(keywordDB)) {
    if (!existingCodes.has(code)) continue;

    if (!accountMeta.has(code)) {
        accountMeta.set(code, { description: '', keywords: new Set(), examples: new Set() });
    }
    const meta = accountMeta.get(code);

    if (data.desc) meta.description = data.desc;
    if (data.kw) {
        data.kw.split(',').forEach(k => {
            k = k.trim();
            if (k.length > 1) meta.keywords.add(k);
        });
    }
    if (data.ex) {
        data.ex.split(',').forEach(e => {
            e = e.trim();
            if (e.length > 3) meta.examples.add(e);
        });
    }
    appliedCount++;
}

console.log(`Applied keyword DB to ${appliedCount} accounts.`);
console.log(`Total accounts with metadata: ${accountMeta.size}`);

// ===== Generate the metadata TypeScript file =====
let output = `/**
 * DATEV SKR03 Hesap Planı — Açıklama, Anahtar Kelime ve Örnek Veritabanı
 * Kaynak: datev.pdf (90 sayfa) — Kural motoru ve fatura analizi için hazırlanmıştır
 * Total: ${accountMeta.size} hesap ile detaylı bilgi
 *
 * Bu dosya fatura analizi sırasında AI kural motorunun doğru hesap kodunu
 * seçmesi için anahtar kelime eşleştirmesi ve örnek işlem tanımları içerir.
 */

export interface AccountMetadata {
    /** Hesabın açıklaması (TR ve DE) */
    description: string;
    /** Kural motoru anahtar kelimeleri — fatura metninde aranacak */
    keywords: string[];
    /** Örnek işlem tanımları */
    examples: string[];
}

/**
 * Hesap kodu → Metadata eşleştirmesi
 * Kural motoru bu veritabanını kullanarak fatura kalemlerini otomatik olarak
 * doğru hesap kodlarına atar.
 */
export const ACCOUNT_METADATA: Record<string, AccountMetadata> = {\n`;

const sortedMeta = Array.from(accountMeta.entries()).sort((a, b) => a[0].localeCompare(b[0]));
for (const [code, meta] of sortedMeta) {
    const desc = meta.description.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const keywords = Array.from(meta.keywords).map(k => `'${k.replace(/'/g, "\\'")}'`).join(', ');
    const examples = Array.from(meta.examples).map(e => `'${e.replace(/'/g, "\\'")}'`).join(', ');

    output += `    '${code}': {\n`;
    output += `        description: '${desc}',\n`;
    output += `        keywords: [${keywords}],\n`;
    output += `        examples: [${examples}],\n`;
    output += `    },\n`;
}

output += `};

/**
 * Anahtar kelimeye göre hesap kodu ara
 * @param keyword - Aranacak kelime
 * @returns Eşleşen hesap kodları ve skor
 */
export function searchByKeyword(keyword: string): { code: string; score: number; description: string }[] {
    const q = keyword.toLowerCase().trim();
    const results: { code: string; score: number; description: string }[] = [];
    
    for (const [code, meta] of Object.entries(ACCOUNT_METADATA)) {
        let score = 0;
        
        // Check keywords
        for (const kw of meta.keywords) {
            if (kw.toLowerCase().includes(q)) score += 10;
            if (kw.toLowerCase() === q) score += 20;
        }
        
        // Check description
        if (meta.description.toLowerCase().includes(q)) score += 5;
        
        // Check examples
        for (const ex of meta.examples) {
            if (ex.toLowerCase().includes(q)) score += 3;
        }
        
        if (score > 0) {
            results.push({ code, score, description: meta.description });
        }
    }
    
    return results.sort((a, b) => b.score - a.score);
}

/**
 * Fatura metni analiz ederek en uygun hesap kodlarını öner
 * @param text - Fatura kalemi açıklaması
 * @returns İlk 5 öneri
 */
export function suggestAccountCodes(text: string): { code: string; score: number; description: string }[] {
    const words = text.toLowerCase().split(/\\s+/);
    const scoreMap = new Map<string, number>();
    
    for (const word of words) {
        if (word.length < 2) continue;
        const matches = searchByKeyword(word);
        for (const m of matches) {
            scoreMap.set(m.code, (scoreMap.get(m.code) || 0) + m.score);
        }
    }
    
    const results: { code: string; score: number; description: string }[] = [];
    for (const [code, score] of scoreMap.entries()) {
        const meta = ACCOUNT_METADATA[code];
        if (meta) {
            results.push({ code, score, description: meta.description });
        }
    }
    
    return results.sort((a, b) => b.score - a.score).slice(0, 5);
}
`;

fs.writeFileSync(path.join(process.cwd(), 'data/skr03Metadata.ts'), output);
console.log(`\nSuccessfully wrote data/skr03Metadata.ts`);
console.log(`Accounts with metadata: ${accountMeta.size}`);

// Stats
let kwTotal = 0, exTotal = 0;
for (const [, meta] of accountMeta.entries()) {
    kwTotal += meta.keywords.size;
    exTotal += meta.examples.size;
}
console.log(`Total keywords: ${kwTotal}`);
console.log(`Total examples: ${exTotal}`);
