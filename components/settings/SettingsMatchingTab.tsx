import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  EnhancedRule, LearnSuggestion,
  learnFromHistory, computeRuleStats,
} from "../../services/ruleEngine";
import {} from "../../types";
import { useLang } from "../../LanguageContext";
import { supabase } from "../../services/supabaseService";
import { ACCOUNT_METADATA, searchByKeyword } from "../../data/skr03Metadata";

// ═══════════════ DATEV PDF HAZIR KURAL ÖNERİLERİ ═══════════════
// datev.pdf (90 sayfa) analizi sonucu oluşturulan en yaygın muhasebe kuralları
const DATEV_SUGGESTED_RULES: Array<{
  supplier_keyword?: string;
  description_keywords: string[];
  account_code: string;
  account_name: string;
  category: string;
  note: string;
}> = [
    // ══════════════════════════════════════════════════════════════
    // ── 1. ARAÇ GİDERLERİ (KFZ) ──
    // ══════════════════════════════════════════════════════════════
    { supplier_keyword: 'Shell', description_keywords: ['benzin', 'diesel', 'tankstelle', 'kraftstoff'], account_code: '4530', account_name: 'Lfd. Kfz-Betriebskosten', category: 'Araç', note: 'Yakıt alımları → 4530' },
    { supplier_keyword: 'Aral', description_keywords: ['tanken', 'super', 'diesel'], account_code: '4530', account_name: 'Lfd. Kfz-Betriebskosten', category: 'Araç', note: 'Akaryakıt istasyonu' },
    { supplier_keyword: 'Total', description_keywords: ['benzin', 'fuel'], account_code: '4530', account_name: 'Lfd. Kfz-Betriebskosten', category: 'Araç', note: 'Yakıt alımları' },
    { supplier_keyword: 'Esso', description_keywords: ['benzin', 'diesel', 'tankstelle'], account_code: '4530', account_name: 'Lfd. Kfz-Betriebskosten', category: 'Araç', note: 'Esso yakıt istasyonu' },
    { supplier_keyword: 'JET', description_keywords: ['tanken', 'kraftstoff', 'benzin'], account_code: '4530', account_name: 'Lfd. Kfz-Betriebskosten', category: 'Araç', note: 'JET yakıt istasyonu' },
    { supplier_keyword: 'OMV', description_keywords: ['tanken', 'diesel', 'benzin'], account_code: '4530', account_name: 'Lfd. Kfz-Betriebskosten', category: 'Araç', note: 'OMV yakıt istasyonu' },
    { supplier_keyword: 'AVIA', description_keywords: ['tanken', 'kraftstoff'], account_code: '4530', account_name: 'Lfd. Kfz-Betriebskosten', category: 'Araç', note: 'AVIA yakıt istasyonu' },
    { supplier_keyword: 'TÜV', description_keywords: ['tüv', 'hauptuntersuchung', 'inspektion', 'hu'], account_code: '4540', account_name: 'Kfz-Reparaturen', category: 'Araç', note: 'Araç muayene ve servis' },
    { supplier_keyword: 'ATU', description_keywords: ['reifen', 'ölwechsel', 'werkstatt', 'bremsen'], account_code: '4540', account_name: 'Kfz-Reparaturen', category: 'Araç', note: 'Araç bakım/onarım' },
    { supplier_keyword: 'Euromaster', description_keywords: ['reifen', 'reifenwechsel', 'montage'], account_code: '4540', account_name: 'Kfz-Reparaturen', category: 'Araç', note: 'Lastik değişimi/bakım' },
    { supplier_keyword: 'Vergölst', description_keywords: ['reifen', 'auspuff', 'bremsen'], account_code: '4540', account_name: 'Kfz-Reparaturen', category: 'Araç', note: 'Araç tamiri/lastik' },
    { supplier_keyword: 'ADAC', description_keywords: ['pannenhilfe', 'mitgliedschaft', 'automobil'], account_code: '4580', account_name: 'Sonst. Kfz-Kosten', category: 'Araç', note: 'ADAC üyelik/yol yardım' },
    { supplier_keyword: 'Pitstop', description_keywords: ['inspektion', 'ölwechsel', 'bremsen', 'werkstatt'], account_code: '4540', account_name: 'Kfz-Reparaturen', category: 'Araç', note: 'Pitstop araç bakımı' },
    { description_keywords: ['kfz-steuer', 'fahrzeugsteuer', 'motorfahrzeug', 'kraftfahrzeugsteuer'], account_code: '4510', account_name: 'Kfz-Steuern', category: 'Araç', note: 'Motorlu taşıt vergisi' },
    { description_keywords: ['kfz-versicherung', 'autoversicherung', 'kasko', 'teilkasko', 'vollkasko'], account_code: '4520', account_name: 'Kfz-Versicherungen', category: 'Araç', note: 'Araç sigortası' },
    { description_keywords: ['leasing', 'fahrzeugleasing', 'autoleasing', 'kfz-leasing'], account_code: '4570', account_name: 'Kfz-Leasing', category: 'Araç', note: 'Araç leasing taksidi' },
    { description_keywords: ['parkgebühr', 'parkhaus', 'otopark', 'maut', 'autobahngebühr', 'vignette'], account_code: '4580', account_name: 'Sonst. Kfz-Kosten', category: 'Araç', note: 'Otopark ve geçiş ücreti' },
    { description_keywords: ['waschanlage', 'autowäsche', 'fahrzeugpflege', 'autopflege'], account_code: '4580', account_name: 'Sonst. Kfz-Kosten', category: 'Araç', note: 'Araç yıkama/bakım' },
    { description_keywords: ['kfz-abschreibung', 'afa fahrzeug', 'abschreibung pkw'], account_code: '4832', account_name: 'AfA Kfz', category: 'Araç', note: 'Araç amortisman gideri' },
    { description_keywords: ['führerschein', 'fahrerausbildung', 'fahrerlaubnis'], account_code: '4580', account_name: 'Sonst. Kfz-Kosten', category: 'Araç', note: 'Sürücü belgesi/eğitim' },

    // ══════════════════════════════════════════════════════════════
    // ── 2. OFİS VE KIRTASIYE ──
    // ══════════════════════════════════════════════════════════════
    { supplier_keyword: 'Amazon', description_keywords: ['bürobedarf', 'büromaterial', 'kırtasiye'], account_code: '4920', account_name: 'Bürobedarf', category: 'Ofis', note: 'Kırtasiye ve ofis malzemeleri' },
    { supplier_keyword: 'Staples', description_keywords: ['papier', 'toner', 'druckerpatrone', 'ordner'], account_code: '4920', account_name: 'Bürobedarf', category: 'Ofis', note: 'Kırtasiye malzemeleri' },
    { supplier_keyword: 'IKEA', description_keywords: ['möbel', 'büromöbel', 'schreibtisch', 'stuhl', 'regal'], account_code: '0420', account_name: 'Büroeinrichtung', category: 'Ofis', note: 'Ofis mobilyası (Duran Varlık)' },
    { supplier_keyword: 'Conrad', description_keywords: ['elektronik', 'kabel', 'adapter', 'zubehör'], account_code: '4920', account_name: 'Bürobedarf', category: 'Ofis', note: 'Elektronik ofis malzemeleri' },
    { supplier_keyword: 'MediaMarkt', description_keywords: ['drucker', 'monitor', 'tastatur', 'maus'], account_code: '0650', account_name: 'Büromaschinen', category: 'Ofis', note: 'Ofis elektronik cihazları' },
    { supplier_keyword: 'Saturn', description_keywords: ['computer', 'laptop', 'notebook', 'tablet'], account_code: '0650', account_name: 'Büromaschinen', category: 'Ofis', note: 'Bilgisayar/tablet alımı' },
    { supplier_keyword: 'Viking', description_keywords: ['bürobedarf', 'papier', 'kopierpapier'], account_code: '4920', account_name: 'Bürobedarf', category: 'Ofis', note: 'Viking ofis malzemeleri' },
    { supplier_keyword: 'Brunnen', description_keywords: ['kalender', 'notizbuch', 'block'], account_code: '4920', account_name: 'Bürobedarf', category: 'Ofis', note: 'Takvim ve not defteri' },
    { description_keywords: ['drucker', 'kopierer', 'faxgerät', 'scanner'], account_code: '0650', account_name: 'Büromaschinen', category: 'Ofis', note: 'Yazıcı/tarayıcı/fotokopi (Duran Varlık)' },
    { description_keywords: ['schreibtisch', 'bürostuhl', 'aktenschrank', 'whiteboard', 'pinnwand'], account_code: '0420', account_name: 'Büroeinrichtung', category: 'Ofis', note: 'Ofis mobilya/donanım' },
    { description_keywords: ['briefumschlag', 'stempel', 'ordner', 'hefter', 'locher', 'kugelschreiber'], account_code: '4920', account_name: 'Bürobedarf', category: 'Ofis', note: 'Zarf, damga, dosya malzemeleri' },
    { description_keywords: ['toner', 'druckerpatrone', 'tintenpatrone', 'kartusche'], account_code: '4920', account_name: 'Bürobedarf', category: 'Ofis', note: 'Toner ve yazıcı kartuşu' },

    // ══════════════════════════════════════════════════════════════
    // ── 3. TELEKOMÜNİKASYON ──
    // ══════════════════════════════════════════════════════════════
    { supplier_keyword: 'Telekom', description_keywords: ['telefon', 'mobilfunk', 'festnetz', 'handy'], account_code: '4920', account_name: 'Telefon', category: 'İletişim', note: 'Telefon ve mobil iletişim' },
    { supplier_keyword: 'Vodafone', description_keywords: ['mobilfunk', 'internet', 'dsl'], account_code: '4920', account_name: 'Telefon', category: 'İletişim', note: 'Mobil iletişim' },
    { supplier_keyword: 'O2', description_keywords: ['handy', 'smartphone', 'tarif'], account_code: '4920', account_name: 'Telefon', category: 'İletişim', note: 'Mobil hat' },
    { supplier_keyword: '1&1', description_keywords: ['internet', 'dsl', 'glasfaser', 'hosting'], account_code: '4921', account_name: 'Telefon / Internet', category: 'İletişim', note: '1&1 internet/hosting' },
    { supplier_keyword: 'Congstar', description_keywords: ['mobilfunk', 'prepaid', 'flatrate'], account_code: '4920', account_name: 'Telefon', category: 'İletişim', note: 'Congstar mobil hat' },
    { supplier_keyword: 'Unitymedia', description_keywords: ['kabel', 'internet', 'fernsehen'], account_code: '4921', account_name: 'Telefon / Internet', category: 'İletişim', note: 'Kablolu internet' },
    { description_keywords: ['internetanschluss', 'breitband', 'glasfaser', 'wlan', 'router'], account_code: '4921', account_name: 'Telefon / Internet', category: 'İletişim', note: 'İnternet bağlantısı' },
    { description_keywords: ['faxgebühr', 'faxdienst', 'efax'], account_code: '4920', account_name: 'Telefon', category: 'İletişim', note: 'Faks hizmet gideri' },

    // ══════════════════════════════════════════════════════════════
    // ── 4. KİRA VE MEKAN ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['miete', 'büro', 'geschäftsraum', 'kaltmiete', 'warmmiete'], account_code: '4210', account_name: 'Miete (Büro)', category: 'Mekan', note: 'Ofis/iş yeri kirası' },
    { description_keywords: ['nebenkosten', 'betriebskosten', 'hausgeld', 'verwaltung'], account_code: '4220', account_name: 'Nebenkosten', category: 'Mekan', note: 'Yan giderler / aidat' },
    { description_keywords: ['strom', 'elektrizität', 'energie', 'stromverbrauch'], account_code: '4240', account_name: 'Gas, Strom, Wasser', category: 'Mekan', note: 'Elektrik gideri' },
    { description_keywords: ['gas', 'heizung', 'heizöl', 'fernwärme'], account_code: '4230', account_name: 'Heizung', category: 'Mekan', note: 'Isınma/yakıt gideri' },
    { description_keywords: ['reinigung', 'putz', 'gebäudereinigung', 'cleaning'], account_code: '4250', account_name: 'Reinigung', category: 'Mekan', note: 'Temizlik hizmeti' },
    { description_keywords: ['wasser', 'wasserverbrauch', 'abwasser', 'kanal'], account_code: '4240', account_name: 'Gas, Strom, Wasser', category: 'Mekan', note: 'Su ve atık su gideri' },
    { description_keywords: ['müll', 'abfallentsorgung', 'müllabfuhr', 'entsorgung'], account_code: '4260', account_name: 'Abfallbeseitigung', category: 'Mekan', note: 'Çöp/atık toplama gideri' },
    { description_keywords: ['grundsteuer', 'grundstück', 'immobiliensteuer'], account_code: '4290', account_name: 'Sonst. Raumkosten', category: 'Mekan', note: 'Emlak/arazi vergisi' },
    { description_keywords: ['gebäudeversicherung', 'immobilienversicherung', 'wohngebäude'], account_code: '4360', account_name: 'Versicherungen', category: 'Mekan', note: 'Bina sigortası' },
    { description_keywords: ['alarm', 'alarmanlage', 'sicherheitsdienst', 'bewachung', 'security'], account_code: '4276', account_name: 'Bewachungskosten', category: 'Mekan', note: 'Güvenlik/alarm sistemi' },
    { description_keywords: ['hausmeister', 'facility', 'gebäudemanagement'], account_code: '4290', account_name: 'Sonst. Raumkosten', category: 'Mekan', note: 'Bina yönetimi/kapıcı' },
    { description_keywords: ['gartenpflege', 'landschaftsbau', 'grünfläche', 'winterdienst'], account_code: '4290', account_name: 'Sonst. Raumkosten', category: 'Mekan', note: 'Bahçe bakımı/peyzaj' },
    { description_keywords: ['lagerhalle', 'lagerraum', 'lagermiete', 'depot'], account_code: '4210', account_name: 'Miete (Lager)', category: 'Mekan', note: 'Depo/ambar kirası' },

    // ══════════════════════════════════════════════════════════════
    // ── 5. YEMEK VE AĞIRLAMA ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['restaurant', 'geschäftsessen', 'bewirtung', 'essen', 'gastronomie'], account_code: '4650', account_name: 'Bewirtungskosten', category: 'Ağırlama', note: 'İş yemeği (%70 gider yazılır)' },
    { description_keywords: ['blumen', 'pralinen', 'aufmerksamkeit'], account_code: '4653', account_name: 'Aufmerksamkeiten', category: 'Ağırlama', note: 'Küçük hediye/ikram (max 60€)' },
    { description_keywords: ['geschenk', 'kundengeschenk', 'werbegeschenk', 'präsent'], account_code: '4630', account_name: 'Geschenke > 35€', category: 'Ağırlama', note: 'Müşteri hediyesi >35€ (gider yazılamaz)' },
    { description_keywords: ['streuartikel', 'werbeartikel', 'kugelschreiber', 'kalender'], account_code: '4631', account_name: 'Geschenke < 35€', category: 'Ağırlama', note: 'Küçük promosyon hediye <35€' },
    { description_keywords: ['trinkgeld', 'bewirtungsbeleg', 'tip'], account_code: '4650', account_name: 'Bewirtungskosten', category: 'Ağırlama', note: 'Bahşiş (iş yemeği dahilinde)' },
    { description_keywords: ['repräsentation', 'empfang', 'firmenfeier', 'betriebsfeier'], account_code: '4640', account_name: 'Repräsentationskosten', category: 'Ağırlama', note: 'Temsil/ağırlama gideri' },
    { description_keywords: ['catering', 'partyservice', 'buffet', 'getränkelieferung'], account_code: '4650', account_name: 'Bewirtungskosten', category: 'Ağırlama', note: 'Catering/ikram hizmeti' },
    { description_keywords: ['kaffee', 'tee', 'wasser', 'getränke', 'kantine', 'verpflegung'], account_code: '4654', account_name: 'Nicht abz. Bewirtung', category: 'Ağırlama', note: 'Çay/kahve/içecek (iç tüketim)' },

    // ══════════════════════════════════════════════════════════════
    // ── 6. SEYAHAT ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['flug', 'flugticket', 'airline', 'lufthansa', 'ryanair', 'easyjet'], account_code: '4660', account_name: 'Reisekosten AN', category: 'Seyahat', note: 'Uçak bileti gideri' },
    { description_keywords: ['hotel', 'übernachtung', 'unterkunft', 'booking', 'airbnb'], account_code: '4660', account_name: 'Reisekosten AN', category: 'Seyahat', note: 'Otel/konaklama gideri' },
    { description_keywords: ['bahn', 'zugticket', 'deutsche bahn', 'ice', 'bahncard'], account_code: '4660', account_name: 'Reisekosten AN', category: 'Seyahat', note: 'Tren bileti' },
    { description_keywords: ['taxi', 'uber', 'mietwagen', 'sixt', 'europcar'], account_code: '4660', account_name: 'Reisekosten AN', category: 'Seyahat', note: 'Taksi/araç kiralama' },
    { supplier_keyword: 'FlixBus', description_keywords: ['flixbus', 'fernbus', 'busticket'], account_code: '4660', account_name: 'Reisekosten AN', category: 'Seyahat', note: 'FlixBus/otobüs bileti' },
    { description_keywords: ['verpflegungsmehraufwand', 'tagegeld', 'pauschale', 'diäten'], account_code: '4668', account_name: 'Verpflegungsmehraufwand', category: 'Seyahat', note: 'Harcırah/yemek harcaması' },
    { description_keywords: ['kilometergeld', 'kilometerpauschale', 'fahrtkostenerstattung'], account_code: '4663', account_name: 'Fahrtkostenerstattung', category: 'Seyahat', note: 'Kilometre ücreti iadesi' },
    { description_keywords: ['parkgebühr dienstreise', 'parkticket reise'], account_code: '4660', account_name: 'Reisekosten AN', category: 'Seyahat', note: 'İş seyahati otopark gideri' },
    { description_keywords: ['reisenebenkosten', 'gepäck', 'visum', 'reiseversicherung', 'impfung'], account_code: '4660', account_name: 'Reisekosten AN', category: 'Seyahat', note: 'Seyahat yan giderleri (vize, sigorta vb.)' },
    { description_keywords: ['reisekosten unternehmer', 'geschäftsreise inhaber'], account_code: '4670', account_name: 'Reisekosten Unternehmer', category: 'Seyahat', note: 'İşveren seyahat gideri' },
    { description_keywords: ['übernachtung unternehmer', 'hotel inhaber'], account_code: '4674', account_name: 'Übernachtung Unternehmer', category: 'Seyahat', note: 'İşveren konaklama gideri' },
    { description_keywords: ['verpflegung unternehmer', 'tagegeld inhaber'], account_code: '4676', account_name: 'Verpfl.mehraufw. Unternehmer', category: 'Seyahat', note: 'İşveren harcırah' },

    // ══════════════════════════════════════════════════════════════
    // ── 7. REKLAM VE PAZARLAMA ──
    // ══════════════════════════════════════════════════════════════
    { supplier_keyword: 'Google', description_keywords: ['ads', 'adwords', 'werbung', 'marketing'], account_code: '4600', account_name: 'Werbekosten', category: 'Reklam', note: 'Google Ads reklam' },
    { supplier_keyword: 'Meta', description_keywords: ['facebook', 'instagram', 'werbung', 'social'], account_code: '4600', account_name: 'Werbekosten', category: 'Reklam', note: 'Sosyal medya reklamı' },
    { supplier_keyword: 'LinkedIn', description_keywords: ['linkedin', 'werbung', 'recruiting', 'premium'], account_code: '4600', account_name: 'Werbekosten', category: 'Reklam', note: 'LinkedIn reklam/premium' },
    { supplier_keyword: 'TikTok', description_keywords: ['tiktok', 'werbung', 'social', 'video'], account_code: '4600', account_name: 'Werbekosten', category: 'Reklam', note: 'TikTok reklam' },
    { supplier_keyword: 'Xing', description_keywords: ['xing', 'stellenanzeige', 'recruiting'], account_code: '4600', account_name: 'Werbekosten', category: 'Reklam', note: 'Xing reklam/ilan' },
    { supplier_keyword: 'Twitter', description_keywords: ['twitter', 'werbung', 'promoted'], account_code: '4600', account_name: 'Werbekosten', category: 'Reklam', note: 'Twitter/X reklam' },
    { description_keywords: ['flyer', 'visitenkarte', 'druckerei', 'broschüre', 'plakat'], account_code: '4610', account_name: 'Werbekosten (Druck)', category: 'Reklam', note: 'Basılı reklam materyali' },
    { description_keywords: ['messe', 'messestand', 'ausstellung', 'kongressmesse'], account_code: '4614', account_name: 'Messekosten', category: 'Reklam', note: 'Fuar/sergi stand gideri' },
    { description_keywords: ['sponsoring', 'vereinssponsoring', 'sportsponsoring'], account_code: '4600', account_name: 'Werbekosten', category: 'Reklam', note: 'Sponsorluk gideri' },
    { description_keywords: ['webdesign', 'homepage', 'webseitenerstellung', 'redesign'], account_code: '4600', account_name: 'Werbekosten', category: 'Reklam', note: 'Web sitesi tasarımı' },
    { description_keywords: ['suchmaschinenoptimierung', 'seo', 'sem', 'onlinemarketing'], account_code: '4600', account_name: 'Werbekosten', category: 'Reklam', note: 'SEO/SEM dijital pazarlama' },
    { description_keywords: ['werbegeschenk', 'giveaway', 'merchandise', 'werbemittel'], account_code: '4610', account_name: 'Werbekosten', category: 'Reklam', note: 'Promosyon ürünleri' },
    { description_keywords: ['anzeige', 'zeitungsanzeige', 'inserat', 'kleinanzeige'], account_code: '4600', account_name: 'Werbekosten', category: 'Reklam', note: 'Gazete/dergi ilan gideri' },

    // ══════════════════════════════════════════════════════════════
    // ── 8. SİGORTA ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['haftpflicht', 'betriebshaftpflicht', 'berufshaftpflicht'], account_code: '4360', account_name: 'Versicherungen', category: 'Sigorta', note: 'Sorumluluk sigortası' },
    { description_keywords: ['rechtsschutz', 'rechtsschutzversicherung'], account_code: '4360', account_name: 'Versicherungen', category: 'Sigorta', note: 'Hukuki koruma sigortası' },
    { description_keywords: ['feuerversicherung', 'brandversicherung', 'feuer'], account_code: '4360', account_name: 'Versicherungen', category: 'Sigorta', note: 'Yangın sigortası' },
    { description_keywords: ['diebstahl', 'einbruch', 'diebstahlversicherung'], account_code: '4360', account_name: 'Versicherungen', category: 'Sigorta', note: 'Hırsızlık sigortası' },
    { description_keywords: ['cyberversicherung', 'cyber', 'it-sicherheit', 'datenschutz'], account_code: '4360', account_name: 'Versicherungen', category: 'Sigorta', note: 'Siber güvenlik sigortası' },
    { description_keywords: ['inhaltsversicherung', 'inventarversicherung', 'geschäftsinventar'], account_code: '4360', account_name: 'Versicherungen', category: 'Sigorta', note: 'İşletme envanter sigortası' },
    { description_keywords: ['transportversicherung', 'warenversicherung', 'ladung'], account_code: '4360', account_name: 'Versicherungen', category: 'Sigorta', note: 'Taşımacılık/nakliyat sigortası' },
    { description_keywords: ['betriebsunterbrechung', 'ertragsausfall', 'betriebsausfall'], account_code: '4360', account_name: 'Versicherungen', category: 'Sigorta', note: 'İş durması sigortası' },
    { description_keywords: ['d&o', 'managerhaftpflicht', 'organhaftpflicht', 'directors'], account_code: '4360', account_name: 'Versicherungen', category: 'Sigorta', note: 'D&O yönetici sorumluluk sigortası' },
    { description_keywords: ['unfallversicherung', 'berufsunfall', 'gruppenunfall'], account_code: '4360', account_name: 'Versicherungen', category: 'Sigorta', note: 'İş kazası sigortası' },

    // ══════════════════════════════════════════════════════════════
    // ── 9. HUKUK VE DANIŞMANLIK ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['rechtsanwalt', 'anwalt', 'kanzlei', 'rechtsberatung'], account_code: '4950', account_name: 'Rechts-/Beratungskosten', category: 'Danışmanlık', note: 'Avukat/hukuk danışmanlığı' },
    { description_keywords: ['steuerberater', 'steuerberatung', 'jahresabschluss'], account_code: '4955', account_name: 'Buchführungskosten', category: 'Danışmanlık', note: 'Mali müşavirlik' },
    { description_keywords: ['notar', 'notargebühr', 'beglaubigung', 'beurkundung'], account_code: '4950', account_name: 'Rechts-/Beratungskosten', category: 'Danışmanlık', note: 'Noter masrafları' },
    { description_keywords: ['wirtschaftsprüfer', 'wirtschaftsprüfung', 'audit', 'revision'], account_code: '4957', account_name: 'Abschluss-/Prüfungskosten', category: 'Danışmanlık', note: 'Denetim/yeminli mali müşavir' },
    { description_keywords: ['unternehmensberater', 'unternehmensberatung', 'consulting', 'managementberatung'], account_code: '4950', account_name: 'Rechts-/Beratungskosten', category: 'Danışmanlık', note: 'İşletme danışmanlığı' },
    { description_keywords: ['gutachter', 'sachverständiger', 'gutachten', 'expertise'], account_code: '4950', account_name: 'Rechts-/Beratungskosten', category: 'Danışmanlık', note: 'Bilirkişi/uzman raporu' },
    { description_keywords: ['dolmetscher', 'übersetzer', 'übersetzung', 'übersetzungsbüro'], account_code: '4950', account_name: 'Rechts-/Beratungskosten', category: 'Danışmanlık', note: 'Tercüman/çeviri hizmeti' },
    { description_keywords: ['it-beratung', 'it-consulting', 'technische beratung', 'systemberatung'], account_code: '4964', account_name: 'EDV-Kosten / Beratung', category: 'Danışmanlık', note: 'BT danışmanlığı' },
    { description_keywords: ['personalberatung', 'headhunter', 'personalvermittlung', 'recruiting'], account_code: '4950', account_name: 'Rechts-/Beratungskosten', category: 'Danışmanlık', note: 'Personel danışmanlığı/headhunter' },
    { description_keywords: ['inkasso', 'inkassobüro', 'forderungseinzug', 'mahnverfahren'], account_code: '4950', account_name: 'Rechts-/Beratungskosten', category: 'Danışmanlık', note: 'İcra/tahsilat masrafları' },

    // ══════════════════════════════════════════════════════════════
    // ── 10. KARGO VE POSTA ──
    // ══════════════════════════════════════════════════════════════
    { supplier_keyword: 'DHL', description_keywords: ['paket', 'sendung', 'versand', 'porto'], account_code: '4910', account_name: 'Porto', category: 'Kargo', note: 'DHL kargo gideri' },
    { supplier_keyword: 'UPS', description_keywords: ['versand', 'shipping', 'paket'], account_code: '4910', account_name: 'Porto', category: 'Kargo', note: 'UPS kargo gideri' },
    { supplier_keyword: 'DPD', description_keywords: ['versand', 'paket'], account_code: '4910', account_name: 'Porto', category: 'Kargo', note: 'DPD kargo gideri' },
    { supplier_keyword: 'Deutsche Post', description_keywords: ['brief', 'porto', 'frankierung'], account_code: '4910', account_name: 'Porto', category: 'Kargo', note: 'Posta gideri' },
    { supplier_keyword: 'FedEx', description_keywords: ['express', 'international', 'shipping'], account_code: '4910', account_name: 'Porto', category: 'Kargo', note: 'FedEx kargo gideri' },
    { supplier_keyword: 'GLS', description_keywords: ['paket', 'versand', 'zustellung'], account_code: '4910', account_name: 'Porto', category: 'Kargo', note: 'GLS kargo gideri' },
    { supplier_keyword: 'Hermes', description_keywords: ['paket', 'versand', 'paketshop'], account_code: '4910', account_name: 'Porto', category: 'Kargo', note: 'Hermes kargo gideri' },
    { supplier_keyword: 'TNT', description_keywords: ['express', 'kurier', 'eilsendung'], account_code: '4910', account_name: 'Porto', category: 'Kargo', note: 'TNT ekspres kargo' },
    { description_keywords: ['kurierdienst', 'botendienst', 'eilzustellung', 'messenger'], account_code: '4910', account_name: 'Porto', category: 'Kargo', note: 'Kurye/hızlı teslimat' },

    // ══════════════════════════════════════════════════════════════
    // ── 11. BANKA MASRAFLARI ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['kontoführung', 'bankgebühr', 'überweisungsgebühr', 'lastschrift'], account_code: '4970', account_name: 'Nebenkosten Geldverkehr', category: 'Banka', note: 'Banka hesap masrafları' },
    { description_keywords: ['kreditkartengebühr', 'kreditkarte', 'jahresgebühr karte'], account_code: '4970', account_name: 'Nebenkosten Geldverkehr', category: 'Banka', note: 'Kredi kartı yıllık ücreti' },
    { supplier_keyword: 'PayPal', description_keywords: ['paypal', 'transaktionsgebühr', 'paypal-gebühr'], account_code: '4970', account_name: 'Nebenkosten Geldverkehr', category: 'Banka', note: 'PayPal işlem komisyonu' },
    { supplier_keyword: 'Stripe', description_keywords: ['stripe', 'zahlungsgebühr', 'processing fee'], account_code: '4970', account_name: 'Nebenkosten Geldverkehr', category: 'Banka', note: 'Stripe ödeme komisyonu' },
    { supplier_keyword: 'SumUp', description_keywords: ['kartenzahlung', 'terminal', 'kartengebühr'], account_code: '4970', account_name: 'Nebenkosten Geldverkehr', category: 'Banka', note: 'Kart ödeme terminal komisyonu' },
    { description_keywords: ['zinsen kontokorrent', 'überziehungszinsen', 'sollzinsen', 'dispozinsen'], account_code: '2100', account_name: 'Zinsen und ähnl. Aufwend.', category: 'Banka', note: 'Hesap faiz gideri' },
    { description_keywords: ['wechselkurs', 'fremdwährung', 'currency', 'devisengebühr'], account_code: '4970', account_name: 'Nebenkosten Geldverkehr', category: 'Banka', note: 'Döviz/kur farkı masrafı' },
    { description_keywords: ['sepa', 'sepa-lastschrift', 'sepa-überweisung', 'sepa-mandat'], account_code: '4970', account_name: 'Nebenkosten Geldverkehr', category: 'Banka', note: 'SEPA işlem gideri' },

    // ══════════════════════════════════════════════════════════════
    // ── 12. YAZILIM VE IT ──
    // ══════════════════════════════════════════════════════════════
    { supplier_keyword: 'Microsoft', description_keywords: ['office', '365', 'azure', 'software', 'lizenz'], account_code: '4964', account_name: 'EDV-Kosten / Software', category: 'IT', note: 'Microsoft yazılım/abonelik' },
    { supplier_keyword: 'Adobe', description_keywords: ['creative', 'cloud', 'photoshop', 'acrobat'], account_code: '4964', account_name: 'EDV-Kosten / Software', category: 'IT', note: 'Adobe yazılım aboneliği' },
    { supplier_keyword: 'DATEV', description_keywords: ['datev', 'buchhaltung', 'software'], account_code: '4955', account_name: 'Buchführungskosten', category: 'IT', note: 'DATEV muhasebe yazılımı' },
    { supplier_keyword: 'SAP', description_keywords: ['erp', 'lizenz', 'business', 'hana'], account_code: '4964', account_name: 'EDV-Kosten / Software', category: 'IT', note: 'SAP ERP yazılımı' },
    { supplier_keyword: 'Oracle', description_keywords: ['datenbank', 'lizenz', 'cloud', 'oracle'], account_code: '4964', account_name: 'EDV-Kosten / Software', category: 'IT', note: 'Oracle veritabanı/lisans' },
    { supplier_keyword: 'Salesforce', description_keywords: ['crm', 'sales', 'marketing', 'cloud'], account_code: '4964', account_name: 'EDV-Kosten / Software', category: 'IT', note: 'Salesforce CRM aboneliği' },
    { supplier_keyword: 'Google', description_keywords: ['workspace', 'gsuite', 'google cloud', 'gmail'], account_code: '4964', account_name: 'EDV-Kosten / Software', category: 'IT', note: 'Google Workspace aboneliği' },
    { supplier_keyword: 'Slack', description_keywords: ['slack', 'kommunikation', 'messaging'], account_code: '4964', account_name: 'EDV-Kosten / Software', category: 'IT', note: 'Slack iletişim platformu' },
    { supplier_keyword: 'Zoom', description_keywords: ['videokonferenz', 'meeting', 'webinar'], account_code: '4964', account_name: 'EDV-Kosten / Software', category: 'IT', note: 'Zoom video konferans' },
    { supplier_keyword: 'AWS', description_keywords: ['amazon web services', 'cloud', 'ec2', 's3'], account_code: '4964', account_name: 'EDV-Kosten / Software', category: 'IT', note: 'AWS bulut altyapı' },
    { supplier_keyword: 'Hetzner', description_keywords: ['server', 'cloud', 'dedicated', 'hosting'], account_code: '4964', account_name: 'EDV-Kosten / Software', category: 'IT', note: 'Hetzner sunucu/hosting' },
    { supplier_keyword: 'GitHub', description_keywords: ['repository', 'devops', 'github', 'copilot'], account_code: '4964', account_name: 'EDV-Kosten / Software', category: 'IT', note: 'GitHub geliştirme platformu' },
    { supplier_keyword: 'Atlassian', description_keywords: ['jira', 'confluence', 'bitbucket', 'trello'], account_code: '4964', account_name: 'EDV-Kosten / Software', category: 'IT', note: 'Jira/Confluence proje yönetimi' },
    { supplier_keyword: 'Dropbox', description_keywords: ['dropbox', 'speicher', 'cloud storage'], account_code: '4964', account_name: 'EDV-Kosten / Software', category: 'IT', note: 'Dropbox bulut depolama' },
    { supplier_keyword: 'Notion', description_keywords: ['notion', 'wiki', 'workspace', 'notiz'], account_code: '4964', account_name: 'EDV-Kosten / Software', category: 'IT', note: 'Notion bilgi yönetimi' },
    { supplier_keyword: 'HubSpot', description_keywords: ['hubspot', 'crm', 'marketing', 'automation'], account_code: '4964', account_name: 'EDV-Kosten / Software', category: 'IT', note: 'HubSpot CRM/pazarlama' },
    { supplier_keyword: 'Shopify', description_keywords: ['shopify', 'onlineshop', 'e-commerce'], account_code: '4964', account_name: 'EDV-Kosten / Software', category: 'IT', note: 'Shopify e-ticaret platformu' },
    { description_keywords: ['hosting', 'server', 'domain', 'webspace', 'cloud'], account_code: '4964', account_name: 'EDV-Kosten / Software', category: 'IT', note: 'Web hosting/domain' },
    { description_keywords: ['antivirüs', 'antivirus', 'firewall', 'it-sicherheit', 'kaspersky', 'norton'], account_code: '4964', account_name: 'EDV-Kosten / Software', category: 'IT', note: 'Güvenlik yazılımı/antivirüs' },
    { description_keywords: ['edv-reparatur', 'pc-reparatur', 'it-service', 'it-support', 'it-wartung'], account_code: '4964', account_name: 'EDV-Kosten / Wartung', category: 'IT', note: 'BT bakım/onarım hizmeti' },
    { description_keywords: ['ssl-zertifikat', 'ssl', 'tls', 'zertifikat', 'wildcard'], account_code: '4964', account_name: 'EDV-Kosten / Software', category: 'IT', note: 'SSL sertifikası' },

    // ══════════════════════════════════════════════════════════════
    // ── 13. EĞİTİM ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['seminar', 'fortbildung', 'schulung', 'weiterbildung', 'kurs', 'workshop'], account_code: '4945', account_name: 'Aus-/Weiterbildung', category: 'Eğitim', note: 'Eğitim ve seminer' },
    { description_keywords: ['fachliteratur', 'fachbuch', 'lehrbuch', 'handbuch'], account_code: '4940', account_name: 'Zeitschriften/Bücher', category: 'Eğitim', note: 'Mesleki kitap/yayın' },
    { description_keywords: ['fachzeitschrift', 'abonnement', 'zeitschrift', 'abo'], account_code: '4940', account_name: 'Zeitschriften/Bücher', category: 'Eğitim', note: 'Mesleki dergi aboneliği' },
    { description_keywords: ['online-kurs', 'e-learning', 'udemy', 'coursera', 'linkedin learning'], account_code: '4945', account_name: 'Aus-/Weiterbildung', category: 'Eğitim', note: 'Online eğitim kursu' },
    { description_keywords: ['konferenz', 'kongress', 'tagung', 'fachkonferenz'], account_code: '4945', account_name: 'Aus-/Weiterbildung', category: 'Eğitim', note: 'Konferans/kongre katılım' },
    { description_keywords: ['coaching', 'business coaching', 'einzelcoaching'], account_code: '4945', account_name: 'Aus-/Weiterbildung', category: 'Eğitim', note: 'Koçluk/mentörlük' },
    { description_keywords: ['prüfungsgebühr', 'zertifizierung', 'zertifikat', 'lizenzprüfung'], account_code: '4945', account_name: 'Aus-/Weiterbildung', category: 'Eğitim', note: 'Sınav/sertifika ücreti' },

    // ══════════════════════════════════════════════════════════════
    // ── 14. PERSONEL ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['gehalt', 'lohn', 'bruttolohn', 'nettolohn', 'personalkosten'], account_code: '4100', account_name: 'Löhne und Gehälter', category: 'Personel', note: 'Maaş ve ücret ödemesi' },
    { description_keywords: ['sozialversicherung', 'krankenkasse', 'rentenversicherung', 'sv-beiträge'], account_code: '4130', account_name: 'Gesetzl. Sozialaufwend.', category: 'Personel', note: 'Sosyal güvenlik primleri' },
    { description_keywords: ['minijob', 'geringfügig', '520-euro', '450-euro', 'aushilfe'], account_code: '4190', account_name: 'Aushilfslöhne', category: 'Personel', note: 'Minijob/kısa süreli çalışan' },
    { description_keywords: ['berufsgenossenschaft', 'bg-beitrag', 'unfallversicherung bg'], account_code: '4138', account_name: 'Beiträge Berufsgenossensch.', category: 'Personel', note: 'Meslek birliği sigortası' },
    { description_keywords: ['vermögenswirksame', 'vwl', 'vermögensbildung'], account_code: '4170', account_name: 'Vermögenswirksame Leistungen', category: 'Personel', note: 'Çalışan tasarruf katkısı (VWL)' },
    { description_keywords: ['fahrgeld', 'fahrtkostenzuschuss', 'jobticket', 'deutschlandticket'], account_code: '4175', account_name: 'Fahrtkostenzuschuss', category: 'Personel', note: 'Ulaşım desteği/iş bileti' },
    { description_keywords: ['essenszuschuss', 'verpflegungszuschuss', 'restaurantgutschein'], account_code: '4140', account_name: 'Freiwillige Sozialleist.', category: 'Personel', note: 'Yemek katkısı/kupon' },
    { description_keywords: ['betriebliche altersvorsorge', 'bav', 'direktversicherung', 'pensionskasse'], account_code: '4165', account_name: 'Aufwend. betriebliche AV', category: 'Personel', note: 'İşyeri emeklilik sigortası' },
    { description_keywords: ['zeitarbeit', 'leiharbeit', 'personaldienstleistung', 'fremdpersonal'], account_code: '4199', account_name: 'Leiharbeitnehmer', category: 'Personel', note: 'Geçici işçi/personel kiralama' },
    { description_keywords: ['geschäftsführergehalt', 'geschäftsführervergütung', 'gf-gehalt'], account_code: '4120', account_name: 'Gehälter GF', category: 'Personel', note: 'Şirket müdürü maaşı' },
    { description_keywords: ['abfindung', 'aufhebungsvertrag', 'kündigungsentschädigung'], account_code: '4100', account_name: 'Löhne und Gehälter', category: 'Personel', note: 'Kıdem tazminatı' },
    { description_keywords: ['weihnachtsgeld', 'urlaubsgeld', 'sonderzahlung', 'bonus', 'prämie'], account_code: '4100', account_name: 'Löhne und Gehälter', category: 'Personel', note: 'İkramiye/prim ödemesi' },
    { description_keywords: ['arbeitgeberanteil', 'ag-anteil', 'sozialabgaben arbeitgeber'], account_code: '4130', account_name: 'Gesetzl. Sozialaufwend.', category: 'Personel', note: 'İşveren SGK payı' },
    { description_keywords: ['lohnsteuer', 'kirchensteuer', 'solidaritätszuschlag'], account_code: '4100', account_name: 'Löhne und Gehälter', category: 'Personel', note: 'Maaş vergisi/kesintiler' },

    // ══════════════════════════════════════════════════════════════
    // ── 15. AMORTİSMAN (ABSCHREIBUNG) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['abschreibung', 'afa', 'absetzung', 'nutzungsdauer'], account_code: '4820', account_name: 'Abschreibungen immat. VG', category: 'Amortisman', note: 'Maddi olmayan duran varlık amortismanı' },
    { description_keywords: ['afa software', 'abschreibung software', 'software-afa'], account_code: '4822', account_name: 'AfA Software', category: 'Amortisman', note: 'Yazılım amortismanı' },
    { description_keywords: ['afa gebäude', 'gebäudeabschreibung', 'immobilien-afa'], account_code: '4830', account_name: 'AfA Gebäude', category: 'Amortisman', note: 'Bina amortismanı' },
    { description_keywords: ['afa maschinen', 'maschinenabschreibung', 'anlagen-afa'], account_code: '4831', account_name: 'AfA Sachanlagen', category: 'Amortisman', note: 'Makine/tesis amortismanı' },
    { description_keywords: ['afa fahrzeug', 'kfz-afa', 'pkw-abschreibung'], account_code: '4832', account_name: 'AfA Kfz', category: 'Amortisman', note: 'Araç amortismanı' },
    { description_keywords: ['afa büroeinrichtung', 'möbel-afa', 'einrichtungsabschreibung'], account_code: '4831', account_name: 'AfA Sachanlagen', category: 'Amortisman', note: 'Ofis donanım amortismanı' },
    { description_keywords: ['afa edv', 'computer-afa', 'hardware-abschreibung'], account_code: '4831', account_name: 'AfA Sachanlagen', category: 'Amortisman', note: 'Bilgisayar/donanım amortismanı' },
    { description_keywords: ['gwg', 'geringwertig', 'sofortabschreibung'], account_code: '4855', account_name: 'Sofortabschr. GWG', category: 'Amortisman', note: 'Düşük değerli varlık anında amortisman (≤800€)' },
    { description_keywords: ['sonderabschreibung', 'sonder-afa', 'investitionsabzug'], account_code: '4840', account_name: 'Sonderabschreibungen', category: 'Amortisman', note: 'Özel amortisman (§7g)' },

    // ══════════════════════════════════════════════════════════════
    // ── 16. FAİZ GİDERLERİ (ZINSEN) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['zinsen', 'darlehenszinsen', 'kreditzinsen', 'bankzinsen'], account_code: '2100', account_name: 'Zinsen u. ähnl. Aufwend.', category: 'Zinsen', note: 'Kredi/banka faiz gideri' },
    { description_keywords: ['hypothekenzinsen', 'baufinanzierung', 'immobilienzinsen'], account_code: '2100', account_name: 'Zinsen u. ähnl. Aufwend.', category: 'Zinsen', note: 'Mortgage/gayrimenkul faizi' },
    { description_keywords: ['leasingzinsen', 'finanzierungsanteil', 'zinsanteil leasing'], account_code: '2100', account_name: 'Zinsen u. ähnl. Aufwend.', category: 'Zinsen', note: 'Leasing faiz payı' },
    { description_keywords: ['verzugszinsen', 'mahngebühr', 'säumniszuschlag', 'mahnung'], account_code: '2110', account_name: 'Sonstige Zinsen u. ähnl. Aufw.', category: 'Zinsen', note: 'Gecikme faizi/ihtar bedeli' },
    { description_keywords: ['zinserträge', 'habenzinsen', 'guthabenzinsen', 'festgeld'], account_code: '2650', account_name: 'Zinserträge', category: 'Zinsen', note: 'Faiz geliri (mevduat/vadeli)' },

    // ══════════════════════════════════════════════════════════════
    // ── 17. VERGİLER (STEUERN) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['gewerbesteuer', 'gewerbesteuerbescheid', 'gewerbesteuernachzahlung'], account_code: '4320', account_name: 'Gewerbesteuer', category: 'Steuern', note: 'Gewerbe (ticaret) vergisi' },
    { description_keywords: ['körperschaftsteuer', 'körperschaftsteuerbescheid'], account_code: '2200', account_name: 'Körperschaftsteuer', category: 'Steuern', note: 'Kurumlar vergisi' },
    { description_keywords: ['steuerliche nebenleistung', 'steuernachzahlung', 'nachzahlung finanzamt'], account_code: '4396', account_name: 'Steuerliche Nebenleistungen', category: 'Steuern', note: 'Vergi ek ödeme/ceza' },
    { description_keywords: ['solidaritätszuschlag', 'solz', 'soli'], account_code: '2208', account_name: 'Solidaritätszuschlag', category: 'Steuern', note: 'Dayanışma vergisi' },
    { description_keywords: ['grunderwerbsteuer', 'grundstückkauf'], account_code: '4390', account_name: 'Sonstige Abgaben', category: 'Steuern', note: 'Gayrimenkul edinim vergisi' },
    { description_keywords: ['umsatzsteuervorauszahlung', 'ust-vorauszahlung', 'umsatzsteuer'], account_code: '1780', account_name: 'Umsatzsteuer-Vorauszahlung', category: 'Steuern', note: 'KDV ön ödeme' },
    { description_keywords: ['einkommensteuer', 'einkommensteuervorauszahlung', 'est-vorauszahlung'], account_code: '2150', account_name: 'Einkommensteuer', category: 'Steuern', note: 'Gelir vergisi ön ödeme' },

    // ══════════════════════════════════════════════════════════════
    // ── 18. BAĞIŞLAR (SPENDEN) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['spende', 'spenden', 'zuwendung', 'gemeinnützig'], account_code: '4636', account_name: 'Spenden steuerbegünstigt', category: 'Spenden', note: 'Vergiden düşülebilir bağış' },
    { description_keywords: ['kirchensteuer arbeitnehmer', 'kirchenspende', 'kirchgeld'], account_code: '4636', account_name: 'Spenden steuerbegünstigt', category: 'Spenden', note: 'Kilise vergisi/bağışı' },
    { description_keywords: ['parteispende', 'politische partei', 'parteibeitrag'], account_code: '4637', account_name: 'Spenden politische Parteien', category: 'Spenden', note: 'Siyasi parti bağışı' },
    { description_keywords: ['stiftung', 'förderbeitrag', 'förderverein'], account_code: '4636', account_name: 'Spenden steuerbegünstigt', category: 'Spenden', note: 'Vakıf/dernek bağışı' },

    // ══════════════════════════════════════════════════════════════
    // ── 19. ÜYELİKLER (BEITRÄGE) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['ihk', 'industrie- und handelskammer', 'ihk-beitrag', 'kammerbeitrag'], account_code: '4380', account_name: 'Beiträge', category: 'Beiträge', note: 'IHK (Sanayi/Ticaret Odası) aidatı' },
    { description_keywords: ['handwerkskammer', 'hwk', 'hwk-beitrag'], account_code: '4380', account_name: 'Beiträge', category: 'Beiträge', note: 'Esnaf odası aidatı' },
    { description_keywords: ['berufsverband', 'branchenverband', 'fachverband', 'verbandsbeitrag'], account_code: '4380', account_name: 'Beiträge', category: 'Beiträge', note: 'Meslek birliği aidatı' },
    { description_keywords: ['gewerkschaft', 'arbeitgeberverband', 'tarifgemeinschaft'], account_code: '4380', account_name: 'Beiträge', category: 'Beiträge', note: 'Sendika/işveren derneği aidatı' },
    { description_keywords: ['vereinsbeitrag', 'mitgliedsbeitrag', 'club', 'verein'], account_code: '4380', account_name: 'Beiträge', category: 'Beiträge', note: 'Dernek/kulüp üyelik aidatı' },
    { description_keywords: ['schufa', 'creditreform', 'bonitätsauskunft', 'wirtschaftsauskunft'], account_code: '4380', account_name: 'Beiträge', category: 'Beiträge', note: 'Kredi raporlama üyeliği' },

    // ══════════════════════════════════════════════════════════════
    // ── 20. LEASİNG ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['büro-leasing', 'kopierer-leasing', 'drucker-leasing'], account_code: '4806', account_name: 'Leasingkosten Büro', category: 'Leasing', note: 'Ofis cihaz leasingi' },
    { description_keywords: ['maschinen-leasing', 'maschinenleasing', 'produktionsleasing'], account_code: '4806', account_name: 'Leasingkosten', category: 'Leasing', note: 'Makine leasingi' },
    { description_keywords: ['it-leasing', 'computer-leasing', 'hardware-leasing'], account_code: '4806', account_name: 'Leasingkosten', category: 'Leasing', note: 'BT donanım leasingi' },
    { description_keywords: ['telefonanlage leasing', 'kommunikationsanlage'], account_code: '4806', account_name: 'Leasingkosten', category: 'Leasing', note: 'Telefon santral leasingi' },

    // ══════════════════════════════════════════════════════════════
    // ── 21. BAKIM/ONARIM (WARTUNG/INSTANDHALTUNG) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['instandhaltung', 'wartung', 'reparatur', 'gebäudeinstandhaltung'], account_code: '4800', account_name: 'Reparaturen/Instandhaltung', category: 'Wartung', note: 'Genel bakım/onarım gideri' },
    { description_keywords: ['heizungswartung', 'klimawartung', 'aufzugwartung', 'lüftungswartung'], account_code: '4800', account_name: 'Reparaturen/Instandhaltung', category: 'Wartung', note: 'Tesisat/klima bakımı' },
    { description_keywords: ['maschinenwartung', 'maschinenerneuerung', 'ersatzteile'], account_code: '4805', account_name: 'Reparatur/Inst. Betriebsanl.', category: 'Wartung', note: 'Makine bakımı/yedek parça' },
    { description_keywords: ['sanitärinstallation', 'elektroinstallation', 'rohrbruch'], account_code: '4800', account_name: 'Reparaturen/Instandhaltung', category: 'Wartung', note: 'Tesisat/elektrik onarımı' },
    { description_keywords: ['dachreparatur', 'fassade', 'malerarbeiten', 'anstrich'], account_code: '4800', account_name: 'Reparaturen/Instandhaltung', category: 'Wartung', note: 'Bina dış bakım/boya' },
    { description_keywords: ['schädlingsbekämpfung', 'desinfektion', 'kammerjäger'], account_code: '4800', account_name: 'Reparaturen/Instandhaltung', category: 'Wartung', note: 'Haşere mücadele/dezenfeksiyon' },

    // ══════════════════════════════════════════════════════════════
    // ── 22. FREMDLEISTUNGEN (DIŞ HİZMETLER) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['fremdleistung', 'subunternehmer', 'unterauftragnehmer', 'nachunternehmer'], account_code: '3100', account_name: 'Fremdleistungen', category: 'Fremdleistungen', note: 'Alt yüklenici/taşeron hizmeti' },
    { description_keywords: ['freelancer', 'freiberufler', 'honorar', 'dienstleistungsvertrag'], account_code: '3100', account_name: 'Fremdleistungen', category: 'Fremdleistungen', note: 'Serbest çalışan hizmeti' },
    { description_keywords: ['grafikdesign', 'design', 'gestaltung', 'layouterstellung'], account_code: '3100', account_name: 'Fremdleistungen', category: 'Fremdleistungen', note: 'Grafik/tasarım hizmeti' },
    { description_keywords: ['textredaktion', 'texterstellung', 'copywriting', 'content'], account_code: '3100', account_name: 'Fremdleistungen', category: 'Fremdleistungen', note: 'İçerik/metin yazarlığı' },
    { description_keywords: ['programmierung', 'softwareentwicklung', 'webentwicklung', 'app-entwicklung'], account_code: '3100', account_name: 'Fremdleistungen', category: 'Fremdleistungen', note: 'Yazılım geliştirme hizmeti' },
    { description_keywords: ['fotografie', 'videoproduktion', 'filmproduktion', 'drohne'], account_code: '3100', account_name: 'Fremdleistungen', category: 'Fremdleistungen', note: 'Fotoğraf/video prodüksiyon' },

    // ══════════════════════════════════════════════════════════════
    // ── 23. WARENEINGANG (MAL ALIŞ) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['rohstoffe', 'rohmaterial', 'grundstoffe', 'ausgangsmaterial'], account_code: '3000', account_name: 'Roh-, Hilfs- u. Betriebsstoffe', category: 'Wareneingang', note: 'Hammadde alımı' },
    { description_keywords: ['hilfsstoffe', 'betriebsstoffe', 'verbrauchsmaterial'], account_code: '3000', account_name: 'Roh-, Hilfs- u. Betriebsstoffe', category: 'Wareneingang', note: 'Yardımcı malzeme alımı' },
    { description_keywords: ['waren', 'handelsware', 'einkauf', 'wareneinkauf'], account_code: '3200', account_name: 'Wareneingang', category: 'Wareneingang', note: 'Ticari mal alışı' },
    { description_keywords: ['wareneingang 7%', 'lebensmittel', 'nahrungsmittel', 'buch'], account_code: '3300', account_name: 'Wareneingang 7%', category: 'Wareneingang', note: '%7 KDV\'li mal alışı (gıda, kitap)' },
    { description_keywords: ['wareneingang 19%', 'elektronik', 'bekleidung', 'industriewaren'], account_code: '3400', account_name: 'Wareneingang 19%', category: 'Wareneingang', note: '%19 KDV\'li mal alışı' },
    { description_keywords: ['innergemeinschaftlich', 'eu-erwerb', 'eu-einkauf', 'binnenmarkt'], account_code: '3425', account_name: 'Innergemeinsch. Erwerb 19%', category: 'Wareneingang', note: 'AB içi mal alışı' },
    { description_keywords: ['import', 'einfuhr', 'drittland', 'zoll', 'einfuhrumsatzsteuer'], account_code: '3560', account_name: 'Einfuhr Drittland', category: 'Wareneingang', note: 'AB dışı ithalat' },
    { description_keywords: ['verpackungsmaterial', 'karton', 'palette', 'folie', 'füllmaterial'], account_code: '3150', account_name: 'Verpackungsmaterial', category: 'Wareneingang', note: 'Ambalaj malzemesi' },
    { description_keywords: ['bezugsnebenkosten', 'frachtkosten einkauf', 'transportkosten einkauf'], account_code: '3800', account_name: 'Bezugsnebenkosten', category: 'Wareneingang', note: 'Satın alma nakliye gideri' },

    // ══════════════════════════════════════════════════════════════
    // ── 24. ERLÖSE / SATIŞ GELİRLERİ ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['erlöse', 'umsatzerlöse', 'verkauf', 'umsatz 19%'], account_code: '8400', account_name: 'Erlöse 19% USt', category: 'Erlöse', note: 'Satış geliri (%19 KDV)' },
    { description_keywords: ['erlöse 7%', 'umsatz 7%', 'ermäßigt'], account_code: '8300', account_name: 'Erlöse 7% USt', category: 'Erlöse', note: 'Satış geliri (%7 KDV)' },
    { description_keywords: ['steuerfreie erlöse', 'umsatzsteuerfrei', 'export', 'ausfuhr'], account_code: '8100', account_name: 'Steuerfreie Erlöse', category: 'Erlöse', note: 'KDV\'siz satış (ihracat)' },
    { description_keywords: ['innergemeinschaftliche lieferung', 'eu-lieferung', 'eu-verkauf'], account_code: '8125', account_name: 'Innergem. Lieferung steuerfrei', category: 'Erlöse', note: 'AB içi teslimat (vergisiz)' },
    { description_keywords: ['provisionserträge', 'vermittlungsprovision', 'handelsvertreterprovision'], account_code: '8510', account_name: 'Provisionserträge', category: 'Erlöse', note: 'Komisyon geliri' },
    { description_keywords: ['mieteinnahmen', 'mietertrag', 'pachteinnahmen'], account_code: '8510', account_name: 'Sonstige Erträge', category: 'Erlöse', note: 'Kira geliri' },
    { description_keywords: ['erlöse anlagenverkauf', 'verkauf sachanlagen', 'anlagenabgang'], account_code: '8800', account_name: 'Erlöse Anlageabgänge', category: 'Erlöse', note: 'Duran varlık satış geliri' },
    { description_keywords: ['skonto erhalten', 'lieferantenskonto', 'nachlass erhalten'], account_code: '8736', account_name: 'Erhaltene Skonti', category: 'Erlöse', note: 'Alınan iskonto/skonto' },
    { description_keywords: ['gewährte skonti', 'kundenskonto', 'skonto gewährt'], account_code: '8700', account_name: 'Erlösschmälerungen', category: 'Erlöse', note: 'Verilen iskonto/indirim' },
    { description_keywords: ['gutschrift', 'retoure', 'rücksendung', 'warenrücknahme'], account_code: '8700', account_name: 'Erlösschmälerungen', category: 'Erlöse', note: 'İade/alacak dekontu' },
    { description_keywords: ['dienstleistungserlöse', 'beratungserlöse', 'serviceumsatz'], account_code: '8400', account_name: 'Erlöse 19% USt', category: 'Erlöse', note: 'Hizmet geliri (%19)' },

    // ══════════════════════════════════════════════════════════════
    // ── 25. PROVİSYONLAR (KOMİSYON GİDERLERİ) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['provision', 'vertriebsprovision', 'handelsvertretung', 'vermittlung'], account_code: '4760', account_name: 'Verkaufsprovisionen', category: 'Provisionen', note: 'Satış komisyonu gideri' },
    { description_keywords: ['affiliate', 'affiliate-provision', 'partnerprogramm'], account_code: '4760', account_name: 'Verkaufsprovisionen', category: 'Provisionen', note: 'Affiliate/ortaklık komisyonu' },
    { description_keywords: ['maklergebühr', 'maklerprovision', 'vermittlungsgebühr'], account_code: '4760', account_name: 'Verkaufsprovisionen', category: 'Provisionen', note: 'Komisyoncu/aracı ücreti' },

    // ══════════════════════════════════════════════════════════════
    // ── 26. MAKİNE KİRASI (MIETE MASCHINEN) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['maschinenmiete', 'gerätemiete', 'baumaschinenmiete'], account_code: '4800', account_name: 'Mieten für Einrichtungen', category: 'Miete Maschinen', note: 'Makine/ekipman kirası' },
    { description_keywords: ['mietwerkzeug', 'werkzeugmiete', 'geräteverleih'], account_code: '4800', account_name: 'Mieten für Einrichtungen', category: 'Miete Maschinen', note: 'Alet/cihaz kiralama' },
    { description_keywords: ['gabelstapler', 'hubwagen', 'kran', 'bagger', 'baugerät'], account_code: '4800', account_name: 'Mieten für Einrichtungen', category: 'Miete Maschinen', note: 'İnşaat/ağır ekipman kirası' },

    // ══════════════════════════════════════════════════════════════
    // ── 27. KURULUŞ MALİYETLERİ (GRÜNDUNGSKOSTEN) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['gründungskosten', 'firmengründung', 'gesellschaftsgründung'], account_code: '4973', account_name: 'Gründungskosten', category: 'Gründung', note: 'Şirket kuruluş masrafları' },
    { description_keywords: ['handelsregister', 'eintragung', 'registergericht', 'hr-auszug'], account_code: '4973', account_name: 'Gründungskosten', category: 'Gründung', note: 'Ticaret sicil kaydı' },
    { description_keywords: ['gewerbeanmeldung', 'gewerbeummeldung', 'gewerbeerlaubnis'], account_code: '4973', account_name: 'Gründungskosten', category: 'Gründung', note: 'İşyeri açma/değişiklik harcı' },
    { description_keywords: ['gesellschaftsvertrag', 'satzung', 'gründungsprotokoll'], account_code: '4973', account_name: 'Gründungskosten', category: 'Gründung', note: 'Şirket sözleşmesi masrafları' },

    // ══════════════════════════════════════════════════════════════
    // ── 28. ALETLER (WERKZEUGE) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['werkzeug', 'handwerkzeug', 'bohrer', 'schrauber', 'säge'], account_code: '4985', account_name: 'Werkzeuge/Kleingeräte', category: 'Werkzeuge', note: 'El aleti/küçük ekipman' },
    { description_keywords: ['messgerät', 'prüfgerät', 'messwerkzeug', 'waage'], account_code: '4985', account_name: 'Werkzeuge/Kleingeräte', category: 'Werkzeuge', note: 'Ölçüm/test cihazı' },
    { description_keywords: ['arbeitsgerät', 'kleingerät', 'elektrowerkzeug'], account_code: '4985', account_name: 'Werkzeuge/Kleingeräte', category: 'Werkzeuge', note: 'Elektrikli el aleti' },

    // ══════════════════════════════════════════════════════════════
    // ── 29. İŞ KIYAFETİ (ARBEITSKLEIDUNG) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['arbeitskleidung', 'berufskleidung', 'schutzkleidung', 'sicherheitsschuhe'], account_code: '4980', account_name: 'Arbeitskleidung', category: 'Arbeitskleidung', note: 'İş kıyafeti/koruyucu giysi' },
    { description_keywords: ['helm', 'handschuhe', 'schutzbrille', 'arbeitsschutz', 'gehörschutz'], account_code: '4980', account_name: 'Arbeitskleidung', category: 'Arbeitskleidung', note: 'İş güvenliği ekipmanı' },

    // ══════════════════════════════════════════════════════════════
    // ── 30. ATIK/BERTARAF (ABFALL/ENTSORGUNG) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['abfall', 'entsorgung', 'müllentsorgung', 'sondermüll'], account_code: '4260', account_name: 'Abfallbeseitigung', category: 'Entsorgung', note: 'Atık toplama/bertaraf' },
    { description_keywords: ['altpapier', 'aktenvernichtung', 'datenschutzentsorgung'], account_code: '4260', account_name: 'Abfallbeseitigung', category: 'Entsorgung', note: 'Kağıt imha/veri güvenliği' },
    { description_keywords: ['recycling', 'wertstoff', 'elektroschrott', 'altgeräte'], account_code: '4260', account_name: 'Abfallbeseitigung', category: 'Entsorgung', note: 'Geri dönüşüm/e-atık' },

    // ══════════════════════════════════════════════════════════════
    // ── 31. LİSANS ÜCRETLERİ (LIZENZGEBÜHREN) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['lizenz', 'lizenzgebühr', 'nutzungsrecht', 'urheberrecht'], account_code: '4964', account_name: 'EDV-Kosten / Lizenzen', category: 'Lizenzen', note: 'Yazılım lisans ücreti' },
    { description_keywords: ['patent', 'patentgebühr', 'patentanmeldung'], account_code: '4964', account_name: 'Lizenzgebühren', category: 'Lizenzen', note: 'Patent ücreti' },
    { description_keywords: ['marke', 'markenrecht', 'markenanmeldung', 'trademark'], account_code: '4964', account_name: 'Lizenzgebühren', category: 'Lizenzen', note: 'Marka tescil ücreti' },
    { description_keywords: ['gema', 'musikrecht', 'bildrecht', 'stockfoto'], account_code: '4964', account_name: 'Lizenzgebühren', category: 'Lizenzen', note: 'Telif/imaj lisansı' },

    // ══════════════════════════════════════════════════════════════
    // ── 32. ÇEŞİTLİ GİDERLER (SONSTIGE) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['umzug', 'umzugskosten', 'spedition', 'möbeltransport'], account_code: '4970', account_name: 'Nebenkosten Geldverkehr', category: 'Sonstige', note: 'Taşınma/nakliye gideri' },
    { description_keywords: ['trinkgeld', 'tip', 'zuwendung'], account_code: '4960', account_name: 'Verschiedene betr. Aufwend.', category: 'Sonstige', note: 'Bahşiş gideri' },
    { description_keywords: ['bußgeld', 'ordnungswidrigkeit', 'verwarnungsgeld', 'strafe'], account_code: '4396', account_name: 'Steuerl. nicht abz. Aufwend.', category: 'Sonstige', note: 'Para cezası (gider yazılmaz!)' },
    { description_keywords: ['schadensersatz', 'schadenregulierung', 'ausgleichszahlung'], account_code: '4960', account_name: 'Verschiedene betr. Aufwend.', category: 'Sonstige', note: 'Tazminat/hasar tazmini' },
    { description_keywords: ['mitgliedschaft software', 'premium-abo', 'jahresabo'], account_code: '4964', account_name: 'EDV-Kosten / Software', category: 'Sonstige', note: 'Yazılım yıllık abonelik' },
    { description_keywords: ['bankbürgschaft', 'kaution', 'mietkaution', 'sicherheitsleistung'], account_code: '1525', account_name: 'Kautionen', category: 'Sonstige', note: 'Depozito/teminat' },
    { description_keywords: ['privatentnahme', 'privateinlage', 'gesellschaftereinlage'], account_code: '1800', account_name: 'Privatentnahmen', category: 'Sonstige', note: 'Özel çekim/sermaye koyma' },
    { description_keywords: ['forderungsverlust', 'uneinbringlich', 'abschreibung forderung', 'wertberichtigung'], account_code: '4805', account_name: 'Forderungsverluste', category: 'Sonstige', note: 'Şüpheli alacak zararı' },

    // ══════════════════════════════════════════════════════════════
    // ── 33. DURAN VARLIKLAR (ANLAGEVERMÖGEN) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['grundstück', 'grundstückskauf', 'immobilie', 'gebäudekauf'], account_code: '0060', account_name: 'Grundstücke/Bauten', category: 'Anlagevermögen', note: 'Arsa/bina alımı' },
    { description_keywords: ['maschine', 'maschinenanlage', 'produktionsanlage', 'fertigungsanlage'], account_code: '0210', account_name: 'Maschinen', category: 'Anlagevermögen', note: 'Makine/üretim tesisi alımı' },
    { description_keywords: ['fuhrpark', 'nutzfahrzeug', 'transporter', 'lieferwagen', 'lkw'], account_code: '0320', account_name: 'PKW', category: 'Anlagevermögen', note: 'Ticari araç/kamyon alımı' },
    { description_keywords: ['edv-hardware', 'serveranlage', 'netzwerkausrüstung'], account_code: '0650', account_name: 'Büromaschinen', category: 'Anlagevermögen', note: 'BT donanım/sunucu alımı' },
    { description_keywords: ['geschäftsausstattung', 'ladenausstattung', 'ladenbau', 'theke'], account_code: '0420', account_name: 'Geschäftsausstattung', category: 'Anlagevermögen', note: 'Mağaza/iş yeri donanımı' },
    { description_keywords: ['softwarelizenz kauf', 'erp-system', 'unternehmenssoftware'], account_code: '0027', account_name: 'EDV-Software', category: 'Anlagevermögen', note: 'Yazılım satın alımı (Duran Varlık)' },
    { description_keywords: ['beteiligung', 'geschäftsanteil', 'gmbh-anteil', 'aktien beteiligung'], account_code: '0500', account_name: 'Beteiligungen', category: 'Anlagevermögen', note: 'Şirket hissesi/iştirak' },

    // ══════════════════════════════════════════════════════════════
    // ── 34. NAKLIYE/LOJİSTİK (TRANSPORT) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['fracht', 'frachtkosten', 'spedition', 'transport'], account_code: '4730', account_name: 'Ausgangsfrachten', category: 'Transport', note: 'Çıkış nakliye gideri' },
    { description_keywords: ['zoll', 'zollgebühr', 'einfuhrzoll', 'ausfuhrzoll'], account_code: '3560', account_name: 'Zölle/Einfuhrabgaben', category: 'Transport', note: 'Gümrük vergisi' },
    { description_keywords: ['verpackung', 'versandverpackung', 'exportverpackung'], account_code: '4910', account_name: 'Verpackungskosten', category: 'Transport', note: 'Sevkiyat ambalaj gideri' },

    // ══════════════════════════════════════════════════════════════
    // ── 35. İNŞAAT VE YAPI (BAU) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['bauarbeiten', 'bauunternehmen', 'baustelle', 'rohbau'], account_code: '0420', account_name: 'Gebäude/Umbau', category: 'Bau', note: 'İnşaat/yapı işleri' },
    { description_keywords: ['renovierung', 'sanierung', 'umbau', 'modernisierung'], account_code: '0420', account_name: 'Gebäude/Umbau', category: 'Bau', note: 'Tadilat/yenileme' },
    { description_keywords: ['architekt', 'bauplanung', 'baugenehmigung', 'bauantrag'], account_code: '4950', account_name: 'Rechts-/Beratungskosten', category: 'Bau', note: 'Mimar/inşaat planlama' },

    // ══════════════════════════════════════════════════════════════
    // ── 36. HESAP PLANI - SINIF 0 (DURAN VARLIKLAR EK) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['konzession', 'lizenzrecht', 'gewerbliche schutzrechte', 'patent kauf'], account_code: '0015', account_name: 'Konzessionen', category: 'Hesap Planı', note: 'İmtiyaz/ticari haklar' },
    { description_keywords: ['firmenwert', 'goodwill', 'geschäftswert', 'übernahme'], account_code: '0135', account_name: 'Geschäfts-/Firmenwert', category: 'Hesap Planı', note: 'Şerefiye/firma değeri' },
    { description_keywords: ['geleistete anzahlung', 'vorauszahlung anlagen', 'investition anzahlung'], account_code: '0280', account_name: 'Geleistete Anzahlungen SAV', category: 'Hesap Planı', note: 'Duran varlık avansı' },
    { description_keywords: ['technische anlagen', 'produktionsanlage', 'betriebsanlage'], account_code: '0200', account_name: 'Technische Anlagen', category: 'Hesap Planı', note: 'Teknik tesis/üretim ekipmanı' },
    { description_keywords: ['werkzeuge maschinen', 'vorrichtung', 'modell', 'form'], account_code: '0400', account_name: 'Betriebs-/Geschäftsausst.', category: 'Hesap Planı', note: 'İşletme donanımı/kalıp' },

    // ══════════════════════════════════════════════════════════════
    // ── 37. HESAP PLANI - SINIF 1 (FİNANS HESAPLARI) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['kasse', 'bargeld', 'kassenbestand', 'handkasse'], account_code: '1000', account_name: 'Kasse', category: 'Hesap Planı', note: 'Nakit kasa' },
    { description_keywords: ['postbank', 'giro', 'bankkonto', 'geschäftskonto'], account_code: '1200', account_name: 'Bank', category: 'Hesap Planı', note: 'Banka hesabı' },
    { description_keywords: ['besitzwechsel', 'wechsel', 'schuldwechsel'], account_code: '1300', account_name: 'Besitzwechsel', category: 'Hesap Planı', note: 'Alınan senetler' },
    { description_keywords: ['durchlaufende posten', 'durchgangsposten', 'verrechnungskonto'], account_code: '1590', account_name: 'Durchlaufende Posten', category: 'Hesap Planı', note: 'Geçici hesaplar' },
    { description_keywords: ['geldtransit', 'interimsbank', 'zwischenkonto'], account_code: '1360', account_name: 'Geldtransit', category: 'Hesap Planı', note: 'Para transfer hesabı' },
    { description_keywords: ['forderung gesellschafter', 'gesellschafterdarlehen', 'verrechnungskonto gf'], account_code: '1500', account_name: 'Sonstige Vermögensgegenstände', category: 'Hesap Planı', note: 'Ortaklardan alacaklar' },

    // ══════════════════════════════════════════════════════════════
    // ── 38. HESAP PLANI - SINIF 2 (KARŞILIK/BORÇ) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['verbindlichkeit', 'sonstige verbindlichkeit', 'schulden'], account_code: '2300', account_name: 'Sonstige Verbindlichkeiten', category: 'Hesap Planı', note: 'Diğer borçlar' },
    { description_keywords: ['erhaltene anzahlung', 'kundenanzahlung', 'vorauszahlung erhalten'], account_code: '2400', account_name: 'Erhaltene Anzahlungen', category: 'Hesap Planı', note: 'Alınan avanslar' },
    { description_keywords: ['rückstellung', 'pensionsrückstellung', 'urlaubsrückstellung', 'garantierückstellung'], account_code: '2900', account_name: 'Sonstige Rückstellungen', category: 'Hesap Planı', note: 'Karşılıklar (izin, garanti vb.)' },
    { description_keywords: ['darlehen', 'bankdarlehen', 'kredit', 'tilgung'], account_code: '2350', account_name: 'Verbindlichkeiten ggü. Kreditinst.', category: 'Hesap Planı', note: 'Banka kredisi/taksit borcu' },
    { description_keywords: ['lieferantenverbindlichkeit', 'kreditor', 'lieferantenrechnung'], account_code: '1600', account_name: 'Verbindlichk. Lieferungen', category: 'Hesap Planı', note: 'Satıcı borçları' },

    // ══════════════════════════════════════════════════════════════
    // ── 39. HESAP PLANI - SINIF 3 (STOK/MAL EK) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['bestandsveränderung', 'lagerveränderung', 'inventurdifferenz'], account_code: '3500', account_name: 'Bestandsveränderungen', category: 'Hesap Planı', note: 'Stok değişimleri' },
    { description_keywords: ['bezugsnebenkosten ware', 'eingangsfracht', 'anlieferungskosten'], account_code: '3800', account_name: 'Bezugsnebenkosten', category: 'Hesap Planı', note: 'Mal alım yan giderleri' },
    { description_keywords: ['nachlasserhalt', 'lieferantenrabatt', 'einkaufsrabatt', 'bonuserhalt'], account_code: '3700', account_name: 'Erhaltene Rabatte', category: 'Hesap Planı', note: 'Alınan indirimler' },
    { description_keywords: ['rücksendung lieferant', 'warenrücksendung', 'retoure lieferant'], account_code: '3700', account_name: 'Erhaltene Rabatte', category: 'Hesap Planı', note: 'Tedarikçiye iade' },

    // ══════════════════════════════════════════════════════════════
    // ── 40. HESAP PLANI - SINIF 4 (GİDER EK) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['sonstige steuer', 'steueraufwand', 'abgabe', 'gebühr amt'], account_code: '4340', account_name: 'Sonstige Steuern', category: 'Hesap Planı', note: 'Diğer vergi giderleri' },
    { description_keywords: ['sonstige abgabe', 'behördengebühr', 'genehmigungsgebühr', 'lizenzabgabe'], account_code: '4390', account_name: 'Sonstige Abgaben', category: 'Hesap Planı', note: 'Diğer resmi harçlar' },
    { description_keywords: ['freiwillige sozialleistung', 'betriebsausflug', 'jubiläum', 'teambuilding'], account_code: '4140', account_name: 'Freiwillige Sozialleist.', category: 'Hesap Planı', note: 'İsteğe bağlı sosyal harcamalar' },
    { description_keywords: ['periodenfremd', 'nachzahlung vorjahr', 'vorperiode', 'vorjahresaufwand'], account_code: '4900', account_name: 'Sonst. betr. Aufwendungen', category: 'Hesap Planı', note: 'Geçmiş dönem giderleri' },
    { description_keywords: ['aufwand eigenleistung', 'aktivierte eigenleistung', 'selbsterstellte anlage'], account_code: '4900', account_name: 'Sonst. betr. Aufwendungen', category: 'Hesap Planı', note: 'Kendi üretimiyle aktifleştirme' },
    { description_keywords: ['kalkulatorisch', 'kalkulatorische abschreibung', 'kalkulatorische miete'], account_code: '4900', account_name: 'Sonst. betr. Aufwendungen', category: 'Hesap Planı', note: 'Hesabi giderler (iç maliyet)' },

    // ══════════════════════════════════════════════════════════════
    // ── 41. HESAP PLANI - SINIF 7 (STOK EK) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['unfertige erzeugnisse', 'halbfertigprodukte', 'work in progress'], account_code: '7050', account_name: 'Unfertige Erzeugnisse', category: 'Hesap Planı', note: 'Yarı mamul stokları' },
    { description_keywords: ['fertige erzeugnisse', 'fertigwaren', 'lagerbestand fertig'], account_code: '7100', account_name: 'Fertige Erzeugnisse', category: 'Hesap Planı', note: 'Mamul stokları' },

    // ══════════════════════════════════════════════════════════════
    // ── 42. HESAP PLANI - SINIF 8 (GELİR EK) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['innergemeinschaftlich steuerfrei', 'ig-lieferung steuerfrei'], account_code: '8190', account_name: 'Innergem. Lieferung 0%', category: 'Hesap Planı', note: 'AB içi vergisiz teslimat' },
    { description_keywords: ['zinserträge bank', 'festgeldzinsen', 'tagesgeld', 'kapitalertrag'], account_code: '2650', account_name: 'Zinserträge', category: 'Hesap Planı', note: 'Faiz/sermaye geliri' },
    { description_keywords: ['eigenverbrauch', 'privatnutzung', 'sachentnahme', 'verwendungsentnahme'], account_code: '8900', account_name: 'Eigenverbrauch', category: 'Hesap Planı', note: 'Kişisel kullanım/özel tüketim' },
    { description_keywords: ['außerordentlicher ertrag', 'versicherungsentschädigung', 'schadenersatz erhalten'], account_code: '2500', account_name: 'Außerord. Erträge', category: 'Hesap Planı', note: 'Olağanüstü gelir (sigorta tazminatı vb.)' },
    { description_keywords: ['mieterträge', 'pachteinnahmen', 'vermietung'], account_code: '2700', account_name: 'Sonstige Zinsen/Erträge', category: 'Hesap Planı', note: 'Kira/kiralama geliri' },
    { description_keywords: ['währungsgewinn', 'kursgewinn', 'wechselkursertrag'], account_code: '2700', account_name: 'Sonstige Zinsen/Erträge', category: 'Hesap Planı', note: 'Kur kazancı' },

    // ══════════════════════════════════════════════════════════════
    // ── 43. HESAP PLANI - SINIF 9 (SERMAYE/İSTATİSTİK) ──
    // ══════════════════════════════════════════════════════════════
    { description_keywords: ['saldenvortrag', 'eröffnungsbilanz', 'anfangsbestand'], account_code: '9000', account_name: 'Saldenvorträge Aktiva', category: 'Hesap Planı', note: 'Açılış bilançosu (aktif devir)' },
    { description_keywords: ['gezeichnetes kapital', 'stammkapital', 'grundkapital'], account_code: '9000', account_name: 'Gezeichnetes Kapital', category: 'Hesap Planı', note: 'Kayıtlı sermaye' },
  ];

