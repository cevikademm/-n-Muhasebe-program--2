// ──────────────────────────────────────────────────────────────────
// Müşteri Bulma — Kampanyalar (konular) + çok dilli taslak şablonlar
// ──────────────────────────────────────────────────────────────────
// Her kampanya bir "konu"dur (ör. AI Ekspertiz Platformu). Sağ panelde
// ve Toplu Mail'de seçilir; seçilen konuya göre taslak metin ve maile
// eklenecek tanıtım PDF'i otomatik değişir.
//
// Placeholder'lar: {{isim}} (işletme adı), {{sehir}}, {{kategori}}
// ──────────────────────────────────────────────────────────────────

// Tanıtım PDF'leri public/sunum altında; fikoai.de kökünden servis edilir.
export const SITE = "https://fikoai.de";

export interface KampanyaEk { name: string; url: string; }
export interface KampanyaSablon { subject: string; body: string; }
export interface Kampanya {
  code: string;
  renk: string;
  label: { tr: string; de: string };
  aciklama: { tr: string; de: string };
  // dil kodu → şablon
  templates: Record<string, KampanyaSablon>;
  // dil kodu → ek dosya. "*" = varsayılan (dile özel yoksa bu kullanılır).
  ek?: Record<string, KampanyaEk>;
}

// Taslak dilleri (bayrak + etiket) — guessMsgLang çıktısıyla aynı kodlar
export const LANGS: { code: string; label: string; flag: string }[] = [
  { code: "tr", label: "Türkçe", flag: "🇹🇷" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "nl", label: "Nederlands", flag: "🇳🇱" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "es", label: "Español", flag: "🇪🇸" },
];

