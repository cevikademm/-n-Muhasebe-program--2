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
// Her mail/mesajın sonuna eklenen adres (imza satırı)
export const SITE_URL = "https://www.fikoai.de";
export const SITE_HOST = "www.fikoai.de";

export interface KampanyaEk { name: string; url: string; }
export interface KampanyaSablon { subject: string; body: string; }
export interface Kampanya {
  code: string;
  renk: string;
  label: { tr: string; de: string };
  aciklama: { tr: string; de: string };
  // Hedef kitle: b2b = işletmeye tanıtım, b2c = işletmenin son müşterisine bilgilendirme
  hedef?: "b2b" | "b2c";
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

  // ── 2) Ekspertiz — SON MÜŞTERİ bilgilendirme (marka ismi geçmez) ─
  // Bu metin ekspertiz bürosunun KENDİ müşterisine gönderdiği bilgilendirme
  // mailidir; gövdede hiçbir marka/yazılım adı geçmez, imza alanı bürodadır.
  // Hukuki not: "0 €" ifadesi yalnızca KUSURSUZ (unverschuldet) kaza için
  // geçerlidir — her dilde bu şart açıkça yazılıdır.
  {
    code: "musteri-bilgilendirme",
    renk: "#0ea5e9",
    hedef: "b2c",
    label: { tr: "Müşteri Bilgilendirme", de: "Kunden-Info" },
    aciklama: {
      tr: "Ekspertiz bürosunun son müşterisine dijital portal bilgilendirmesi (marka ismi geçmez)",
      de: "Kunden-Information des Sachverständigenbüros zum digitalen Portal (ohne Markenname)",
    },
    templates: {
      de: {
        subject: "Ihr Unfallschaden – jetzt digital, schneller und ohne Kosten für Sie",
        body:
          "Sehr geehrte Damen und Herren,\n\n" +
          "ein Verkehrsunfall kostet Sie Zeit, Nerven – und oft bares Geld, wenn Ansprüche übersehen werden. Genau das ändern wir für Sie: Als unabhängiges Kfz-Sachverständigenbüro bieten wir Ihnen ab sofort ein digitales Kundenportal, über das Ihr gesamter Schadenfall bequem vom Handy aus läuft.\n\n" +
          "Was Sie damit können:\n" +
          "• Ihren Fall rund um die Uhr verfolgen – Gutachten, Fotos, Rechnungen und alle Dokumente an einem Ort, kein Hinterhertelefonieren mehr.\n" +
          "• Termine online buchen – Besichtigungstermin in wenigen Klicks, die Erinnerung kommt automatisch per WhatsApp.\n" +
          "• Dokumente einfach hochladen – Fahrzeugschein fotografieren, die Daten werden automatisch erkannt und übernommen.\n" +
          "• HU/TÜV-Erinnerung – wir erinnern Sie rechtzeitig an Ihre Hauptuntersuchung, bevor Fristen ablaufen.\n" +
          "• Alles aus einer Hand – auf Wunsch koordinieren wir direkt Werkstatt, Rechtsanwalt und Versicherung.\n\n" +
          "Was das für Ihren Geldbeutel bedeutet:\n" +
          "1) 0 € Kosten bei unverschuldetem Unfall – die Kosten des unabhängigen Gutachtens trägt die gegnerische Versicherung, nicht Sie.\n" +
          "2) Volle Entschädigung statt Kürzung – ein unabhängiges Gutachten erfasst auch Positionen, die gern „vergessen“ werden: Wertminderung, Nutzungsausfall, Abschlepp- und Mietwagenkosten. Das macht häufig mehrere hundert bis tausend Euro Unterschied.\n" +
          "3) Schnellere Auszahlung – digitale Abwicklung heißt: Gutachten und Unterlagen erreichen die Versicherung ohne Verzögerung.\n" +
          "4) Keine verpassten Fristen – automatische HU/TÜV-Erinnerungen schützen Sie vor Bußgeldern und teuren Nachprüfungen.\n" +
          "5) Zeit ist Geld – kein Papierkram, keine unnötigen Fahrten; alles läuft digital über Ihr Portal.\n\n" +
          "Bei Fragen erreichen Sie uns jederzeit per Telefon oder WhatsApp. Wir freuen uns, Sie auch digital begleiten zu dürfen.\n\n" +
          "Mit freundlichen Grüßen\n(Name / Unterschrift / Kontaktdaten)",
      },
      tr: {
        subject: "Kaza dosyanız artık dijital – daha hızlı, daha şeffaf ve size maliyeti sıfır",
        body:
          "Değerli Müşterimiz,\n\n" +
          "Bir trafik kazası size zaman, moral ve çoğu zaman fark etmeden para kaybettirir; çünkü hak ettiğiniz birçok kalem tazminat gözden kaçar. Bağımsız oto ekspertiz büromuz olarak bunu değiştiriyoruz: Artık tüm hasar dosyanızı telefonunuzdan yönetebileceğiniz dijital bir müşteri portalı hizmetinizde.\n\n" +
          "Portal ile neler yapabilirsiniz?\n" +
          "• Dosyanızı 7/24 takip edin – ekspertiz raporu, fotoğraflar, faturalar ve tüm belgeler tek ekranda, telefon trafiğine son.\n" +
          "• Online randevu alın – araç inceleme randevunuzu birkaç tıkla oluşturun, hatırlatma WhatsApp'tan otomatik gelsin.\n" +
          "• Belgelerinizi kolayca yükleyin – ruhsatınızın fotoğrafını çekmeniz yeterli, bilgiler otomatik okunur ve dosyanıza işlenir.\n" +
          "• TÜV (muayene) hatırlatması – muayene tarihiniz yaklaşınca sizi zamanında uyarırız, süre kaçırmazsınız.\n" +
          "• Her şey tek elden – dilerseniz kaporta atölyesi, avukat ve sigorta yazışmalarını sizin adınıza biz koordine ederiz.\n\n" +
          "Cebinize somut faydası ne?\n" +
          "1) Kusursuz olduğunuz kazada size maliyet sıfır – bağımsız ekspertiz raporunun ücretini siz değil, karşı tarafın sigortası öder.\n" +
          "2) Eksiksiz tazminat – bağımsız rapor, sigortaların „unutmayı“ sevdiği kalemleri de kapsar: değer kaybı (Wertminderung), kullanım kaybı (Nutzungsausfall), çekici ve kiralık araç masrafları. Bu çoğu zaman yüzlerce, hatta binlerce Euro fark demektir.\n" +
          "3) Paranız daha hızlı hesabınızda – dijital süreç sayesinde rapor ve belgeler sigortaya gecikmeden ulaşır.\n" +
          "4) Ceza ve ek masraf yok – otomatik TÜV hatırlatmaları sayesinde muayene süresini kaçırma riskiniz olmaz.\n" +
          "5) Zamandan tasarruf = paradan tasarruf – evrak işi yok, ofis ofis dolaşmak yok; her adım portalınız üzerinden dijital ilerler.\n\n" +
          "Sorularınız için bize telefon veya WhatsApp üzerinden her zaman ulaşabilirsiniz. Sizi dijital olarak da yanımızda görmekten mutluluk duyarız.\n\n" +
          "Saygılarımızla\n(İsim / İmza / İletişim bilgileri)",
      },
      en: {
        subject: "Your accident claim – now digital, faster and at no cost to you",
        body:
          "Dear Sir or Madam,\n\n" +
          "A road accident costs you time, nerves – and often real money, because entitlements are easily overlooked. That is exactly what we are changing for you: as an independent vehicle appraisal office we now offer you a digital customer portal that runs your entire claim conveniently from your phone.\n\n" +
          "What you can do with it:\n" +
          "• Track your case around the clock – appraisal report, photos, invoices and all documents in one place, no more chasing phone calls.\n" +
          "• Book appointments online – arrange the inspection in a few clicks, the reminder arrives automatically via WhatsApp.\n" +
          "• Upload documents easily – just photograph your vehicle registration; the data is recognised and filed automatically.\n" +
          "• Roadworthiness (HU/TÜV) reminder – we remind you in good time before deadlines expire.\n" +
          "• Everything from one source – on request we coordinate the body shop, lawyer and insurer directly.\n\n" +
          "What this means for your wallet:\n" +
          "1) €0 cost if the accident was not your fault – the cost of the independent appraisal is borne by the other party's insurer, not by you.\n" +
          "2) Full compensation instead of cuts – an independent report also covers the items insurers like to \"forget\": diminished value, loss-of-use compensation, towing and rental car costs. That often means a difference of several hundred to several thousand euros.\n" +
          "3) Faster payout – digital handling means the report and documents reach the insurer without delay.\n" +
          "4) No missed deadlines – automatic inspection reminders protect you from fines and expensive re-tests.\n" +
          "5) Time is money – no paperwork, no unnecessary trips; every step runs digitally through your portal.\n\n" +
          "If you have any questions, you can reach us at any time by phone or WhatsApp. We look forward to supporting you digitally as well.\n\n" +
          "Kind regards\n(Name / Signature / Contact details)",
      },
      fr: {
        subject: "Votre sinistre auto – désormais numérique, plus rapide et sans frais pour vous",
        body:
          "Madame, Monsieur,\n\n" +
          "Un accident de la route vous coûte du temps, des nerfs – et souvent de l'argent, car de nombreux droits à indemnisation passent inaperçus. C'est précisément ce que nous changeons pour vous : en tant que bureau d'expertise automobile indépendant, nous vous proposons désormais un portail client numérique qui gère l'ensemble de votre dossier depuis votre téléphone.\n\n" +
          "Ce que vous pouvez y faire :\n" +
          "• Suivre votre dossier 24h/24 – rapport d'expertise, photos, factures et tous les documents au même endroit, fini les relances téléphoniques.\n" +
          "• Prendre rendez-vous en ligne – l'expertise du véhicule en quelques clics, le rappel arrive automatiquement par WhatsApp.\n" +
          "• Téléverser vos documents facilement – photographiez votre carte grise, les données sont reconnues et intégrées automatiquement.\n" +
          "• Rappel du contrôle technique – nous vous prévenons à temps, avant l'expiration des délais.\n" +
          "• Tout en une seule main – sur demande, nous coordonnons directement le carrossier, l'avocat et l'assurance.\n\n" +
          "Ce que cela signifie pour votre portefeuille :\n" +
          "1) 0 € de frais en cas d'accident non responsable – le coût de l'expertise indépendante est pris en charge par l'assurance adverse, pas par vous.\n" +
          "2) Une indemnisation complète plutôt que réduite – un rapport indépendant couvre aussi les postes que l'on « oublie » volontiers : dépréciation du véhicule, privation de jouissance, frais de remorquage et de véhicule de remplacement. Cela représente souvent plusieurs centaines, voire milliers d'euros.\n" +
          "3) Un versement plus rapide – le traitement numérique permet au rapport et aux pièces d'arriver sans délai chez l'assureur.\n" +
          "4) Aucun délai manqué – les rappels automatiques du contrôle technique vous évitent amendes et contre-visites coûteuses.\n" +
          "5) Le temps, c'est de l'argent – plus de paperasse, plus de déplacements inutiles : tout passe par votre portail.\n\n" +
          "Pour toute question, nous restons joignables par téléphone ou WhatsApp. Nous serons heureux de vous accompagner également en version numérique.\n\n" +
          "Cordialement\n(Nom / Signature / Coordonnées)",
      },
      nl: {
        subject: "Uw schadedossier – nu digitaal, sneller en zonder kosten voor u",
        body:
          "Geachte heer, mevrouw,\n\n" +
          "Een verkeersongeval kost u tijd, energie – en vaak ook geld, omdat aanspraken makkelijk over het hoofd worden gezien. Precies dat veranderen wij voor u: als onafhankelijk auto-expertisebureau bieden wij u vanaf nu een digitaal klantenportaal waarmee uw hele schadedossier gewoon via uw telefoon loopt.\n\n" +
          "Wat u ermee kunt:\n" +
          "• Uw dossier 24/7 volgen – expertiserapport, foto's, facturen en alle documenten op één plek, geen achterafbellen meer.\n" +
          "• Online afspraken maken – de schouwing in een paar klikken, de herinnering komt automatisch via WhatsApp.\n" +
          "• Documenten eenvoudig uploaden – fotografeer uw kentekenbewijs; de gegevens worden automatisch herkend en verwerkt.\n" +
          "• APK/TÜV-herinnering – wij herinneren u op tijd, voordat de termijn verloopt.\n" +
          "• Alles uit één hand – op verzoek stemmen wij schadeherstelbedrijf, advocaat en verzekeraar rechtstreeks af.\n\n" +
          "Wat dat voor uw portemonnee betekent:\n" +
          "1) € 0 kosten bij een ongeval buiten uw schuld – de kosten van het onafhankelijke rapport draagt de verzekeraar van de tegenpartij, niet u.\n" +
          "2) Volledige vergoeding in plaats van korting – een onafhankelijk rapport dekt ook posten die men graag „vergeet”: waardevermindering, gebruiksderving, sleep- en huurautokosten. Dat scheelt vaak enkele honderden tot duizenden euro's.\n" +
          "3) Sneller uitbetaald – digitale afhandeling betekent dat rapport en stukken zonder vertraging bij de verzekeraar aankomen.\n" +
          "4) Geen gemiste termijnen – automatische keuringsherinneringen beschermen u tegen boetes en dure herkeuringen.\n" +
          "5) Tijd is geld – geen papierwerk, geen onnodige ritten; elke stap loopt digitaal via uw portaal.\n\n" +
          "Bij vragen bereikt u ons altijd per telefoon of WhatsApp. Wij begeleiden u graag ook digitaal.\n\n" +
          "Met vriendelijke groet\n(Naam / Handtekening / Contactgegevens)",
      },
      it: {
        subject: "Il suo sinistro – ora digitale, più veloce e senza costi per lei",
        body:
          "Gentile Cliente,\n\n" +
          "Un incidente stradale le costa tempo, nervi – e spesso denaro, perché molte voci di risarcimento sfuggono facilmente. È proprio questo che vogliamo cambiare: come studio peritale auto indipendente le mettiamo a disposizione un portale clienti digitale con cui gestire l'intera pratica comodamente dal telefono.\n\n" +
          "Cosa può fare con il portale:\n" +
          "• Seguire la pratica 24 ore su 24 – perizia, foto, fatture e tutti i documenti in un unico posto, senza più rincorrere telefonate.\n" +
          "• Prenotare appuntamenti online – la visione del veicolo in pochi clic, il promemoria arriva automaticamente via WhatsApp.\n" +
          "• Caricare i documenti facilmente – basta fotografare il libretto di circolazione: i dati vengono riconosciuti e inseriti automaticamente.\n" +
          "• Promemoria della revisione – la avvisiamo per tempo, prima della scadenza.\n" +
          "• Tutto da un unico interlocutore – su richiesta coordiniamo direttamente carrozzeria, avvocato e assicurazione.\n\n" +
          "Cosa significa per il suo portafoglio:\n" +
          "1) 0 € di costi in caso di incidente non per sua colpa – la perizia indipendente è a carico dell'assicurazione della controparte, non sua.\n" +
          "2) Risarcimento pieno anziché ridotto – una perizia indipendente comprende anche le voci che si tende a „dimenticare“: deprezzamento del veicolo, mancato utilizzo, costi di traino e auto sostitutiva. Spesso si tratta di centinaia o migliaia di euro di differenza.\n" +
          "3) Liquidazione più rapida – la gestione digitale fa arrivare perizia e documenti all'assicurazione senza ritardi.\n" +
          "4) Nessuna scadenza dimenticata – i promemoria automatici della revisione la proteggono da multe e controlli ripetuti costosi.\n" +
          "5) Il tempo è denaro – niente burocrazia, niente spostamenti inutili: ogni passaggio avviene digitalmente nel suo portale.\n\n" +
          "Per qualsiasi domanda siamo sempre raggiungibili per telefono o WhatsApp. Saremo lieti di assisterla anche in forma digitale.\n\n" +
          "Cordiali saluti\n(Nome / Firma / Contatti)",
      },
      es: {
        subject: "Su siniestro – ahora digital, más rápido y sin coste para usted",
        body:
          "Estimado cliente:\n\n" +
          "Un accidente de tráfico le cuesta tiempo, nervios – y a menudo dinero, porque muchas partidas de indemnización pasan desapercibidas. Eso es justo lo que cambiamos para usted: como gabinete pericial de automoción independiente, le ofrecemos ahora un portal de cliente digital con el que gestionar todo su expediente cómodamente desde el móvil.\n\n" +
          "Qué puede hacer con él:\n" +
          "• Seguir su expediente las 24 horas – informe pericial, fotos, facturas y todos los documentos en un solo lugar, sin perseguir llamadas.\n" +
          "• Reservar citas online – la inspección del vehículo en pocos clics, el recordatorio llega automáticamente por WhatsApp.\n" +
          "• Subir documentos fácilmente – basta con fotografiar el permiso de circulación: los datos se reconocen y se incorporan solos.\n" +
          "• Recordatorio de la ITV – le avisamos a tiempo, antes de que venzan los plazos.\n" +
          "• Todo de la mano de un único interlocutor – si lo desea, coordinamos directamente taller, abogado y aseguradora.\n\n" +
          "Qué significa esto para su bolsillo:\n" +
          "1) 0 € de coste si el accidente no fue culpa suya – el informe pericial independiente lo paga la aseguradora contraria, no usted.\n" +
          "2) Indemnización completa en lugar de recortada – un informe independiente recoge también las partidas que suelen „olvidarse“: depreciación del vehículo, lucro cesante por privación de uso, grúa y vehículo de sustitución. Eso supone con frecuencia cientos o miles de euros de diferencia.\n" +
          "3) Cobro más rápido – la tramitación digital hace que informe y documentos lleguen a la aseguradora sin demora.\n" +
          "4) Sin plazos perdidos – los recordatorios automáticos de la ITV le protegen de multas y revisiones repetidas caras.\n" +
          "5) El tiempo es dinero – sin papeleo ni desplazamientos innecesarios: cada paso avanza digitalmente en su portal.\n\n" +
          "Para cualquier duda puede contactarnos en todo momento por teléfono o WhatsApp. Estaremos encantados de acompañarle también de forma digital.\n\n" +
          "Atentamente\n(Nombre / Firma / Datos de contacto)",
      },
    },
  },