interface Props {
  userId: string | undefined;
  userRole: string;
  flash: (text: string, ok?: boolean) => void;
}

const lsKeyFor = (uid?: string) => uid ? `fibu_de_settings_${uid}` : "fibu_de_settings";
const lsGet = (uid?: string) => {
  try {
    if (uid) {
      const r = localStorage.getItem(lsKeyFor(uid));
      if (r) return JSON.parse(r);
    }
    // Fallback: eski global key (migration)
    const old = localStorage.getItem("fibu_de_settings");
    if (old) {
      const parsed = JSON.parse(old);
      if (uid) {
        localStorage.setItem(lsKeyFor(uid), old);
        localStorage.removeItem("fibu_de_settings");
      }
      return parsed;
    }
    return null;
  } catch { return null; }
};
const lsSet = (d: any, uid?: string) => {
  try { localStorage.setItem(lsKeyFor(uid), JSON.stringify(d)); } catch { }
};

export const SettingsMatchingTab: React.FC<Props> = ({ userId, userRole, flash }) => {
  const invoices: any[] = [];
  const invoiceItems: any[] = [];
  const { lang } = useLang();
  const tr = (a: string, b: string) => lang === "tr" ? a : b;

  const [rules, setRules] = useState<EnhancedRule[]>([]);
  const [suggestions, setSuggestions] = useState<LearnSuggestion[]>([]);
  const [learnLoading, setLearnLoading] = useState(false);
  const [ruleSubTab, setRuleSubTab] = useState<"manual" | "learned" | "datev" | "stats">("manual");
  const [editingRule, setEditingRule] = useState<EnhancedRule | null>(null);
  const [newRule, setNewRule] = useState({ supplier_keyword: "", description_keywords: "", account_code: "", account_name: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [datevSearch, setDatevSearch] = useState("");

  const now = () => new Date().toISOString();
  const uid = () => `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const loadRules = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from("user_settings").select("rules")
        .eq("user_id", userId).maybeSingle();

      const sbRules: EnhancedRule[] = (!error && data && Array.isArray(data.rules))
        ? (data.rules as EnhancedRule[]) : [];

      const local = lsGet(userId);
      const lsRules: EnhancedRule[] = Array.isArray(local?.rules) ? local.rules : [];

      let reRules: EnhancedRule[] = [];
      try {
        const reRaw = localStorage.getItem("fibu_rules") ||
          localStorage.getItem("muhasys_rules") ||
          localStorage.getItem("enhanced_rules");
        if (reRaw) reRules = JSON.parse(reRaw) as EnhancedRule[];
      } catch { /* ignore */ }

      const mergedMap = new Map<string, EnhancedRule>();
      [...reRules, ...lsRules, ...sbRules].forEach(r => { if (r?.id) mergedMap.set(r.id, r); });
      const mergedRules = Array.from(mergedMap.values());

      console.log(`[MatchingTab] Kurallar: SB=${sbRules.length}, LS=${lsRules.length}, RE=${reRules.length}, Birleşik=${mergedRules.length}`);
      setRules(mergedRules);
    } catch (err) {
      console.error("[MatchingTab] loadRules hatası:", err);
      const local = lsGet(userId);
      if (Array.isArray(local?.rules)) setRules(local.rules);
    }
  }, [userId]);

  useEffect(() => { loadRules(); }, [loadRules]);

  const saveRules = async (updated: EnhancedRule[]) => {
    if (!userId) throw new Error("Oturum yok");
    setRules(updated);
    const local = lsGet(userId) || {};
    const merged = { ...local, rules: updated };
    const { error } = await supabase.from("user_settings")
      .upsert({ user_id: userId, ...merged }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    lsSet(merged, userId);
  };

  const addRule = async () => {
    if (!newRule.account_code) { flash(tr("Hesap kodu zorunlu!", "Konto erforderlich!"), false); return; }
    if (!newRule.supplier_keyword && !newRule.description_keywords.trim()) {
      flash(tr("Tedarikçi veya anahtar kelime girin", "Lieferant oder Schlüsselwort eingeben"), false); return;
    }
    setSaving(true);
    try {
      const kwds = newRule.description_keywords.split(",").map(s => s.trim()).filter(Boolean);
      const rule: EnhancedRule = {
        id: uid(), type: "manual",
        supplier_keyword: newRule.supplier_keyword.trim() || undefined,
        description_keywords: kwds,
        account_code: newRule.account_code.trim(),
        account_name: newRule.account_name.trim(),
        confidence: 100, hit_count: 0, learn_count: 0,
        last_used: now(), active: true,
        note: newRule.note.trim(), created_at: now(), updated_at: now(),
      };
      await saveRules([rule, ...rules]);
      setNewRule({ supplier_keyword: "", description_keywords: "", account_code: "", account_name: "", note: "" });
      flash(tr("✓ Kural eklendi", "✓ Regel hinzugefügt"));
    } catch (e: any) { flash(e.message, false); } finally { setSaving(false); }
  };

  const delRule = async (id: string) => {
    setSaving(true);
    try { await saveRules(rules.filter(r => r.id !== id)); flash(tr("Kural silindi", "Regel gelöscht")); }
    catch (e: any) { flash(e.message, false); } finally { setSaving(false); }
  };

  const toggleRule = async (id: string) => {
    const updated = rules.map(r => r.id === id ? { ...r, active: !r.active, updated_at: now() } : r);
    try { await saveRules(updated); } catch (e: any) { flash(e.message, false); }
  };

  const saveEditingRule = async () => {
    if (!editingRule) return;
    setSaving(true);
    try {
      const updated = rules.map(r => r.id === editingRule.id ? { ...editingRule, updated_at: now() } : r);
      await saveRules(updated); setEditingRule(null);
      flash(tr("✓ Kural güncellendi", "✓ Regel aktualisiert"));
    } catch (e: any) { flash(e.message, false); } finally { setSaving(false); }
  };

  const acceptSuggestion = async (sug: LearnSuggestion) => {
    setSaving(true);
    try {
      const rule: EnhancedRule = { ...sug.rule, active: true, updated_at: now() };
      await saveRules([...rules, rule]);
      setSuggestions(prev => prev.filter(s => s.rule.id !== sug.rule.id));
      flash(tr("✓ Kural öğrenildi", "✓ Regel gelernt"));
    } catch (e: any) { flash(e.message, false); } finally { setSaving(false); }
  };

  const acceptAllSuggestions = async () => {
    if (!suggestions.length) return;
    setSaving(true);
    try {
      const newRules: EnhancedRule[] = suggestions.map(s => ({ ...s.rule, active: true, updated_at: now() }));
      const existingIds = new Set(rules.map(r => r.id));
      const toAdd = newRules.filter(r => !existingIds.has(r.id));
      await saveRules([...rules, ...toAdd]);
      setSuggestions([]);
      flash(tr(`✓ ${toAdd.length} kural öğrenildi ve aktif edildi`, `✓ ${toAdd.length} Regeln gelernt und aktiviert`));
    } catch (e: any) { flash(e.message, false); } finally { setSaving(false); }
  };

  const dismissSuggestion = (id: string) => {
    setSuggestions(prev => prev.filter(s => s.rule.id !== id));
  };

  const runLearnFromHistory = useCallback(async () => {
    if (!invoices.length || !invoiceItems.length) {
      flash(tr("Öğrenilecek fatura verisi yok", "Keine Rechnungsdaten zum Lernen"), false); return;
    }
    setLearnLoading(true);
    try {
      const sugs = learnFromHistory(invoiceItems, invoices, rules);
      setSuggestions(sugs);
      if (sugs.length === 0) flash(tr("Yeni öneri bulunamadı (eşik: 3 fatura)", "Keine neuen Vorschläge (Schwellenwert: 3 Rechnungen)"));
      else flash(tr(`${sugs.length} yeni öneri bulundu!`, `${sugs.length} neue Vorschläge gefunden!`));
    } finally { setLearnLoading(false); }
  }, [invoices, invoiceItems, rules]);

  const ruleStats = useMemo(() => computeRuleStats(rules), [rules]);

  return (
    <div className="space-y-4 fade-up">

      {/* ── Debug bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "8px 14px", borderRadius: "10px", marginBottom: "4px",
        background: "rgba(6,182,212,.04)", border: "1px solid rgba(6,182,212,.1)",
        fontSize: "11px", color: "#3a3f4a", fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        <span style={{ color: "#06b6d4", fontWeight: 700 }}>
          {rules.length} {tr("kural yüklendi", "Regeln geladen")}
        </span>
        <span>·</span>
        <span style={{ color: rules.filter(r => r?.type === "manual").length > 0 ? "#8b5cf6" : "#2a3040" }}>
          {rules.filter(r => r?.type === "manual").length} {tr("manuel", "manuell")}
        </span>
        <span>·</span>
        <span style={{ color: rules.filter(r => r?.type === "learned").length > 0 ? "#10b981" : "#2a3040" }}>
          {rules.filter(r => r?.type === "learned").length} {tr("öğrenilen", "gelernt")}
        </span>
        <span>·</span>
        <span style={{ color: rules.filter(r => r?.active).length > 0 ? "#f59e0b" : "#2a3040" }}>
          {rules.filter(r => r?.active).length} {tr("aktif", "aktiv")}
        </span>
      </div>

      {/* ── Sub-tab bar ── */}
      <div className="flex gap-1 rounded-md overflow-hidden shrink-0 w-fit"
        style={{ border: "1px solid #1c1f27" }}>
        {([
          { key: "manual", icon: "✎", label: tr("Manuel Kurallar", "Manuelle Regeln"), badge: String(rules.filter(r => r?.type === "manual").length) },
          { key: "datev", icon: "📋", label: tr("DATEV Öneriler", "DATEV Vorschläge"), badge: String(DATEV_SUGGESTED_RULES.length) },
          { key: "learned", icon: "◈", label: tr("Öğrenilen", "Gelernte Regeln"), badge: String(rules.filter(r => r?.type === "learned").length) },
          { key: "stats", icon: "⊙", label: tr("İstatistikler", "Statistiken"), badge: null },
        ] as const).map(st => (
          <button key={st.key} onClick={() => setRuleSubTab(st.key)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold cursor-pointer border-none transition-all"
            style={ruleSubTab === st.key
              ? { background: "#06b6d4", color: "#fff" }
              : { background: "rgba(255,255,255,.02)", color: "#3a3f4a" }}>
            <span className="font-mono">{st.icon}</span>
            <span>{st.label}</span>
            {st.badge !== null && (
              <span className="font-mono px-1.5 py-0.5 rounded-full text-[9px]"
                style={{ background: ruleSubTab === st.key ? "rgba(0,0,0,.2)" : "rgba(255,255,255,.06)", minWidth: "18px", textAlign: "center" }}>
                {st.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════ MANUEL KURALLAR ══════════════ */}
      {ruleSubTab === "manual" && (
        <div className="space-y-4">
          <div className="c-card p-5">
            <div className="c-section-title">+ {tr("Yeni Manuel Kural", "Neue Manuelle Regel")}</div>
            <p className="text-xs mb-4" style={{ color: "#3a3f4a" }}>
              {tr(
                "Tedarikçi adı VEYA açıklama anahtar kelimesi eşleşince AI'ye gitmeden %100 güvenle atanır.",
                "Bei Übereinstimmung von Lieferant ODER Schlüsselwort wird direkt zugewiesen (100% Konfidenz)."
              )}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="c-label">{tr("Tedarikçi adı (içerir)", "Lieferantenname (enthält)")} <span style={{ color: "#3a3f4a" }}>— {tr("opsiyonel", "optional")}</span></label>
                <input className="c-input" placeholder="z.B. Shell, Amazon, Telekom"
                  value={newRule.supplier_keyword}
                  onChange={e => setNewRule({ ...newRule, supplier_keyword: e.target.value })} />
                <p className="text-[10px] mt-1" style={{ color: "#3a3f4a" }}>
                  {tr("Bu tedarikçiden gelen tüm kalemlere uygulanır", "Gilt für alle Positionen dieses Lieferanten")}
                </p>
              </div>
              <div>
                <label className="c-label">{tr("Açıklama anahtar kelimeleri", "Beschreibungs-Schlüsselwörter")} <span style={{ color: "#3a3f4a" }}>— {tr("opsiyonel", "optional")}</span></label>
                <input className="c-input" placeholder="benzin, kraftstoff, tanken"
                  value={newRule.description_keywords}
                  onChange={e => setNewRule({ ...newRule, description_keywords: e.target.value })} />
                <p className="text-[10px] mt-1" style={{ color: "#3a3f4a" }}>
                  {tr("Virgülle ayırın — herhangi biri eşleşirse tetiklenir", "Kommagetrennt — trifft bei Übereinstimmung")}
                </p>
              </div>
              <div>
                <label className="c-label">{tr("Hesap Kodu", "Kontocode")} *</label>
                <input className="c-input font-mono" placeholder="4660"
                  value={newRule.account_code}
                  onChange={e => setNewRule({ ...newRule, account_code: e.target.value })} />
              </div>
              <div>
                <label className="c-label">{tr("Hesap Adı", "Kontobezeichnung")}</label>
                <input className="c-input" placeholder="Kfz-Kosten"
                  value={newRule.account_name}
                  onChange={e => setNewRule({ ...newRule, account_name: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <label className="c-label">{tr("Not (opsiyonel)", "Hinweis (optional)")}</label>
                <input className="c-input" placeholder={tr("Açıklama...", "Beschreibung...")}
                  value={newRule.note}
                  onChange={e => setNewRule({ ...newRule, note: e.target.value })} />
              </div>
            </div>
            <button onClick={addRule} disabled={saving} className="c-btn-primary px-5 py-2.5 text-sm rounded-md">
              {saving ? "..." : tr("+ Kural Ekle & Kaydet", "+ Regel hinzufügen")}
            </button>
          </div>

          <div className="c-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #1c1f27" }}>
              <div className="c-section-title mb-0">
                {tr(`Manuel Kurallar (${rules.filter(r => r.type === "manual").length})`,
                  `Manuelle Regeln (${rules.filter(r => r.type === "manual").length})`)}
              </div>
              <span className="text-[10px] font-semibold px-2 py-1 rounded-full"
                style={{ background: "rgba(6,182,212,.08)", color: "#06b6d4", border: "1px solid rgba(6,182,212,.15)" }}>
                {tr("Öncelik 1 — %100", "Priorität 1 — 100%")}
              </span>
            </div>

            {rules.filter(r => r?.type === "manual").length === 0 ? (
              <div className="py-10 text-center">
                <div className="font-mono text-3xl mb-3" style={{ color: "#1c1f27" }}>✎</div>
                <div className="text-sm mb-1" style={{ color: "#3a3f4a" }}>
                  {tr("Henüz manuel kural eklenmedi", "Noch keine manuellen Regeln")}
                </div>
                <div className="text-xs" style={{ color: "#1e2530" }}>
                  {tr(`Toplam ${rules.length} kural var, ${rules.filter(r => r?.type === "manual").length} manuel.`,
                    `Gesamt ${rules.length} Regeln, ${rules.filter(r => r?.type === "manual").length} manuell.`)}
                </div>
              </div>
            ) : (
              <div>
                {rules.filter(r => r?.type === "manual").map(rule => (
                  <div key={rule.id}>
                    {editingRule?.id !== rule.id ? (
                      <div className="flex items-start gap-3 px-5 py-4 transition-colors"
                        style={{ borderBottom: "1px solid #1c1f27", borderLeft: `2px solid ${rule.active ? "#06b6d4" : "#2a3040"}` }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.02)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            {rule.supplier_keyword && (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded"
                                style={{ background: "rgba(139,92,246,.1)", color: "#a78bfa", border: "1px solid rgba(139,92,246,.2)" }}>
                                👤 {rule.supplier_keyword}
                              </span>
                            )}
                            {rule.description_keywords?.map((kw, i) => (
                              <span key={i} className="text-xs font-semibold px-2 py-0.5 rounded"
                                style={{ background: "rgba(245,158,11,.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,.2)" }}>
                                🔑 {kw}
                              </span>
                            ))}
                            <span className="font-mono" style={{ color: "#3a3f4a" }}>→</span>
                            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded"
                              style={{ background: "rgba(6,182,212,.1)", color: "#06b6d4" }}>
                              {rule.account_code}
                            </span>
                            <span className="text-sm text-slate-300">{rule.account_name}</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full badge-analyzed">%100</span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px]" style={{ color: "#3a3f4a" }}>
                            {rule.note && <span>{rule.note}</span>}
                            <span className="font-mono">{tr("Tetiklendi:", "Ausgelöst:")} {rule.hit_count}×</span>
                            {rule.last_used && <span>{tr("Son:", "Zuletzt:")} {rule.last_used.substring(0, 10)}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <label className="c-toggle cursor-pointer" onClick={() => toggleRule(rule.id)}>
                            <input type="checkbox" readOnly checked={rule.active} />
                            <span className="c-toggle-track" />
                            <span className="c-toggle-thumb"
                              style={{ left: rule.active ? "19px" : "3px", background: rule.active ? "#fff" : "#3a3f4a" }} />
                          </label>
                          <button onClick={() => setEditingRule({ ...rule })}
                            className="text-xs px-2 py-1 rounded cursor-pointer border-none transition-colors"
                            style={{ background: "rgba(255,255,255,.04)", color: "#64748b" }}
                            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#06b6d4"}
                            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "#64748b"}>
                            ✎
                          </button>
                          <button onClick={() => delRule(rule.id)} disabled={saving}
                            className="text-xs px-2 py-1 rounded cursor-pointer border-none transition-colors"
                            style={{ background: "rgba(239,68,68,.06)", color: "#3a3f4a" }}
                            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"}
                            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "#3a3f4a"}>
                            ✕
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="px-5 py-4" style={{ borderBottom: "1px solid #1c1f27", background: "rgba(6,182,212,.03)" }}>
                        <div className="c-section-title mb-3">{tr("Kuralı Düzenle", "Regel bearbeiten")}</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="c-label">{tr("Tedarikçi", "Lieferant")}</label>
                            <input className="c-input" value={editingRule!.supplier_keyword || ""}
                              onChange={e => setEditingRule(r => r ? { ...r, supplier_keyword: e.target.value } : r)} />
                          </div>
                          <div>
                            <label className="c-label">{tr("Anahtar Kelimeler", "Schlüsselwörter")}</label>
                            <input className="c-input" value={(editingRule!.description_keywords || []).join(", ")}
                              onChange={e => setEditingRule(r => r ? { ...r, description_keywords: e.target.value.split(",").map(s => s.trim()).filter(Boolean) } : r)} />
                          </div>
                          <div>
                            <label className="c-label">{tr("Hesap Kodu", "Konto")}</label>
                            <input className="c-input font-mono" value={editingRule!.account_code}
                              onChange={e => setEditingRule(r => r ? { ...r, account_code: e.target.value } : r)} />
                          </div>
                          <div>
                            <label className="c-label">{tr("Hesap Adı", "Kontoname")}</label>
                            <input className="c-input" value={editingRule!.account_name}
                              onChange={e => setEditingRule(r => r ? { ...r, account_name: e.target.value } : r)} />
                          </div>
                          <div className="md:col-span-2">
                            <label className="c-label">{tr("Not", "Hinweis")}</label>
                            <input className="c-input" value={editingRule!.note || ""}
                              onChange={e => setEditingRule(r => r ? { ...r, note: e.target.value } : r)} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={saveEditingRule} disabled={saving} className="c-btn-primary px-4 py-2 text-xs rounded-md">
                            {saving ? "..." : tr("✓ Kaydet", "✓ Speichern")}
                          </button>
                          <button onClick={() => setEditingRule(null)} className="c-btn-ghost px-4 py-2 text-xs rounded-md">
                            {tr("İptal", "Abbrechen")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="c-card c-card-cyan p-4 text-xs" style={{ color: "#3a3f4a", lineHeight: "1.7" }}>
            <div className="font-semibold text-slate-300 mb-1">◈ {tr("Nasıl Çalışır?", "Wie funktioniert es?")}</div>
            <div>{tr("Fatura yüklenince önce manuel kurallar kontrol edilir. Tedarikçi adı VEYA herhangi bir anahtar kelime kalem açıklamasında geçiyorsa AI analizine gerek kalmadan %100 güvenle kod atanır.", "Beim Upload werden manuelle Regeln zuerst geprüft. Wenn Lieferantenname ODER ein Schlüsselwort in der Positionsbeschreibung vorkommt, wird der Code direkt mit 100% zugewiesen.")}</div>
            <div className="mt-2 font-mono text-[10px]" style={{ color: "#2a3040" }}>
              {tr("Örnek: Anahtar kelime='benzin' → Hesap 4660 (KFZ-Kosten)", "Bsp: Schlüsselwort='kraftstoff' → Konto 4660 (Kfz-Kosten)")}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ DATEV ÖNERİLER ══════════════ */}
      {ruleSubTab === "datev" && (
        <div className="space-y-4">
          <div className="c-card p-5">
            <div className="c-section-title">📋 {tr("DATEV SKR03 Hazır Kurallar", "DATEV SKR03 Regelvorlagen")}</div>
            <p className="text-xs mb-4" style={{ color: "#3a3f4a", lineHeight: 1.7 }}>
              {tr(
                "datev.pdf (90 sayfa) analizi sonucu oluşturulan hazır kural şablonları. Tek tıkla manuel kural olarak eklenebilir. Bu kurallar fatura yüklendiğinde AI analizinden önce çalışır.",
                "Fertige Regelvorlagen basierend auf DATEV SKR03 Analyse (90 Seiten). Per Klick als manuelle Regel hinzufügbar."
              )}
            </p>
            <div className="flex gap-2 mb-4 items-center">
              <input
                className="c-input flex-1"
                placeholder={tr("🔍 Kural ara... (ör: benzin, amazon, miete, hotel)", "🔍 Regel suchen... (z.B. benzin, amazon, miete, hotel)")}
                value={datevSearch}
                onChange={e => setDatevSearch(e.target.value)}
              />
              {(() => {
                const existingSet = new Set(rules.filter(r => r?.type === 'manual').map(r => `${r.supplier_keyword || ''}_${r.account_code}`));
                const remaining = DATEV_SUGGESTED_RULES.filter(s => !existingSet.has(`${s.supplier_keyword || ''}_${s.account_code}`));
                const addedCount = DATEV_SUGGESTED_RULES.length - remaining.length;
                return (
                  <button
                    onClick={async () => {
                      if (remaining.length === 0) return;
                      setSaving(true);
                      try {
                        const newRules: EnhancedRule[] = remaining.map(sug => ({
                          id: uid(), type: 'manual' as const,
                          supplier_keyword: sug.supplier_keyword || undefined,
                          description_keywords: sug.description_keywords,
                          account_code: sug.account_code,
                          account_name: sug.account_name,
                          confidence: 100, hit_count: 0, learn_count: 0,
                          last_used: now(), active: true,
                          note: sug.note, created_at: now(), updated_at: now(),
                        }));
                        await saveRules([...newRules, ...rules]);
                        flash(tr(`✓ ${newRules.length} kural toplu eklendi!`, `✓ ${newRules.length} Regeln hinzugefügt!`));
                      } catch (e: any) { flash(e.message, false); } finally { setSaving(false); }
                    }}
                    disabled={saving || remaining.length === 0}
                    className="text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer border-none transition-all shrink-0 whitespace-nowrap"
                    style={remaining.length === 0
                      ? { background: 'rgba(16,185,129,.1)', color: '#10b981', border: '1px solid rgba(16,185,129,.2)', cursor: 'default' }
                      : { background: 'rgba(139,92,246,.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,.3)' }}
                  >
                    {remaining.length === 0
                      ? `✓ ${tr('Tümü Eklendi', 'Alle hinzugefügt')}`
                      : `📥 ${tr('Tümünü Ekle', 'Alle hinzufügen')} (${remaining.length})`}
                    {addedCount > 0 && remaining.length > 0 && (
                      <span className="ml-1 opacity-60">({addedCount}/{DATEV_SUGGESTED_RULES.length})</span>
                    )}
                  </button>
                );
              })()}
            </div>
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {(() => {
                const q = datevSearch.toLowerCase().trim();
                const existingCodes = new Set(rules.filter(r => r?.type === 'manual').map(r => `${r.supplier_keyword || ''}_${r.account_code}`));
                const filtered = DATEV_SUGGESTED_RULES.filter(s => {
                  if (!q) return true;
                  return (s.supplier_keyword || '').toLowerCase().includes(q) ||
                    s.description_keywords.some(k => k.toLowerCase().includes(q)) ||
                    s.account_code.includes(q) ||
                    s.account_name.toLowerCase().includes(q) ||
                    s.category.toLowerCase().includes(q) ||
                    s.note.toLowerCase().includes(q);
                });
                const grouped = new Map<string, typeof filtered>();
                filtered.forEach(s => {
                  const cat = s.category;
                  if (!grouped.has(cat)) grouped.set(cat, []);
                  grouped.get(cat)!.push(s);
                });

                return Array.from(grouped.entries()).map(([cat, items]) => (
                  <div key={cat} className="mb-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider px-1 py-2" style={{ color: '#64748b' }}>
                      {cat} ({items.length})
                    </div>
                    {items.map((sug, si) => {
                      const key = `${sug.supplier_keyword || ''}_${sug.account_code}`;
                      const alreadyAdded = existingCodes.has(key);
                      return (
                        <div key={si} className="flex items-center gap-3 px-4 py-3 transition-colors rounded-lg mb-1"
                          style={{ background: 'rgba(255,255,255,.01)', border: '1px solid rgba(255,255,255,.04)' }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(6,182,212,.04)'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.01)'}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              {sug.supplier_keyword && (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded"
                                  style={{ background: 'rgba(139,92,246,.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,.2)' }}>
                                  👤 {sug.supplier_keyword}
                                </span>
                              )}
                              {sug.description_keywords.slice(0, 3).map((kw, ki) => (
                                <span key={ki} className="text-xs font-semibold px-2 py-0.5 rounded"
                                  style={{ background: 'rgba(245,158,11,.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,.2)' }}>
                                  🔑 {kw}
                                </span>
                              ))}
                              {sug.description_keywords.length > 3 && <span style={{ color: '#475569', fontSize: '10px' }}>+{sug.description_keywords.length - 3}</span>}
                              <span className="font-mono" style={{ color: '#3a3f4a' }}>→</span>
                              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded"
                                style={{ background: 'rgba(6,182,212,.1)', color: '#06b6d4' }}>
                                {sug.account_code}
                              </span>
                              <span className="text-sm text-slate-300">{sug.account_name}</span>
                            </div>
                            <div className="text-[10px]" style={{ color: '#475569' }}>{sug.note}</div>
                          </div>
                          <button
                            onClick={async () => {
                              if (alreadyAdded) return;
                              setSaving(true);
                              try {
                                const rule: EnhancedRule = {
                                  id: uid(), type: 'manual',
                                  supplier_keyword: sug.supplier_keyword || undefined,
                                  description_keywords: sug.description_keywords,
                                  account_code: sug.account_code,
                                  account_name: sug.account_name,
                                  confidence: 100, hit_count: 0, learn_count: 0,
                                  last_used: now(), active: true,
                                  note: sug.note, created_at: now(), updated_at: now(),
                                };
                                await saveRules([rule, ...rules]);
                                flash(tr(`✓ ${sug.account_code} kuralı eklendi`, `✓ Regel ${sug.account_code} hinzugefügt`));
                              } catch (e: any) { flash(e.message, false); } finally { setSaving(false); }
                            }}
                            disabled={saving || alreadyAdded}
                            className="text-xs font-semibold px-3 py-1.5 rounded-md cursor-pointer border-none transition-all shrink-0"
                            style={alreadyAdded
                              ? { background: 'rgba(16,185,129,.1)', color: '#10b981', border: '1px solid rgba(16,185,129,.2)', cursor: 'default' }
                              : { background: 'rgba(6,182,212,.1)', color: '#06b6d4', border: '1px solid rgba(6,182,212,.2)' }}
                            onMouseEnter={e => !alreadyAdded && ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(6,182,212,.2)')}
                            onMouseLeave={e => !alreadyAdded && ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(6,182,212,.1)')}>
                            {alreadyAdded ? '✓ ' + tr('Eklendi', 'Hinzugefügt') : '+ ' + tr('Ekle', 'Hinzufügen')}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>
          </div>
          <div className="c-card c-card-cyan p-4 text-xs" style={{ color: '#3a3f4a', lineHeight: '1.7' }}>
            <div className="font-semibold text-slate-300 mb-1">📖 {tr('DATEV SKR03 Kural Motoru Mantığı', 'DATEV SKR03 Regelmotor-Logik')}</div>
            <div>{tr(
              'Bu kurallar DATEV SKR03 hesap planının 90 sayfalık resmi dokümanından (datev.pdf) çıkarılmıştır. Fatura yüklendiğinde: 1) Önce manuel kurallar kontrol edilir 2) Eşleşme yoksa AI analizi yapılır. Manuel kurallar %100 güvenle çalışır ve AI\'den önce gelir.',
              'Diese Regeln basieren auf dem offiziellen DATEV SKR03 Kontenrahmen (90 Seiten datev.pdf). Bei Rechnungsupload: 1) Manuelle Regeln werden zuerst geprüft 2) Ohne Treffer erfolgt KI-Analyse.'
            )}</div>
          </div>
        </div>
      )}

      {/* ══════════════ ÖĞRENİLEN KURALLAR ══════════════ */}
      {ruleSubTab === "learned" && (
        <div className="space-y-4">
          <div className="c-card p-5">
            <div className="c-section-title">{tr("Geçmişten Öğren", "Aus Verlauf lernen")}</div>
            <p className="text-xs mb-4" style={{ color: "#3a3f4a" }}>
              {tr(
                "Şimdiye kadar yüklenen faturalar analiz edilerek tekrar eden tedarikçi → hesap kodu eşleşmeleri otomatik tespit edilir. Min. 3 farklı faturada görülmesi gerekir.",
                "Bisherige Rechnungen werden analysiert, um wiederkehrende Lieferant→Kontozuordnungen zu erkennen. Mindestens 3 verschiedene Rechnungen erforderlich."
              )}
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={runLearnFromHistory} disabled={learnLoading || saving}
                className="c-btn-primary flex items-center gap-2 px-5 py-2.5 text-sm rounded-md">
                {learnLoading ? (
                  <>
                    <span className="w-3 h-3 border-2 rounded-full animate-spin inline-block"
                      style={{ borderColor: "rgba(255,255,255,.3)", borderTopColor: "#fff" }} />
                    {tr("Analiz ediliyor...", "Analysiere...")}
                  </>
                ) : (
                  <>◈ {tr(`Geçmişi Analiz Et (${invoices.length} fatura)`, `Verlauf analysieren (${invoices.length} Rechnungen)`)}</>
                )}
              </button>
              <div className="text-xs" style={{ color: "#3a3f4a" }}>
                {invoiceItems.length} {tr("kalem", "Positionen")} · {tr("Eşik: 3 fatura", "Schwellenwert: 3 Rechnungen")}
              </div>
            </div>
          </div>

          {suggestions.length > 0 && (
            <div className="c-card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #1c1f27" }}>
                <div>
                  <div className="c-section-title mb-0.5">
                    {tr(`${suggestions.length} Yeni Kural Önerisi Bulundu`, `${suggestions.length} neue Regelvorschläge gefunden`)}
                  </div>
                  <div className="text-[10px]" style={{ color: "#3a3f4a" }}>
                    {tr("Tümünü kabul edebilir veya tek tek inceleyebilirsiniz", "Sie können alle akzeptieren oder einzeln prüfen")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={acceptAllSuggestions} disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-md cursor-pointer border-none transition-all"
                    style={{ background: "rgba(16,185,129,.15)", color: "#10b981", border: "1px solid rgba(16,185,129,.25)" }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(16,185,129,.28)"}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(16,185,129,.15)"}>
                    {saving ? "..." : tr(`✓ Tümünü Ekle (${suggestions.length})`, `✓ Alle hinzufügen (${suggestions.length})`)}
                  </button>
                  <button onClick={() => setSuggestions([])}
                    className="px-3 py-2 text-xs rounded-md cursor-pointer border-none transition-colors"
                    style={{ background: "rgba(239,68,68,.06)", color: "#3a3f4a" }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "#3a3f4a"}>
                    {tr("Tümünü Reddet", "Alle ablehnen")}
                  </button>
                </div>
              </div>
              {suggestions.map(sug => (
                <div key={sug.rule.id} className="px-5 py-4 transition-colors"
                  style={{ borderBottom: "1px solid #1c1f27", borderLeft: `2px solid #f59e0b` }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(245,158,11,.03)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        {sug.rule.supplier_keyword && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded"
                            style={{ background: "rgba(139,92,246,.1)", color: "#a78bfa", border: "1px solid rgba(139,92,246,.2)" }}>
                            👤 {sug.rule.supplier_keyword}
                          </span>
                        )}
                        {sug.rule.description_keywords?.map((kw, i) => (
                          <span key={i} className="text-xs font-semibold px-2 py-0.5 rounded"
                            style={{ background: "rgba(245,158,11,.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,.2)" }}>
                            🔑 {kw}
                          </span>
                        ))}
                        <span className="font-mono text-xs" style={{ color: "#3a3f4a" }}>→</span>
                        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded"
                          style={{ background: "rgba(6,182,212,.1)", color: "#06b6d4" }}>
                          {sug.rule.account_code}
                        </span>
                        <span className="text-sm text-slate-300">{sug.rule.account_name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px]" style={{ color: "#3a3f4a" }}>
                        <span className={`font-bold px-1.5 py-0.5 rounded-full ${sug.rule.confidence >= 80 ? "badge-analyzed" : "badge-pending"}`}>
                          %{sug.rule.confidence} {tr("güven", "Konfidenz")}
                        </span>
                        <span>{sug.rule.learn_count} {tr("farklı faturadan", "verschiedene Rechnungen")}</span>
                        {sug.descriptionExamples.length > 0 && (
                          <span className="truncate max-w-[200px]" title={sug.descriptionExamples.join(", ")}>
                            {tr("Örn:", "Bsp:")} {sug.descriptionExamples[0].substring(0, 40)}...
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => acceptSuggestion(sug)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer border-none transition-all"
                        style={{ background: "rgba(16,185,129,.12)", color: "#10b981", border: "1px solid rgba(16,185,129,.2)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(16,185,129,.22)"}
                        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(16,185,129,.12)"}>
                        ✓ {tr("Ekle", "Hinzufügen")}
                      </button>
                      <button onClick={() => dismissSuggestion(sug.rule.id)}
                        className="px-2 py-1.5 text-xs cursor-pointer border-none transition-colors bg-transparent"
                        style={{ color: "#3a3f4a" }}
                        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"}
                        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "#3a3f4a"}>
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="c-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #1c1f27" }}>
              <div className="c-section-title mb-0">
                {tr(`Aktif Öğrenilen Kurallar (${rules.filter(r => r && r.type === "learned").length})`,
                  `Aktive gelernte Regeln (${rules.filter(r => r && r.type === "learned").length})`)}
              </div>
              <span className="text-[10px] font-semibold px-2 py-1 rounded-full"
                style={{ background: "rgba(16,185,129,.08)", color: "#10b981", border: "1px solid rgba(16,185,129,.15)" }}>
                {tr("Öncelik 2", "Priorität 2")}
              </span>
            </div>
            {rules.filter(r => r?.type === "learned").length === 0 ? (
              <div className="py-10 text-center">
                <div className="font-mono text-3xl mb-3" style={{ color: "#1c1f27" }}>◈</div>
                <div className="text-sm mb-1" style={{ color: "#3a3f4a" }}>
                  {tr("Henüz öğrenilen kural yok — yukarıdan analiz başlatın", "Noch keine gelernten Regeln — Analyse starten")}
                </div>
                <div className="text-xs" style={{ color: "#1e2530" }}>
                  {tr(`Toplam ${rules.length} kural mevcut.`, `Gesamt ${rules.length} Regeln vorhanden.`)}
                </div>
              </div>
            ) : (
              <div>
                {rules.filter(r => r?.type === "learned")
                  .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
                  .map(rule => (
                    <div key={rule.id} className="flex items-start gap-3 px-5 py-4 transition-colors"
                      style={{ borderBottom: "1px solid #1c1f27", borderLeft: `2px solid ${rule.active ? "#10b981" : "#2a3040"}` }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.02)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {rule.supplier_keyword && (
                            <span className="text-xs px-2 py-0.5 rounded"
                              style={{ background: "rgba(139,92,246,.1)", color: "#a78bfa", border: "1px solid rgba(139,92,246,.2)" }}>
                              👤 {rule.supplier_keyword}
                            </span>
                          )}
                          {rule.description_keywords?.map((kw, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded"
                              style={{ background: "rgba(245,158,11,.08)", color: "#f59e0b", border: "1px solid rgba(245,158,11,.15)" }}>
                              🔑 {kw}
                            </span>
                          ))}
                          <span className="font-mono text-xs" style={{ color: "#3a3f4a" }}>→</span>
                          <span className="font-mono font-bold text-xs px-2 py-0.5 rounded"
                            style={{ background: "rgba(6,182,212,.1)", color: "#06b6d4" }}>
                            {rule.account_code}
                          </span>
                          <span className="text-sm text-slate-300">{rule.account_name}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${rule.confidence >= 80 ? "badge-analyzed" : "badge-pending"}`}>
                            %{rule.confidence}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px]" style={{ color: "#3a3f4a" }}>
                          <span>{rule.learn_count} {tr("faturadan öğrenildi", "Rechnungen gelernt")}</span>
                          <span>{tr("Tetiklendi:", "Ausgelöst:")} {rule.hit_count}×</span>
                          {rule.note && <span>{rule.note}</span>}
                          {rule.last_used && <span>{tr("Son:", "Zuletzt:")} {rule.last_used.substring(0, 10)}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <label className="c-toggle cursor-pointer" onClick={() => toggleRule(rule.id)}>
                          <input type="checkbox" readOnly checked={rule.active} />
                          <span className="c-toggle-track" />
                          <span className="c-toggle-thumb"
                            style={{ left: rule.active ? "19px" : "3px", background: rule.active ? "#fff" : "#3a3f4a" }} />
                        </label>
                        <button onClick={() => delRule(rule.id)} disabled={saving}
                          className="text-xs px-2 py-1.5 rounded cursor-pointer border-none transition-colors"
                          style={{ background: "rgba(239,68,68,.06)", color: "#3a3f4a" }}
                          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"}
                          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "#3a3f4a"}>
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="c-card c-card-green p-4 text-xs" style={{ color: "#3a3f4a", lineHeight: "1.7" }}>
            <div className="font-semibold text-slate-300 mb-1">◈ {tr("Öğrenme Mantığı", "Lernlogik")}</div>
            <div>{tr("Manuel kod değiştirince sistem anında öğrenir. 3+ farklı faturada aynı tedarikçi veya açıklama tokeni görülürse öneri oluşturulur. Öğrenilen kurallar aktif etmeden uygulanmaz.", "Bei manueller Korrektur lernt das System sofort. Wenn Lieferant oder Beschreibungstoken in 3+ Rechnungen erscheint, wird ein Vorschlag erstellt.")}</div>
          </div>
        </div>
      )}

      {/* ══════════════ İSTATİSTİKLER ══════════════ */}
      {ruleSubTab === "stats" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: tr("Toplam Kural", "Gesamt Regeln"), val: ruleStats.totalRules, color: "#06b6d4", cls: "c-card-cyan" },
              { label: tr("Manuel", "Manuell"), val: ruleStats.manualRules, color: "#8b5cf6", cls: "" },
              { label: tr("Öğrenilen", "Gelernt"), val: ruleStats.learnedRules, color: "#10b981", cls: "c-card-green" },
              { label: tr("Ort. Güven", "Ø Konfidenz"), val: `%${ruleStats.avgConfidence}`, color: "#f59e0b", cls: "" },
            ].map((c, i) => (
              <div key={i} className={`c-card ${c.cls} p-4`}>
                <div className="c-section-title mb-1">{c.label}</div>
                <div className="font-syne font-bold text-xl" style={{ color: c.color }}>{c.val}</div>
              </div>
            ))}
          </div>

          {ruleStats.topAccountCodes.length > 0 && (
            <div className="c-card overflow-hidden">
              <div className="px-5 py-4" style={{ borderBottom: "1px solid #1c1f27" }}>
                <div className="c-section-title mb-0">{tr("En Çok Kullanılan Hesap Kodları", "Meistverwendete Konten")}</div>
              </div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {["#", tr("Hesap Kodu", "Konto"), tr("Hesap Adı", "Kontoname"),
                      tr("Kural Sayısı", "Anzahl Regeln"), tr("Toplam Tetiklenme", "Gesamt ausgelöst")].map((h, i) => (
                        <th key={i} className="px-4 py-3 text-left whitespace-nowrap"
                          style={{ background: "#0d0f15", color: "#3a3f4a", borderBottom: "1px solid #1c1f27", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em" }}>
                          {h}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {ruleStats.topAccountCodes.map((item, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #1c1f27" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.02)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                      <td className="px-4 py-3 font-mono" style={{ color: "#3a3f4a" }}>{i + 1}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded"
                          style={{ background: "rgba(6,182,212,.1)", color: "#06b6d4" }}>{item.code}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{item.name}</td>
                      <td className="px-4 py-3 font-mono text-center text-slate-400">{item.ruleCount}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 rounded-full h-1.5" style={{ background: "#1c1f27", maxWidth: "80px" }}>
                            <div className="h-1.5 rounded-full" style={{
                              width: ruleStats.topAccountCodes[0].hitCount > 0
                                ? `${(item.hitCount / ruleStats.topAccountCodes[0].hitCount * 100)}%` : "0%",
                              background: "#06b6d4"
                            }} />
                          </div>
                          <span className="font-mono text-slate-300">{item.hitCount}×</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="c-card overflow-hidden">
            <div className="px-5 py-4" style={{ borderBottom: "1px solid #1c1f27" }}>
              <div className="c-section-title mb-0">{tr("Tüm Aktif Kurallar", "Alle aktiven Regeln")}</div>
            </div>
            {rules.filter(r => r.active).length === 0 ? (
              <div className="py-8 text-center text-xs" style={{ color: "#3a3f4a" }}>
                {tr("Aktif kural yok", "Keine aktiven Regeln")}
              </div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {[tr("Tip", "Typ"), tr("Kural", "Regel"), tr("Kod", "Konto"),
                    tr("Güven", "Konf."), tr("Tetiklendi", "Ausgelöst"), tr("Son Kullanım", "Letzter Einsatz")].map((h, i) => (
                      <th key={i} className="px-4 py-2 text-left"
                        style={{ background: "#0d0f15", color: "#3a3f4a", borderBottom: "1px solid #1c1f27", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rules.filter(r => r.active).map((rule) => (
                    <tr key={rule.id} style={{ borderBottom: "1px solid #1c1f27" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.02)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                      <td className="px-4 py-2.5">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${rule.type === "manual" ? "badge-check" : "badge-analyzed"}`}>
                          {rule.type === "manual" ? tr("Manuel", "Manuell") : tr("Öğrenilen", "Gelernt")}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 max-w-[180px]">
                        <div className="flex flex-wrap gap-1">
                          {rule.supplier_keyword && <span style={{ color: "#a78bfa" }}>👤 {rule.supplier_keyword}</span>}
                          {rule.description_keywords?.slice(0, 2).map((kw, ki) => (
                            <span key={ki} style={{ color: "#f59e0b" }}>🔑 {kw}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs" style={{ color: "#06b6d4" }}>{rule.account_code}</span>
                      </td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: rule.confidence >= 80 ? "#10b981" : "#f59e0b" }}>
                        %{rule.confidence}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-400">{rule.hit_count}×</td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: "#3a3f4a", fontSize: "10px" }}>
                        {rule.last_used ? rule.last_used.substring(0, 10) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
