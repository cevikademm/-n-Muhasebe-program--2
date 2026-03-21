const fs = require('fs');
const path = require('path');

// Read skr03Full.ts to extract ALL accounts
const tsContent = fs.readFileSync(path.join(__dirname, 'data/skr03Full.ts'), 'utf8');

// Extract all accounts with code, name, funktion, abschlusszweck, zusatzfunktion
const accounts = [];
const accRegex = /\{\s*code:\s*"(\d{4})",\s*name:\s*"([^"]*)",\s*funktion:\s*"([^"]*)",\s*abschlusszweck:\s*"([^"]*)"(?:,\s*zusatzfunktion:\s*"([^"]*)")?\s*\}/g;
let m;
while ((m = accRegex.exec(tsContent)) !== null) {
    accounts.push({
        code: m[1],
        name: m[2],
        funktion: m[3],
        abschlusszweck: m[4],
        zusatzfunktion: m[5] || ''
    });
}
console.log(`Found ${accounts.length} accounts in skr03Full.ts`);

// ===== COMPREHENSIVE KEYWORD DATABASE =====
// Category mapping based on Klasse
function getKategorie(code) {
    const k = parseInt(code[0]);
    switch (k) {
        case 0: return code >= '0800' ? 'Sermaye' : 'Duran Varlık';
        case 1: {
            if (code >= '1800') return 'Özel Hesap';
            if (code >= '1700') return 'Borç';
            if (code >= '1570' && code <= '1590') return 'KDV (Giriş)';
            if (code >= '1770' && code <= '1790') return 'KDV (Çıkış)';
            if (code >= '1600') return 'Borç';
            if (code >= '1400') return 'Alacak';
            return 'Finans';
        }
        case 2: return 'Abgrenzung';
        case 3: {
            if (code >= '3900') return 'Stok';
            if (code >= '3700') return 'İndirim';
            return 'Mal Alımı';
        }
        case 4: return 'İşletme Gideri';
        case 5: return 'Sonderposten';
        case 6: return 'Sonderposten';
        case 7: return 'Stok Değişim';
        case 8: {
            if (code >= '8900') return 'Bedelsiz Kullanım';
            if (code >= '8700') return 'Gelir İndirimi';
            return 'Satış Geliri';
        }
        case 9: {
            if (code >= '9100') return 'İstatistik';
            return 'Devir';
        }
        default: return '';
    }
}

// KDV rate extraction from name
function extractKDVRate(name) {
    const m7 = name.match(/7\s*%/);
    const m19 = name.match(/19\s*%/);
    const m0 = name.match(/steuerfrei|ohne\s+(?:Vorsteuer|USt)/i);
    const m5 = name.match(/5\s*%/);
    const m16 = name.match(/16\s*%/);
    if (m19) return '19%';
    if (m7) return '7%';
    if (m16) return '16%';
    if (m5) return '5%';
    if (m0) return '0%';
    return '';
}

// Taraf (Soll/Haben default side)
function getTaraf(code) {
    const k = parseInt(code[0]);
    switch (k) {
        case 0: return code >= '0800' ? 'H' : 'S'; // Passiva = Haben, Aktiva = Soll
        case 1: return code >= '1600' ? 'H' : 'S'; // Verbindlichkeiten = Haben
        case 2: return code >= '2600' ? 'H' : 'S'; // Erträge = Haben
        case 3: return 'S'; // Aufwand = Soll
        case 4: return 'S'; // Aufwand = Soll
        case 7: return 'S'; // Bestandsveränderungen
        case 8: return 'H'; // Erlöse = Haben
        case 9: return 'S';
        default: return '';
    }
}