  // ── 3) fikoai Muhasebe (genel — ek yok) ─────────────────────────
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

  // ── 4) Gastronomi — QR menü & sipariş (Restoran, kafe, imbiss) ───
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

  // ── 5) Web sitesi & dijital vitrin (her sektör) ─────────────────
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

  // ── 6) Online randevu (Kuaför, güzellik, sağlık, danışmanlık) ────
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

  // ── 7) Personel & vardiya yönetimi (çok personelli/şubeli) ──────
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

  // ── 8) Perakende & mağaza — dijital vitrin & online sipariş ─────
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

// ── İmza (her mail/mesajın sonuna) ────────────────────────────────
// Kanal fark etmeksizin (mail, WhatsApp, kopyala, mailto) gönderilen her
// metnin sonuna site adresi eklenir. İki kez eklenmesin diye `imzaEkle`
// metinde adres zaten geçiyorsa dokunmaz.
const IMZA_LABEL: Record<string, string> = {
  tr: "Detaylı bilgi", de: "Mehr erfahren", en: "Learn more",
  fr: "En savoir plus", nl: "Meer informatie", it: "Maggiori informazioni",
  es: "Más información",
};

export function imzaSatiri(lang: string): string {
  return `\n\n🌐 ${IMZA_LABEL[lang] || IMZA_LABEL.de}: ${SITE_HOST}`;
}

// Metnin sonuna imza satırını ekler (zaten varsa metni değiştirmez)
export function imzaEkle(text: string, lang: string): string {
  const t = String(text ?? "");
  if (new RegExp(SITE_HOST.replace(/\./g, "\\."), "i").test(t)) return t;
  return t.trimEnd() + imzaSatiri(lang);
}

// Gönderilecek nihai metin: gövde + (isteğe bağlı) sunum linki + imza.
// Mail, WhatsApp, kopyala ve mailto aynı fonksiyondan geçer.
export function mesajMetni(body: string, ek: KampanyaEk | null, lang: string, sunumEkle = true): string {
  return imzaEkle(String(body ?? "").trimEnd() + (sunumEkle ? sunumSatiri(ek, lang) : ""), lang);
}