export const KAMPANYALAR: Kampanya[] = [
  // ── 1) AI Ekspertiz / KI-Gutachten-Plattform (PDF ekli) ─────────
  {
    code: "ai-ekspertiz",
    renk: "#f43f5e",
    label: { tr: "AI Ekspertiz Platformu", de: "KI-Gutachten-Plattform" },
    aciklama: {
      tr: "Kfz-Sachverständige için yapay zeka destekli ekspertiz platformu",
      de: "KI-gestützte Gutachten-Plattform für Kfz-Sachverständige",
    },
    ek: {
      "*": { name: "KI-Gutachten-Plattform.pdf", url: `${SITE}/sunum/ki-gutachten-plattform-de.pdf` },
      tr: { name: "AI-Ekspertiz-Platformu.pdf", url: `${SITE}/sunum/ai-ekspertiz-platformu-tr.pdf` },
    },
    templates: {
      de: {
        subject: "Die neue Generation des Kfz-Gutachtens – für {{isim}}",
        body:
          "Hallo Team von {{isim}},\n\n" +
          "darf ich Ihnen kurz die neue Generation des Kfz-Gutachtens vorstellen? Unsere KI-gestützte Plattform bildet den gesamten Ablauf in einem System ab – vom ersten Foto bis zur letzten Rechnung:\n\n" +
          "• 120-Punkte-KI-Schadenanalyse & automatischer Gutachten-Entwurf\n" +
          "• Kennzeichen- und Fahrzeugschein-OCR – Schluss mit der manuellen Eingabe\n" +
          "• Kunden-, Anwalts-, Versicherungs- und Karosserie-Portal in einer Datenschicht\n" +
          "• 10 Sprachen (inkl. RTL), PWA, WhatsApp-Automation und TÜV/HU-Erinnerung\n\n" +
          "Das Ergebnis: schnellere Berichte, geringere Software-Kosten und mehr Kapazität – passend zum neuen VDI-MT 5900-Standard.\n\n" +
          "Gerne zeige ich Ihnen alles in einer kurzen, unverbindlichen Live-Demo. Eine kurze Antwort auf diese E-Mail genügt – wir melden uns innerhalb eines Werktags.\n\n" +
          "Beste Grüße,\nIhr fikoai-Team",
      },
      tr: {
        subject: "Oto ekspertizin yeni nesli – {{isim}} için",
        body:
          "Merhaba {{isim}} ekibi,\n\n" +
          "Oto ekspertizin yeni neslini kısaca tanıtmak isteriz. Yapay zeka destekli platformumuz tüm süreci tek sistemde toplar – ilk fotoğraftan son faturaya:\n\n" +
          "• 120 noktalı AI hasar analizi ve otomatik ekspertiz taslağı\n" +
          "• Plaka ve ruhsat (Fahrzeugschein) OCR – manuel giriş bitiyor\n" +
          "• Müşteri, avukat, sigorta ve kaporta paneli tek veri katmanında\n" +
          "• 10 dil (RTL dahil), PWA, WhatsApp otomasyonu ve TÜV/HU hatırlatma\n\n" +
          "Sonuç: daha hızlı rapor, daha düşük yazılım maliyeti ve daha yüksek kapasite – yeni VDI-MT 5900 standardına uyumlu.\n\n" +
          "Dilerseniz kısa, bağlayıcı olmayan bir canlı demoda her şeyi gösterelim. Bu e-postaya kısa bir yanıt yeterli – bir iş günü içinde dönüş yapıyoruz.\n\n" +
          "Saygılarımızla,\nfikoai ekibi",
      },
      en: {
        subject: "The next generation of car appraisals – for {{isim}}",
        body:
          "Hello {{isim}} team,\n\n" +
          "I'd like to briefly introduce the next generation of the car appraisal (Kfz-Gutachten). Our AI-powered platform covers the entire workflow in one system – from the first photo to the final invoice:\n\n" +
          "• 120-point AI damage analysis & automatic appraisal draft\n" +
          "• Licence-plate and vehicle-registration OCR – no more manual entry\n" +
          "• Customer, lawyer, insurance and body-shop portals on one data layer\n" +
          "• 10 languages (incl. RTL), PWA, WhatsApp automation and TÜV/HU reminders\n\n" +
          "The result: faster reports, lower software costs and more capacity – aligned with the new VDI-MT 5900 standard.\n\n" +
          "I'd be glad to show you everything in a short, no-obligation live demo. Just reply to this email and we'll get back to you within one business day.\n\n" +
          "Best regards,\nThe fikoai team",
      },
    },
  },

  // ── 2) fikoai Muhasebe (genel — ek yok) ─────────────────────────
  {
    code: "fikoai-muhasebe",
    renk: "#8b5cf6",
    label: { tr: "fikoai Muhasebe", de: "fikoai Buchhaltung" },
    aciklama: {
      tr: "Genel muhasebe & dijitalleşme tanıtımı",
      de: "Allgemeine Buchhaltung & Digitalisierung",
    },
    templates: {
      tr: {
        subject: "{{isim}} için kısa bir tanışma",
        body: "Merhaba {{isim}} ekibi,\n\nBen fikoai'den yazıyorum. İşletmenizin muhasebe ve evrak süreçlerini dijitalleştirip zamandan tasarruf etmenizi sağlayan çözümlerimizi kısaca tanıtmak isterim.\n\nSize uygun bir zamanda 10 dakikalık kısa bir görüşme yapabilir miyiz?\n\nSaygılarımızla,\nfikoai ekibi",
      },
      de: {
        subject: "Kurze Vorstellung für {{isim}}",
        body: "Hallo Team von {{isim}},\n\nich melde mich von fikoai. Wir helfen Unternehmen dabei, ihre Buchhaltung und Verwaltung zu digitalisieren und dadurch Zeit zu sparen.\n\nHätten Sie Interesse an einem kurzen Gespräch von 10 Minuten?\n\nBeste Grüße,\nIhr fikoai-Team",
      },
      en: {
        subject: "A quick hello to {{isim}}",
        body: "Hello {{isim}} team,\n\nI'm reaching out from fikoai. We help businesses digitalise their accounting and paperwork so they can save time.\n\nWould you be open to a short 10-minute call at a time that suits you?\n\nBest regards,\nThe fikoai team",
      },
      fr: {
        subject: "Une brève présentation pour {{isim}}",
        body: "Bonjour à l'équipe de {{isim}},\n\nJe vous contacte de la part de fikoai. Nous aidons les entreprises à numériser leur comptabilité et leurs démarches administratives afin de gagner du temps.\n\nSeriez-vous disponible pour un court échange de 10 minutes ?\n\nCordialement,\nL'équipe fikoai",
      },
      nl: {
        subject: "Een korte kennismaking voor {{isim}}",
        body: "Hallo team van {{isim}},\n\nIk neem contact op namens fikoai. Wij helpen bedrijven hun boekhouding en administratie te digitaliseren en zo tijd te besparen.\n\nZou u openstaan voor een kort gesprek van 10 minuten?\n\nMet vriendelijke groet,\nHet fikoai-team",
      },
      it: {
        subject: "Una breve presentazione per {{isim}}",
        body: "Salve team di {{isim}},\n\nvi scrivo da parte di fikoai. Aiutiamo le aziende a digitalizzare la contabilità e le pratiche amministrative per farvi risparmiare tempo.\n\nAvreste piacere di fare una breve chiamata di 10 minuti?\n\nCordiali saluti,\nIl team fikoai",
      },
      es: {
        subject: "Una breve presentación para {{isim}}",
        body: "Hola equipo de {{isim}},\n\nles escribo de parte de fikoai. Ayudamos a las empresas a digitalizar su contabilidad y su gestión administrativa para ahorrar tiempo.\n\n¿Tendrían disponibilidad para una breve llamada de 10 minutos?\n\nUn saludo,\nEl equipo fikoai",
      },
    },
  },

  // ── 3) Gastronomi — QR menü & sipariş (Restoran, kafe, imbiss) ───
  {
    code: "gastronomi",
    renk: "#f59e0b",
    label: { tr: "QR Menü & Sipariş", de: "QR-Menü & Bestellung" },
    aciklama: {
      tr: "Restoran & kafeler için dijital menü ve sipariş sistemi",
      de: "Digitales Menü & Bestellsystem für Restaurants & Cafés",
    },
    templates: {
      de: {
        subject: "Digitale Speisekarte & QR-Bestellung für {{isim}}",
        body:
          "Hallo Team von {{isim}},\n\n" +
          "darf ich kurz zeigen, wie {{isim}} mit einer digitalen Speisekarte Zeit und Druckkosten spart? Für Restaurants und Cafés richten wir alles aus einer Hand ein:\n\n" +
          "• QR-Speisekarte – in Sekunden aktualisiert, kein Nachdruck bei Preisänderungen\n" +
          "• Mehrsprachiges Menü mit Fotos – für internationale Gäste\n" +
          "• Bestell- & Tischsystem direkt über den QR-Code\n" +
          "• Moderne Website, die Ihr Lokal zeigt, wie es ist\n\n" +
          "Gerne in einer kurzen, unverbindlichen Demo. Eine kurze Antwort auf diese E-Mail genügt – wir melden uns innerhalb eines Werktags.\n\n" +
          "Beste Grüße,\nIhr fikoai-Team",
      },
      tr: {
        subject: "{{isim}} için dijital menü & QR sipariş",
        body:
          "Merhaba {{isim}} ekibi,\n\n" +
          "Dijital menüyle {{isim}}'in nasıl zamandan ve baskı maliyetinden tasarruf edebileceğini kısaca gösterebilir miyiz? Restoran ve kafeler için her şeyi tek elden kuruyoruz:\n\n" +
          "• QR menü – fiyat değişiminde saniyeler içinde güncellenir, yeniden baskı yok\n" +
          "• Fotoğraflı & çok dilli menü – yabancı misafirler için\n" +
          "• QR üzerinden sipariş & masa sistemi\n" +
          "• İşletmenizi olduğu gibi anlatan modern web sitesi\n\n" +
          "Dilerseniz kısa, bağlayıcı olmayan bir demoda gösterelim. Kısa bir yanıt yeterli – bir iş günü içinde dönüş yaparız.\n\n" +
          "Saygılarımızla,\nfikoai ekibi",
      },
      en: {
        subject: "Digital menu & QR ordering for {{isim}}",
        body:
          "Hello {{isim}} team,\n\n" +
          "may I quickly show how {{isim}} can save time and printing costs with a digital menu? For restaurants and cafés we set everything up from one source:\n\n" +
          "• QR menu – updated in seconds, no reprints when prices change\n" +
          "• Multilingual menu with photos – for international guests\n" +
          "• Ordering & table system straight from the QR code\n" +
          "• A modern website that shows your place as it is\n\n" +
          "I'd be glad to show you in a short, no-obligation demo. Just reply and we'll get back within one business day.\n\n" +
          "Best regards,\nThe fikoai team",
      },
    },
  },

  // ── 4) Web sitesi & dijital vitrin (her sektör) ─────────────────
  {
    code: "web-vitrin",
    renk: "#06b6d4",
    label: { tr: "Web Sitesi & Vitrin", de: "Website & Präsenz" },
    aciklama: {
      tr: "Modern web sitesi, SEO ve dijital vitrin",
      de: "Moderne Website, SEO & digitale Präsenz",
    },
    templates: {
      de: {
        subject: "Eine Website, die {{isim}} zeigt, wie es ist",
        body:
          "Hallo Team von {{isim}},\n\n" +
          "viele Kunden schauen heute zuerst online – und entscheiden in Sekunden. Für {{isim}} bauen wir eine moderne, schnelle Website, die genau das Richtige vermittelt:\n\n" +
          "• Individuelles Design, mobil-optimiert und blitzschnell\n" +
          "• Mehrsprachig (Deutsch & Türkisch) – für Ihre Zielgruppe\n" +
          "• Starke Sichtbarkeit bei Google (SEO)\n" +
          "• Klare Botschaft, mehr Anfragen\n\n" +
          "Gerne zeige ich Ihnen Beispiele in einem kurzen, unverbindlichen Gespräch. Eine kurze Antwort genügt.\n\n" +
          "Beste Grüße,\nIhr fikoai-Team",
      },
      tr: {
        subject: "{{isim}}'i olduğu gibi anlatan bir web sitesi",
        body:
          "Merhaba {{isim}} ekibi,\n\n" +
          "Bugün müşteriler önce internete bakıyor ve saniyeler içinde karar veriyor. {{isim}} için doğru mesajı veren, modern ve hızlı bir web sitesi kuruyoruz:\n\n" +
          "• Size özel tasarım, mobil uyumlu ve çok hızlı\n" +
          "• Çok dilli (Almanca & Türkçe) – hedef kitleniz için\n" +
          "• Google'da güçlü görünürlük (SEO)\n" +
          "• Net mesaj, daha çok talep\n\n" +
          "Dilerseniz kısa ve bağlayıcı olmayan bir görüşmede örnekleri gösterelim. Kısa bir yanıt yeterli.\n\n" +
          "Saygılarımızla,\nfikoai ekibi",
      },
      en: {
        subject: "A website that shows {{isim}} as it is",
        body:
          "Hello {{isim}} team,\n\n" +
          "today customers look online first – and decide in seconds. We build a modern, fast website for {{isim}} that gets the message across:\n\n" +
          "• Custom design, mobile-optimised and lightning-fast\n" +
          "• Multilingual (German & Turkish) – for your audience\n" +
          "• Strong visibility on Google (SEO)\n" +
          "• Clear message, more enquiries\n\n" +
          "I'd be glad to show examples in a short, no-obligation call. A brief reply is enough.\n\n" +
          "Best regards,\nThe fikoai team",
      },
    },
  },

  // ── 5) Online randevu (Kuaför, güzellik, sağlık, danışmanlık) ────
  {
    code: "randevu",
    renk: "#10b981",
    label: { tr: "Online Randevu", de: "Online-Termine" },
    aciklama: {
      tr: "Kuaför, güzellik, sağlık & danışmanlık için randevu sistemi",
      de: "Terminsystem für Friseur, Beauty, Praxis & Beratung",
    },
    templates: {
      de: {
        subject: "Weniger Telefon, volle Termine – für {{isim}}",
        body:
          "Hallo Team von {{isim}},\n\n" +
          "ständig klingelt das Telefon für Terminabsprachen? Für {{isim}} richten wir eine Online-Terminbuchung ein, die Ihnen den Rücken freihält:\n\n" +
          "• 24/7 Online-Buchung – Kunden buchen selbst, auch nach Feierabend\n" +
          "• Automatische Erinnerungen – weniger No-Shows\n" +
          "• Moderne Website mit direkter Terminbuchung\n" +
          "• Neukundengewinnung über Google & Social Media\n\n" +
          "Gerne in einer kurzen, unverbindlichen Demo. Eine kurze Antwort genügt – wir melden uns innerhalb eines Werktags.\n\n" +
          "Beste Grüße,\nIhr fikoai-Team",
      },
      tr: {
        subject: "Daha az telefon, dolu randevular – {{isim}} için",
        body:
          "Merhaba {{isim}} ekibi,\n\n" +
          "Randevu için telefon sürekli çalıyor mu? {{isim}} için sizi bu yükten kurtaran bir online randevu sistemi kuruyoruz:\n\n" +
          "• 7/24 online randevu – müşteriler mesai dışında bile kendisi alır\n" +
          "• Otomatik hatırlatmalar – gelmeyen müşteri azalır\n" +
          "• Randevu alınabilen modern web sitesi\n" +
          "• Google & sosyal medyadan yeni müşteri kazanımı\n\n" +
          "Dilerseniz kısa, bağlayıcı olmayan bir demoda gösterelim. Kısa bir yanıt yeterli – bir iş günü içinde döneriz.\n\n" +
          "Saygılarımızla,\nfikoai ekibi",
      },
      en: {
        subject: "Fewer calls, full calendar – for {{isim}}",
        body:
          "Hello {{isim}} team,\n\n" +
          "is the phone always ringing for appointments? For {{isim}} we set up online booking that takes the load off:\n\n" +
          "• 24/7 online booking – clients book themselves, even after hours\n" +
          "• Automatic reminders – fewer no-shows\n" +
          "• Modern website with direct booking\n" +
          "• New-customer acquisition via Google & social media\n\n" +
          "Happy to show you in a short, no-obligation demo. A brief reply is enough.\n\n" +
          "Best regards,\nThe fikoai team",
      },
    },
  },

  // ── 6) Personel & vardiya yönetimi (çok personelli/şubeli) ──────
  {
    code: "isletme-yonetim",
    renk: "#6366f1",
    label: { tr: "Personel & Vardiya", de: "Personal & Schicht" },
    aciklama: {
      tr: "Çok personelli / şubeli işletmeler için yönetim sistemi",
      de: "Verwaltung für Betriebe mit mehreren Mitarbeitern/Filialen",
    },
    templates: {
      de: {
        subject: "Schichtplan, Zeiterfassung & Aufgaben – für {{isim}}",
        body:
          "Hallo Team von {{isim}},\n\n" +
          "WhatsApp-Gruppen und Zettel für Schichten und Aufgaben? Für {{isim}} bringen wir die Betriebsführung in ein System:\n\n" +
          "• Digitaler Schichtplan – jede Filiale, jeder Mitarbeiter auf einen Blick\n" +
          "• QR-Zeiterfassung – Kommen/Gehen ohne Papier\n" +
          "• Aufgabenverteilung & Checklisten\n" +
          "• Vorbereitung der Lohnabrechnung\n\n" +
          "Gerne zeige ich Ihnen alles in einer kurzen, unverbindlichen Demo. Eine kurze Antwort genügt.\n\n" +
          "Beste Grüße,\nIhr fikoai-Team",
      },
      tr: {
        subject: "Vardiya, mesai takibi & görevler – {{isim}} için",
        body:
          "Merhaba {{isim}} ekibi,\n\n" +
          "Vardiya ve görevler için WhatsApp grupları ve kağıtlarla mı uğraşıyorsunuz? {{isim}} için işletme yönetimini tek sisteme taşıyoruz:\n\n" +
          "• Dijital vardiya planı – her şube, her personel tek bakışta\n" +
          "• QR mesai takibi – giriş/çıkış kağıtsız\n" +
          "• Görev dağıtımı & kontrol listeleri\n" +
          "• Bordro (Lohn) hazırlığı\n\n" +
          "Dilerseniz kısa, bağlayıcı olmayan bir demoda gösterelim. Kısa bir yanıt yeterli.\n\n" +
          "Saygılarımızla,\nfikoai ekibi",
      },
      en: {
        subject: "Shifts, time tracking & tasks – for {{isim}}",
        body:
          "Hello {{isim}} team,\n\n" +
          "WhatsApp groups and paper notes for shifts and tasks? For {{isim}} we bring operations into one system:\n\n" +
          "• Digital shift planning – every branch and employee at a glance\n" +
          "• QR time tracking – clock in/out without paper\n" +
          "• Task assignment & checklists\n" +
          "• Payroll preparation\n\n" +
          "Happy to show you in a short, no-obligation demo. A brief reply is enough.\n\n" +
          "Best regards,\nThe fikoai team",
      },
    },
  },

  // ── 7) Perakende & mağaza — dijital vitrin & online sipariş ─────
  {
    code: "perakende",
    renk: "#ec4899",
    label: { tr: "Perakende & Sipariş", de: "Handel & Bestellung" },
    aciklama: {
      tr: "Mağaza & perakende için online satış/sipariş",
      de: "Online-Verkauf/-Bestellung für Läden & Handel",
    },
    templates: {
      de: {
        subject: "Online sichtbar & bestellbar – für {{isim}}",
        body:
          "Hallo Team von {{isim}},\n\n" +
          "damit {{isim}} auch online gefunden wird und verkauft, richten wir alles aus einer Hand ein:\n\n" +
          "• Digitales Schaufenster & moderne Website\n" +
          "• Online-Bestellung – auch filialübergreifend (zentrale Bestellungen)\n" +
          "• Produktkatalog, einfach selbst pflegbar\n" +
          "• Sichtbarkeit bei Google & Neukundengewinnung\n\n" +
          "Gerne in einer kurzen, unverbindlichen Demo. Eine kurze Antwort genügt.\n\n" +
          "Beste Grüße,\nIhr fikoai-Team",
      },
      tr: {
        subject: "Online görünür & sipariş alınabilir – {{isim}} için",
        body:
          "Merhaba {{isim}} ekibi,\n\n" +
          "{{isim}}'in online bulunması ve satması için her şeyi tek elden kuruyoruz:\n\n" +
          "• Dijital vitrin & modern web sitesi\n" +
          "• Online sipariş – şubeler arası merkezi sipariş dahil\n" +
          "• Kolayca kendiniz güncelleyebileceğiniz ürün kataloğu\n" +
          "• Google'da görünürlük & yeni müşteri kazanımı\n\n" +
          "Dilerseniz kısa, bağlayıcı olmayan bir demoda gösterelim. Kısa bir yanıt yeterli.\n\n" +
          "Saygılarımızla,\nfikoai ekibi",
      },
      en: {
        subject: "Found and orderable online – for {{isim}}",
        body:
          "Hello {{isim}} team,\n\n" +
          "so that {{isim}} is found online and sells, we set everything up from one source:\n\n" +
          "• Digital shopfront & modern website\n" +
          "• Online ordering – including central, cross-branch orders\n" +
          "• Product catalogue you can easily update yourself\n" +
          "• Visibility on Google & new-customer acquisition\n\n" +
          "Happy to show you in a short, no-obligation demo. A brief reply is enough.\n\n" +
          "Best regards,\nThe fikoai team",
      },
    },
  },
];