// ===== COMPREHENSIVE KEYWORD PATTERNS BY ACCOUNT NAME =====
const nameKeywordMap = [
    // Immaterielle Vermögensgegenstände
    { pattern: /Konzession/i, kw: ['Konzession', 'İmtiyaz', 'Ruhsat', 'Genehmigung', 'Betriebserlaubnis'], ex: ['Belediye işletme ruhsatı', 'Ticaret izni bedeli'] },
    { pattern: /Schutzrecht|Patent/i, kw: ['Patent', 'Schutzrecht', 'Gebrauchsmuster', 'Marke', 'Ticari koruma'], ex: ['Patent tescil bedeli', 'Marka koruma hakkı'] },
    { pattern: /Software|EDV/i, kw: ['Software', 'Yazılım', 'Programm', 'IT', 'Lizenz', 'ERP', 'CRM', 'App', 'SaaS', 'Cloud'], ex: ['ERP yazılımı lisansı', 'Muhasebe programı', 'CRM yazılımı', 'Office 365 aboneliği'] },
    { pattern: /Lizenz/i, kw: ['Lizenz', 'Lisans', 'Franchise', 'Nutzungsrecht', 'Recht'], ex: ['Yazılım lisansı', 'Franchise sözleşmesi'] },
    { pattern: /Firmenwert|Geschäftswert/i, kw: ['Firmenwert', 'Goodwill', 'Şerefiye', 'Übernahme', 'Marka değeri'], ex: ['Şirket devralma şerefiyesi'] },
    { pattern: /Selbst geschaffen/i, kw: ['Eigenentwicklung', 'Ar-Ge', 'F&E', 'Forschung', 'Entwicklung', 'Selbst erstellt'], ex: ['Kurum içi yazılım geliştirme', 'Ar-Ge projesi'] },
    { pattern: /Grundstück/i, kw: ['Grundstück', 'Arsa', 'Boden', 'Land', 'Fläche', 'Immobilie', 'Arazi'], ex: ['Fabrika arsası alımı', 'Arsa satın alımı'] },
    { pattern: /Bauten|Gebäude/i, kw: ['Gebäude', 'Bau', 'Bina', 'Immobilie', 'Halle', 'Fabrika', 'Ofis binası'], ex: ['Ofis binası alımı', 'Fabrika inşaatı'] },
    { pattern: /Maschine/i, kw: ['Maschine', 'Makine', 'Anlage', 'Produktion', 'CNC', 'Üretim', 'Fertigung', 'Tesis'], ex: ['CNC tezgah alımı', 'Üretim makinesi', 'Paketleme makinesi'] },
    { pattern: /Betriebs.*ausstattung|Geschäftsausstattung/i, kw: ['Ausstattung', 'Donanım', 'Einrichtung', 'Mobilya', 'Büromöbel', 'Möbel'], ex: ['Büro mobilyası', 'Ofis donanımı'] },
    { pattern: /Büroeinrichtung/i, kw: ['Büro', 'Einrichtung', 'Mobilya', 'Masa', 'Sandalye', 'Dolap', 'Ofis'], ex: ['Ofis masası alımı', 'Büro dolabı'] },
    { pattern: /Werkzeug/i, kw: ['Werkzeug', 'Alet', 'Edevat', 'Arbeitsmittel', 'Kleingerät'], ex: ['El aleti alımı', 'Ölçüm cihazı'] },
    { pattern: /Fahrzeug|PKW|LKW|KFZ/i, kw: ['Fahrzeug', 'PKW', 'LKW', 'KFZ', 'Araç', 'Oto', 'Araba', 'Taşıt', 'Kamyon'], ex: ['Şirket aracı alımı', 'Ticari araç'] },
    { pattern: /Computer|EDV.*Hardware|IT.*Anlage/i, kw: ['Computer', 'PC', 'Laptop', 'Server', 'Hardware', 'Bilgisayar', 'Donanım'], ex: ['Bilgisayar alımı', 'Server donanımı', 'Laptop alımı'] },
    { pattern: /Geringwertig|GWG/i, kw: ['GWG', 'Geringwertig', 'Düşük değerli', 'Demirbaş', 'Sofortabschreibung'], ex: ['250€ altı demirbaş', 'Küçük ofis eşyası'] },
    { pattern: /Beteiligung/i, kw: ['Beteiligung', 'İştirak', 'Anteile', 'Hisse', 'Aktien', 'Gesellschaft'], ex: ['Şirket hissesi alımı', 'İştirak payı'] },
    { pattern: /Darlehen|Ausleihung/i, kw: ['Darlehen', 'Kredit', 'Borç', 'Kredi', 'Finanzierung', 'Ausleihung'], ex: ['Uzun vadeli kredi', 'Personele verilen borç'] },
    { pattern: /Kapital|Stammkapital/i, kw: ['Kapital', 'Sermaye', 'Stammkapital', 'Grundkapital', 'Esas'], ex: ['Şirket sermayesi', 'Sermaye artırımı'] },
    { pattern: /Rücklage|Reserve/i, kw: ['Rücklage', 'Reserve', 'Yedek', 'Akçe', 'Birikim'], ex: ['Yedek akçe ayrılması'] },
    { pattern: /Rückstellung/i, kw: ['Rückstellung', 'Karşılık', 'Provision', 'Verpflichtung'], ex: ['Emeklilik karşılığı', 'Vergi karşılığı'] },
    { pattern: /Abgrenzung/i, kw: ['Abgrenzung', 'Dönemsellik', 'Rechnungsabgrenzung', 'Tahakkuk'], ex: ['Peşin ödenen kira tahakkuku'] },

    // Finanz- und Privatkonten (Klasse 1)
    { pattern: /^Kasse$/i, kw: ['Kasse', 'Bargeld', 'Nakit', 'Kasa', 'Bar', 'Peşin', 'Münze', 'Schein'], ex: ['Kasadan nakit ödeme', 'Nakit tahsilat'] },
    { pattern: /Bank/i, kw: ['Bank', 'Banka', 'Konto', 'Girokonto', 'Havale', 'EFT', 'Überweisung', 'IBAN'], ex: ['Banka havalesi', 'EFT ödemesi', 'Otomatik ödeme'] },
    { pattern: /Wertpapier|Finanzanlage/i, kw: ['Wertpapier', 'Menkul', 'Anleihe', 'Aktie', 'Fonds', 'Tahvil', 'Bono'], ex: ['Hazine bonosu', 'Yatırım fonu'] },
    { pattern: /Geldtransit/i, kw: ['Transit', 'Transfer', 'Umlauf', 'Geçiş', 'Havale'], ex: ['Para transferi geçiş hesabı'] },
    { pattern: /Forderung/i, kw: ['Forderung', 'Alacak', 'Debitor', 'Rechnung', 'Müşteri', 'Fatura', 'Tahsilat'], ex: ['Müşteri fatura alacağı', 'Ticari alacak'] },
    { pattern: /Sonstige Vermögen/i, kw: ['Vermögen', 'Kaution', 'Teminat', 'Depozito', 'Sonstige', 'Diğer varlık'], ex: ['Kira teminatı', 'Depozito ödemesi'] },
    { pattern: /Vorsteuer/i, kw: ['Vorsteuer', 'KDV', 'İndirilecek', 'VSt', 'Giriş vergisi', 'Mehrwertsteuer'], ex: ['Alım faturası KDV', 'İndirilecek KDV'] },
    { pattern: /Verbindlichkeit/i, kw: ['Verbindlichkeit', 'Borç', 'Kreditor', 'Lieferant', 'Tedarikçi', 'Schuld'], ex: ['Tedarikçi borcu', 'Ticari borç'] },
    { pattern: /Umsatzsteuer/i, kw: ['Umsatzsteuer', 'USt', 'KDV', 'Çıkış vergisi', 'MwSt', 'Hesaplanan'], ex: ['Satış faturası KDV', 'Hesaplanan KDV'] },
    { pattern: /Privatentnahme/i, kw: ['Privat', 'Entnahme', 'Çekim', 'Kişisel', 'Özel', 'Sahip'], ex: ['İşletme sahibi kişisel çekimi'] },
    { pattern: /Privateinlage/i, kw: ['Privat', 'Einlage', 'Sermaye', 'Kişisel', 'Koyma'], ex: ['Kişisel sermaye koyma'] },
    { pattern: /Steuererstattung/i, kw: ['Erstattung', 'İade', 'Finanzamt', 'Vergi', 'Steuer'], ex: ['Vergi iadesi alacağı'] },

    // Abgrenzungskonten (Klasse 2)
    { pattern: /Zinsen.*Aufwend|Zinsaufwand/i, kw: ['Zinsen', 'Faiz', 'Kredit', 'Darlehen', 'Finanzierung', 'Gider', 'Banka'], ex: ['Banka kredi faizi', 'Overdraft faizi'] },
    { pattern: /Körperschaftsteuer/i, kw: ['Körperschaftsteuer', 'KSt', 'Kurumlar vergisi', 'Steuer', 'Vergi'], ex: ['Kurumlar vergisi taksidi'] },
    { pattern: /Gewerbesteuer/i, kw: ['Gewerbesteuer', 'GewSt', 'Ticaret vergisi', 'Gewerbe'], ex: ['Ticaret vergisi ödemesi'] },
    { pattern: /Solidaritätszuschlag/i, kw: ['Solidaritätszuschlag', 'SolZ', 'Dayanışma', 'Zuschlag', 'Ek vergi'], ex: ['Dayanışma vergisi'] },
    { pattern: /Forderungsverlust/i, kw: ['Forderungsverlust', 'Alacak zarar', 'Abschreibung', 'Şüpheli', 'Tahsil edilemez'], ex: ['Tahsil edilemeyen alacak', 'Şüpheli alacak gideri'] },
    { pattern: /Zinsertrag|Zinsen.*Ertrag/i, kw: ['Zinsertrag', 'Faiz geliri', 'Zinsen', 'Ertrag', 'Getiri'], ex: ['Vadeli mevduat faizi', 'Borç faiz geliri'] },
    { pattern: /periodenfremde.*Ertrag/i, kw: ['Periodenfremde', 'Dönem dışı', 'Sonstige', 'Gelir', 'Olağandışı'], ex: ['Geçmiş dönem düzeltme geliri'] },
    { pattern: /periodenfremde.*Aufwend/i, kw: ['Periodenfremde', 'Dönem dışı', 'Sonstige', 'Gider', 'Olağandışı'], ex: ['Geçmiş dönem düzeltme gideri'] },

    // Wareneingang (Klasse 3)
    { pattern: /Rohstoff|Roh-.*Hilfs/i, kw: ['Rohstoff', 'Hilfsstoff', 'Hammadde', 'Malzeme', 'Material', 'Yardımcı madde'], ex: ['Üretim hammaddesi', 'İşletme malzemesi'] },
    { pattern: /Fremdleistung/i, kw: ['Fremdleistung', 'Dış hizmet', 'Subunternehmer', 'Taşeron', 'Fason', 'Dienstleistung'], ex: ['Taşeron iş bedeli', 'Fason üretim'] },
    { pattern: /Bauleistung/i, kw: ['Bauleistung', 'İnşaat', 'Bau', 'Yapı', 'Tadilat', 'Renovierung'], ex: ['İnşaat hizmeti alımı'] },
    { pattern: /Reverse.*Charge|§\s*13\s*b/i, kw: ['Reverse Charge', '§13b', 'Tersine vergi', 'EU', 'Import', 'İthal', 'Yurt dışı'], ex: ['Yurt dışı hizmet alımı (§13b)', 'AB içi Reverse Charge'] },
    { pattern: /Wareneingang/i, kw: ['Ware', 'Einkauf', 'Mal', 'Alım', 'Ticari mal', 'Wareneingang', 'Satın alma'], ex: ['Ticari mal alımı', 'Satılmak üzere ürün'] },
    { pattern: /Nachlass|Nachlässe/i, kw: ['Nachlass', 'İndirim', 'Rabatt', 'Preisnachlass', 'Fiyat indirimi'], ex: ['Tedarikçi toplu alım indirimi'] },
    { pattern: /Skont/i, kw: ['Skonto', 'İskonto', 'Erken ödeme', 'Zahlungsziel', 'Vade'], ex: ['Erken ödeme iskontosu (%2)'] },
    { pattern: /Bestand.*Roh/i, kw: ['Bestand', 'Stok', 'Lager', 'Hammadde', 'Envanter', 'Inventur'], ex: ['Yıl sonu hammadde stoku'] },
    { pattern: /Bestand.*Ware/i, kw: ['Bestand', 'Stok', 'Mal', 'Lager', 'Depo', 'Envanter'], ex: ['Yıl sonu ticari mal stoku'] },
    { pattern: /Bestandsveränderung/i, kw: ['Bestandsveränderung', 'Stok değişimi', 'Lager', 'Envanter'], ex: ['Stok artış/azalış kaydı'] },
    { pattern: /Anschaffungsnebenkosten/i, kw: ['Nebenkosten', 'Ek maliyet', 'Transport', 'Zoll', 'Nakliye', 'Gümrük'], ex: ['İthalat gümrük masrafı', 'Nakliye ek maliyeti'] },
    { pattern: /Innergemeinschaftlich.*Erwerb/i, kw: ['EU', 'AB içi', 'Innergemeinschaftlich', 'Erwerb', 'Yurt içi'], ex: ['AB ülkesinden mal alımı'] },
    { pattern: /Leistung.*Ausland|EU.*Leistung/i, kw: ['Ausland', 'EU', 'Yurt dışı', 'Leistung', 'Hizmet', 'Import'], ex: ['Yurt dışından hizmet alımı'] },

    // Betriebliche Aufwendungen (Klasse 4)
    { pattern: /Löhne|Lohn/i, kw: ['Lohn', 'İşçi ücreti', 'Gehalt', 'Bruttolohn', 'Maaş', 'Ücret', 'Personel'], ex: ['İşçi brüt maaş ödemesi'] },
    { pattern: /Gehalt|Gehälter/i, kw: ['Gehalt', 'Maaş', 'Angestellter', 'Vergütung', 'Çalışan', 'Personel', 'Aylık'], ex: ['Aylık personel maaş ödemesi'] },
    { pattern: /Geschäftsführer/i, kw: ['Geschäftsführer', 'Müdür', 'GF', 'Vorstand', 'Yönetici', 'Direktör'], ex: ['Şirket müdürü maaşı'] },
    { pattern: /Ehegatte/i, kw: ['Ehegatte', 'Eş', 'Partner', 'Ehefrau', 'Ehemann'], ex: ['Çalışan eş maaşı'] },
    { pattern: /Sozial.*Abgabe|Sozialversicherung/i, kw: ['Sozialversicherung', 'SGK', 'Prim', 'Sigorta', 'Rente', 'Emekli', 'Krankenkasse'], ex: ['İşveren SGK primi', 'Sağlık sigortası'] },
    { pattern: /Freiwillig.*Sozial/i, kw: ['Freiwillig', 'Gönüllü', 'Benefit', 'Zuschuss', 'Yardım', 'Ek hak'], ex: ['Yemek kartı katkısı', 'Ulaşım desteği'] },
    { pattern: /Vermögenswirksam/i, kw: ['VWL', 'VL', 'Vermögenswirksam', 'Bauspar', 'Tasarruf', 'Birikim'], ex: ['Çalışan tasarruf planı katkısı'] },
    { pattern: /Fahrtkosten/i, kw: ['Fahrtkosten', 'Yol masrafı', 'Pendler', 'Ulaşım', 'Fahrtkostenzuschuss'], ex: ['Personel ulaşım desteği'] },
    { pattern: /Aushilf/i, kw: ['Aushilfe', 'Minijob', 'Geçici işçi', 'Teilzeit', 'Part-time', '450€'], ex: ['Yarı zamanlı çalışan ücreti', 'Minijob maaşı'] },
    { pattern: /Miete|Pacht/i, kw: ['Miete', 'Kira', 'Pacht', 'Büro', 'Ofis', 'Geschäftsraum', 'Mietobjekt'], ex: ['Aylık ofis kirası', 'Depo kiralama'] },
    { pattern: /Leasing/i, kw: ['Leasing', 'Kiralama', 'Miete', 'Finanzierung', 'Taksit', 'Rate'], ex: ['Leasing taksit ödemesi'] },
    { pattern: /Heizung/i, kw: ['Heizung', 'Isıtma', 'Gas', 'Heizöl', 'Doğalgaz', 'Yakıt', 'Wärme'], ex: ['Doğalgaz faturası', 'Isıtma yakıtı'] },
    { pattern: /Strom|Elektri|Gas.*Wasser/i, kw: ['Strom', 'Elektrik', 'Wasser', 'Su', 'Gas', 'Energie', 'Enerji', 'Fatura'], ex: ['Elektrik faturası', 'Su faturası', 'Enerji gideri'] },
    { pattern: /Reinigung/i, kw: ['Reinigung', 'Temizlik', 'Putz', 'Gebäudereinigung', 'Hijyen'], ex: ['Ofis temizlik hizmeti', 'Temizlik malzemesi'] },
    { pattern: /Instandhaltung|Instandsetzung/i, kw: ['Instandhaltung', 'Bakım', 'Reparatur', 'Wartung', 'Onarım', 'Tadilat'], ex: ['Ofis tadilatı', 'Tesisat tamiri'] },
    { pattern: /Versicherung(?!.*fahr)/i, kw: ['Versicherung', 'Sigorta', 'Haftpflicht', 'Police', 'Poliçe', 'Prim'], ex: ['İşyeri sigortası', 'Sorumluluk sigortası'] },
    { pattern: /KFZ.*Steuer|Fahrzeugsteuer/i, kw: ['KFZ-Steuer', 'Araç vergisi', 'Motorlu taşıt', 'Fahrzeugsteuer'], ex: ['Yıllık motorlu taşıt vergisi'] },
    { pattern: /KFZ.*Versicherung|Autoversicherung/i, kw: ['KFZ-Versicherung', 'Araç sigortası', 'Kasko', 'Trafik sigortası'], ex: ['Araç kasko sigortası', 'Trafik sigortası'] },
    { pattern: /Benzin|Diesel|Kraftstoff|Tankstelle/i, kw: ['Benzin', 'Diesel', 'Yakıt', 'Tanken', 'Kraftstoff', 'Akaryakıt', 'Motorin'], ex: ['Yakıt alımı', 'Benzin faturası'] },
    { pattern: /Fahrzeug.*Reparatur|KFZ.*Reparatur/i, kw: ['Reparatur', 'Werkstatt', 'TÜV', 'Inspektion', 'Araç tamiri', 'Servis'], ex: ['Araç servis bakımı', 'TÜV muayenesi'] },
    { pattern: /Werbung|Werbekosten/i, kw: ['Werbung', 'Reklam', 'Marketing', 'Anzeige', 'Kampagne', 'Pazarlama', 'İlan', 'Online'], ex: ['Google Ads reklam', 'Gazete ilanı', 'Sosyal medya reklamı'] },
    { pattern: /Geschenk/i, kw: ['Geschenk', 'Hediye', 'Müşteri', 'Giveaway', 'Promosyon', 'Kundenpflege'], ex: ['Müşteri hediyesi (max 50€)', 'Promosyon ürünü'] },
    { pattern: /Bewirtung/i, kw: ['Bewirtung', 'Ağırlama', 'Restaurant', 'Essen', 'Yemek', 'İkram', 'Geschäftsessen'], ex: ['İş yemeği faturası', 'Müşteri ağırlama'] },
    { pattern: /Aufmerksamkeit/i, kw: ['Aufmerksamkeit', 'Küçük ikram', 'Blumen', 'Çiçek', 'Çikolata', 'Kleinigkeit'], ex: ['Çiçek gönderme', 'Küçük hediye (max 60€)'] },
    { pattern: /Reisekosten|Dienstreise/i, kw: ['Reise', 'Seyahat', 'Flug', 'Uçak', 'Hotel', 'Otel', 'Übernachtung', 'Konaklama', 'Dienstreise'], ex: ['İş seyahati uçak bileti', 'Otel konaklama'] },
    { pattern: /Verpflegung|Tagegeld/i, kw: ['Verpflegung', 'Harcırah', 'Tagegeld', 'Spesen', 'Yemek', 'Gündelik'], ex: ['Seyahat harcırahı', 'Günlük yemek harcırahı'] },
    { pattern: /Verpackung|Karton/i, kw: ['Verpackung', 'Ambalaj', 'Karton', 'Koli', 'Folie', 'Paketleme'], ex: ['Koli ve ambalaj malzemesi'] },
    { pattern: /Fracht|Versand|Porto/i, kw: ['Fracht', 'Nakliye', 'Versand', 'Kargo', 'Porto', 'Posta', 'Gönderi', 'DHL', 'UPS'], ex: ['Kargo gönderim ücreti', 'Posta pulu'] },
    { pattern: /Transport.*versicherung/i, kw: ['Transportversicherung', 'Nakliye sigortası', 'Waren', 'Mal'], ex: ['Nakliye sigortası primi'] },
    { pattern: /Reparatur(?!.*KFZ|.*Fahrzeug)/i, kw: ['Reparatur', 'Tamir', 'Instandhaltung', 'Bakım', 'Wartung', 'Servis', 'Onarım'], ex: ['Makine bakım onarımı', 'Tesis servis gideri'] },
    { pattern: /Abschreibung/i, kw: ['Abschreibung', 'Amortisman', 'AfA', 'Wertminderung', 'Değer kaybı', 'Yıpranma'], ex: ['Yıllık amortisman gideri'] },
    { pattern: /Bürobedarf/i, kw: ['Bürobedarf', 'Kırtasiye', 'Papier', 'Kağıt', 'Toner', 'Stift', 'Kalem', 'Ordner', 'Dosya', 'Druckerpatrone', 'Zımba', 'Makas', 'Klasör'], ex: ['Yazıcı toneri', 'A4 kağıt', 'Dosya klasör', 'Kalem kırtasiye'] },
    { pattern: /Zeitung|Zeitschrift/i, kw: ['Zeitung', 'Zeitschrift', 'Gazete', 'Dergi', 'Abo', 'Abonelik', 'Magazin', 'Yayın'], ex: ['Meslek dergisi aboneliği', 'Gazete aboneliği'] },
    { pattern: /Buch.*Fach|Fachliteratur/i, kw: ['Buch', 'Kitap', 'Fachliteratur', 'Lehrbuch', 'Yayın', 'Kaynak', 'Nachschlagewerk'], ex: ['Muhasebe kitabı', 'Teknik el kitabı'] },
    { pattern: /Beitrag|Mitgliedschaft/i, kw: ['Beitrag', 'Aidat', 'Mitgliedschaft', 'Üyelik', 'Verein', 'Verband', 'IHK', 'Oda'], ex: ['Ticaret odası aidatı', 'Meslek birliği üyeliği'] },
    { pattern: /Weiterbildung|Fortbildung|Schulung/i, kw: ['Weiterbildung', 'Eğitim', 'Schulung', 'Seminar', 'Kurs', 'Fortbildung'], ex: ['Personel eğitimi', 'Online kurs bedeli'] },
    { pattern: /Rechtsanwalt|Rechts.*Beratung|Beratungskosten/i, kw: ['Rechtsanwalt', 'Avukat', 'Beratung', 'Danışmanlık', 'Notar', 'Hukuk', 'Steuerberater', 'Müşavir'], ex: ['Avukat danışma ücreti', 'Mali müşavir bedeli'] },
    { pattern: /Buchführung|Buchhaltung/i, kw: ['Buchführung', 'Muhasebe', 'Buchhaltung', 'Jahresabschluss', 'Bilanço', 'Defter'], ex: ['Muhasebe ofisi aylık ücret'] },
    { pattern: /Prüfungskosten|Wirtschaftsprüf/i, kw: ['Prüfung', 'Denetim', 'Audit', 'Wirtschaftsprüfer', 'Bağımsız denetim'], ex: ['Bağımsız denetim ücreti'] },
    { pattern: /Telefon|Kommunikation/i, kw: ['Telefon', 'Handy', 'Mobilfunk', 'Cep', 'Mobil', 'Hat', 'Internet', 'DSL', 'Fiber'], ex: ['Telefon faturası', 'İnternet aboneliği'] },
    { pattern: /Internet/i, kw: ['Internet', 'DSL', 'Online', 'Web', 'Hosting', 'Domain', 'Fiber', 'Cloud'], ex: ['İnternet faturası', 'Web hosting'] },
    { pattern: /Bankgebühr|Nebenkosten.*Geldverkehr/i, kw: ['Bankgebühr', 'Banka masrafı', 'Kontoführung', 'Komisyon', 'Havale ücreti'], ex: ['Hesap işletim ücreti', 'Havale komisyonu'] },
    { pattern: /Miete.*Gerät|Geräte.*miete/i, kw: ['Gerätemiete', 'Cihaz kiralama', 'Kopierer', 'Fotokopi', 'Drucker', 'Yazıcı'], ex: ['Fotokopi makinesi kiralama'] },
    { pattern: /Nicht.*abziehbar/i, kw: ['Nicht abziehbar', 'İndirilemez', 'KDV', 'Vorsteuer', 'Gider'], ex: ['İndirilemez KDV gideri'] },
    { pattern: /Abfall|Entsorgung/i, kw: ['Abfall', 'Entsorgung', 'Atık', 'Çöp', 'Bertaraf', 'Recycling'], ex: ['Atık bertaraf bedeli', 'Çöp toplama ücreti'] },
    { pattern: /Wartung/i, kw: ['Wartung', 'Bakım', 'Service', 'Servis', 'Pflege', 'Periyodik'], ex: ['Periyodik bakım sözleşmesi'] },
    { pattern: /Leasingsonderzahlung/i, kw: ['Leasing', 'Sonderzahlung', 'Peşinat', 'Anzahlung', 'Ön ödeme'], ex: ['Leasing ilk taksit ödemesi'] },
    { pattern: /Datenschutz|DSGVO/i, kw: ['Datenschutz', 'DSGVO', 'Veri koruma', 'Gizlilik', 'Privacy'], ex: ['Veri koruma danışmanlığı'] },

    // Erlöskonten (Klasse 8)
    { pattern: /Erlöse|Umsatzerlöse/i, kw: ['Erlöse', 'Satış', 'Gelir', 'Umsatz', 'Ciro', 'Hasılat', 'Verkauf'], ex: ['Ürün satış geliri', 'Hizmet satışı'] },
    { pattern: /steuerfrei.*Umsatz|Umsatz.*steuerfrei/i, kw: ['Steuerfrei', 'Vergisiz', 'Muaf', 'Export', 'İhracat'], ex: ['Vergisiz yurt dışı satış'] },
    { pattern: /Innergemeinschaftlich.*Lieferung/i, kw: ['EU', 'AB içi', 'Innergemeinschaftlich', 'Lieferung', 'Teslimat'], ex: ['AB ülkesine vergisiz teslimat'] },
    { pattern: /Erlösschmälerung/i, kw: ['Erlösschmälerung', 'Gelir indirimi', 'Nachlass', 'İndirim', 'Rabatt'], ex: ['Müşteriye yapılan indirim'] },
    { pattern: /Gewährte.*Skont/i, kw: ['Skonto', 'Gewährt', 'İskonto', 'Verilen', 'Erken ödeme'], ex: ['Müşteriye verilen iskonto'] },
    { pattern: /Anlageabgang|Anlagenverkauf/i, kw: ['Anlageabgang', 'Duran varlık satışı', 'Verkauf', 'Elden çıkarma'], ex: ['Eski makine satışı', 'İkinci el demirbaş'] },
    { pattern: /Wertabgabe|Sachenentnahme/i, kw: ['Wertabgabe', 'Bedelsiz', 'Privatverbrauch', 'Şahsi kullanım'], ex: ['İşletme malı şahsi kullanım'] },
    { pattern: /Provisionserträge/i, kw: ['Provision', 'Komisyon', 'Ertrag', 'Gelir', 'Vermittlung', 'Aracılık'], ex: ['Satış komisyonu geliri'] },

    // Devir & İstatistik (Klasse 9)
    { pattern: /Saldenvortrag|Vortrag/i, kw: ['Saldenvortrag', 'Devir', 'Eröffnung', 'Bakiye', 'Açılış', 'Önceki yıl'], ex: ['Yeni yıla bakiye devri'] },
    { pattern: /Debitor/i, kw: ['Debitor', 'Müşteri', 'Alacak', 'Rechnung', 'Fatura', 'Kundenkonto'], ex: ['Müşteri hesap bakiyesi'] },
    { pattern: /Kreditor/i, kw: ['Kreditor', 'Tedarikçi', 'Borç', 'Lieferant', 'Fatura'], ex: ['Tedarikçi hesap bakiyesi'] },
    { pattern: /Statistisch|Statistik/i, kw: ['Statistik', 'İstatistik', 'Kennzahl', 'Veri', 'Rapor', 'BWA'], ex: ['İstatistiksel veri girişi'] },
];

// Generate description from account name (Turkish translation hints)
const descTranslations = {
    'Löhne': 'Ücretler', 'Gehälter': 'Maaşlar', 'Gehalt': 'Maaş',
    'Miete': 'Kira', 'Pacht': 'Kira/İşletme hakkı',
    'Versicherung': 'Sigorta', 'Steuer': 'Vergi', 'Steuern': 'Vergiler',
    'Abschreibung': 'Amortisman', 'Abschreibungen': 'Amortismanlar',
    'Zinsen': 'Faizler', 'Reparatur': 'Tamir', 'Reparaturen': 'Tamirler',
    'Erlöse': 'Satış Gelirleri', 'Umsatz': 'Ciro/Satış',
    'Aufwendungen': 'Giderler', 'Aufwand': 'Gider', 'Erträge': 'Gelirler', 'Ertrag': 'Gelir',
    'Kosten': 'Masraflar', 'Verbindlichkeiten': 'Borçlar', 'Forderungen': 'Alacaklar',
    'Wareneingang': 'Mal Girişi', 'Bestand': 'Stok', 'Kapital': 'Sermaye',
    'Rücklage': 'Yedek Akçe', 'Rückstellung': 'Karşılık',
    'Kasse': 'Kasa', 'Bank': 'Banka', 'Darlehen': 'Borç/Kredi',
    'Grundstück': 'Arsa', 'Gebäude': 'Bina', 'Maschinen': 'Makineler',
    'Fahrzeug': 'Araç', 'Software': 'Yazılım',
    'Bürobedarf': 'Kırtasiye', 'Telefon': 'Telefon', 'Porto': 'Posta',
    'Bewirtung': 'Ağırlama', 'Werbung': 'Reklam', 'Reise': 'Seyahat',
    'Reinigung': 'Temizlik', 'Heizung': 'Isıtma',
    'Waren': 'Mallar', 'Ware': 'Mal', 'Rechnung': 'Fatura',
    'Sonstige': 'Diğer', 'Fremdleistungen': 'Dış Hizmetler',
};