// ── Yardımcılar ───────────────────────────────────────────────────
export const ilkKampanya = (): Kampanya => KAMPANYALAR[0];

export function kampanyaByCode(code?: string | null): Kampanya | undefined {
  return KAMPANYALAR.find((k) => k.code === code);
}

// Kampanyanın taslağı olan diller (LANGS sırasında)
export function kampanyaDilleri(k: Kampanya): string[] {
  return LANGS.map((l) => l.code).filter((c) => k.templates[c]);
}

// Dil için şablon (yoksa: en → de → ilk mevcut)
export function kampanyaSablon(k: Kampanya, lang: string): KampanyaSablon {
  return k.templates[lang] || k.templates["en"] || k.templates["de"] || Object.values(k.templates)[0];
}

// Dil için ek dosya (dile özel → "*" varsayılan → yok)
export function kampanyaEk(k: Kampanya, lang: string): KampanyaEk | null {
  if (!k.ek) return null;
  return k.ek[lang] || k.ek["*"] || null;
}

// WhatsApp / kopya metnine eklenecek sunum linki satırı
export function sunumSatiri(ek: KampanyaEk | null, lang: string): string {
  if (!ek) return "";
  const label = lang === "tr" ? "Tanıtım sunumu" : lang === "de" ? "Präsentation" : "Presentation";
  return `\n\n📎 ${label}: ${ek.url}`;
}