function generateDescription(name) {
    let desc = name;
    for (const [de, tr] of Object.entries(descTranslations)) {
        if (name.includes(de)) {
            desc = `${name} (${tr})`;
            break;
        }
    }
    return desc;
}

// ===== BUILD METADATA FOR ALL ACCOUNTS =====
const metadata = {};

for (const acc of accounts) {
    const existing = metadata[acc.code];
    if (existing && existing._manual) continue; // don't overwrite manual entries

    let description = '';
    let keywords = new Set();
    let examples = new Set();

    // Apply pattern-based keywords
    for (const rule of nameKeywordMap) {
        if (rule.pattern.test(acc.name)) {
            rule.kw.forEach(k => keywords.add(k));
            rule.ex.forEach(e => examples.add(e));
        }
    }

    // Auto-generate description
    description = generateDescription(acc.name);

    // Add category-based keywords
    const kat = getKategorie(acc.code);
    if (kat) keywords.add(kat);

    // Add KDV rate if present
    const kdv = extractKDVRate(acc.name);
    if (kdv) keywords.add(`KDV ${kdv}`);

    // Add words from name as keywords
    const nameWords = acc.name.split(/[\s,\-./()]+/).filter(w => w.length > 3 && !/^\d+$/.test(w));
    nameWords.forEach(w => {
        if (!['und', 'oder', 'für', 'aus', 'auf', 'des', 'der', 'die', 'das', 'den', 'dem', 'mit', 'von', 'vom', 'zum', 'zur', 'bis', 'bei', 'nach', 'ohne', 'über', 'unter', 'nicht', 'eine', 'eines', 'einer', 'einem', 'einen', 'frei', 'gemäß', 'nach', 'auch'].includes(w.toLowerCase())) {
            keywords.add(w);
        }
    });

    metadata[acc.code] = {
        description,
        keywords: Array.from(keywords),
        examples: Array.from(examples),
        kategorie: kat,
        kdvRate: kdv,
        taraf: getTaraf(acc.code)
    };
}

console.log(`Generated metadata for ${Object.keys(metadata).length} accounts`);

// Skip merge - regenerate from scratch to avoid inheriting corrupted strings
console.log('Skipping merge - clean regeneration');

// ===== WRITE OUTPUT =====
let output = `/**
 * DATEV SKR03 Hesap Planı — Kapsamlı Metadata Veritabanı
 * ${Object.keys(metadata).length} hesap kodu ile detaylı açıklama, anahtar kelime ve örnek
 * Kaynak: datev.pdf (90 sayfa) + otomatik analiz
 * 
 * Bu dosya fatura analizi sırasında AI kural motorunun doğru hesap
 * kodunu seçmesi için anahtar kelime eşleştirmesi içerir.
 */

export interface AccountMetadata {
    /** Hesabın açıklaması */
    description: string;
    /** Kural motoru anahtar kelimeleri */
    keywords: string[];
    /** Örnek işlem tanımları */
    examples: string[];
    /** Kategori: Duran Varlık, İşletme Gideri, Satış Geliri vb. */
    kategorie: string;
    /** KDV oranı (varsa) */
    kdvRate: string;
    /** Varsayılan taraf: S=Soll/Borç, H=Haben/Alacak */
    taraf: string;
}

export const ACCOUNT_METADATA: Record<string, AccountMetadata> = {\n`;

const sortedCodes = Object.keys(metadata).sort();
let kwTotal = 0, exTotal = 0;

function safeStr(s) {
    return String(s)
        .replace(/\r?\n/g, ' ')
        .replace(/\\/g, '')
        .replace(/'/g, "\\'")
        .trim();
}

for (const code of sortedCodes) {
    const m = metadata[code];
    const desc = safeStr(m.description);
    const kws = m.keywords.map(k => `'${safeStr(k)}'`).join(', ');
    const exs = m.examples.map(e => `'${safeStr(e)}'`).join(', ');
    const kat = safeStr(m.kategorie);
    const kdv = m.kdvRate;
    const taraf = m.taraf;

    output += `    '${code}': { description: '${desc}', keywords: [${kws}], examples: [${exs}], kategorie: '${kat}', kdvRate: '${kdv}', taraf: '${taraf}' },\n`;
    kwTotal += m.keywords.length;
    exTotal += m.examples.length;
}

output += `};

/**
 * Anahtar kelimeye göre hesap kodu ara
 */
export function searchByKeyword(keyword: string): { code: string; score: number; description: string }[] {
    const q = keyword.toLowerCase().trim();
    const results: { code: string; score: number; description: string }[] = [];
    for (const [code, meta] of Object.entries(ACCOUNT_METADATA)) {
        let score = 0;
        for (const kw of meta.keywords) {
            if (kw.toLowerCase() === q) score += 30;
            else if (kw.toLowerCase().includes(q)) score += 10;
        }
        if (meta.description.toLowerCase().includes(q)) score += 5;
        for (const ex of meta.examples) {
            if (ex.toLowerCase().includes(q)) score += 3;
        }
        if (score > 0) results.push({ code, score, description: meta.description });
    }
    return results.sort((a, b) => b.score - a.score);
}

/**
 * Fatura metni analiz ederek en uygun hesap kodlarını öner
 */
export function suggestAccountCodes(text: string): { code: string; score: number; description: string }[] {
    const words = text.toLowerCase().split(/\\s+/);
    const scoreMap = new Map<string, number>();
    for (const word of words) {
        if (word.length < 2) continue;
        for (const m of searchByKeyword(word)) {
            scoreMap.set(m.code, (scoreMap.get(m.code) || 0) + m.score);
        }
    }
    const results: { code: string; score: number; description: string }[] = [];
    for (const [code, score] of scoreMap.entries()) {
        const meta = ACCOUNT_METADATA[code];
        if (meta) results.push({ code, score, description: meta.description });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, 5);
}
`;

fs.writeFileSync(path.join(__dirname, 'data/skr03Metadata.ts'), output);

console.log(`\n✅ Successfully wrote data/skr03Metadata.ts`);
console.log(`   Accounts: ${sortedCodes.length}`);
console.log(`   Total keywords: ${kwTotal}`);
console.log(`   Total examples: ${exTotal}`);
console.log(`   Avg keywords/account: ${(kwTotal / sortedCodes.length).toFixed(1)}`);
