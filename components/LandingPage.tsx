import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  Brain, Shield, Zap, FileText, BarChart3, Building2,
  Globe, Lock, ChevronRight, Star, CheckCircle2,
  CreditCard, ArrowRight, Sparkles, TrendingUp,
  Users, Clock, Award, Eye, Languages,
} from "lucide-react";
import { LegalModal, SecurityCertificatesModal } from "./LegalFooter";
import { DeliveryReturnPanel } from "./DeliveryReturnPanel";
import { PrivacyPolicyPanel } from "./PrivacyPolicyPanel";
import { DistanceSellingPanel } from "./DistanceSellingPanel";

interface LandingPageProps {
  onGoToLogin: () => void;
  onGoToRegister: () => void;
  lang: "tr" | "de";
  onLangChange: (lang: "tr" | "de") => void;
}

const t = {
  tr: {
    nav: { features: "Özellikler", why: "Neden FikoAI?", pricing: "Fiyatlandırma", about: "Hakkımızda", login: "Giriş Yap", startFree: "Ücretsiz Başla" },
    hero: {
      badge: "Yapay Zeka Destekli Muhasebe",
      title1: "Muhasebenizi",
      titleHighlight: "Akıllı",
      title2: "Hale Getirin",
      subtitle: "Almanya ve Avrupa'daki KOBİ'ler için yapay zeka destekli muhasebe çözümü. Faturalarınızı yükleyin, banka hesap özetlerinizi analiz edin — gerisini FikoAI halleder.",
      cta: "Hemen Başlayın",
      ctaSecondary: "Demo İzle",
      stat1: "hedef Analizi",
      stat2: "Doğruluk Oranı",
      stat3: "Zaman Tasarrufu",
    },
    features: {
      title: "Güçlü Özellikler",
      subtitle: "İşletmenizi bir adım öne taşıyan yapay zeka teknolojisi",
      items: [
        { icon: "brain", title: "AI Fatura Analizi", desc: "Google Gemini AI ile faturalarınız otomatik okunur, kategorize edilir ve SKR03/SKR04 hesap planına eşlenir." },
        { icon: "file", title: "Banka Hesap Özeti", desc: "PDF banka hesap özetlerinizi yükleyin, işlemleriniz otomatik analiz edilsin ve faturalarınızla eşleştirilsin." },
        { icon: "chart", title: "Detaylı Raporlar", desc: "KDV raporları, tedarikçi analizleri, vergi danışmanı raporları ve DATEV uyumlu dışa aktarım." },
        { icon: "shield", title: "Güvenli Altyapı", desc: "SSL şifreleme, Row Level Security (RLS), GDPR uyumlu veri işleme ve Supabase güvenlik katmanları." },
        { icon: "globe", title: "Çok Dilli Destek", desc: "Türkçe ve Almanca arayüz desteği ile Avrupa genelinde kullanım kolaylığı." },
        { icon: "zap", title: "Hızlı & Otomatik", desc: "OCR teknolojisi ile taranmış belgeler bile saniyeler içinde işlenir. Manuel veri girişine son." },
      ],
    },
    why: {
      title: "Neden FikoAI?",
      subtitle: "Almanya ve Avrupa pazarında fark yaratan çözüm",
      reasons: [
        { title: "DATEV Uyumlu", desc: "Almanya'nın lider muhasebe yazılımı DATEV ile tam uyumlu dışa aktarım. Vergi danışmanınız ile sorunsuz entegrasyon." },
        { title: "SKR03 & SKR04", desc: "Alman muhasebe standartları SKR03 ve SKR04 hesap planları ile tam uyumlu otomatik kontirung." },
        { title: "GDPR Uyumlu", desc: "Avrupa Birliği Genel Veri Koruma Yönetmeliği'ne (GDPR/DSGVO) tam uyumluluk. Verileriniz güvende." },
        { title: "7/24 Erişim", desc: "Bulut tabanlı altyapı sayesinde her yerden, her zaman muhasebenize erişin. Mobil uyumlu arayüz." },
        { title: "%99.5 Doğruluk", desc: "Yapay zeka modelimiz sürekli öğrenir ve gelişir. Fatura okuma doğruluğu %99.5'e ulaşır." },
        { title: "%80 Zaman Tasarrufu", desc: "Manuel veri girişini ortadan kaldırarak muhasebe sürecinizi %80 oranında hızlandırın." },
      ],
    },
    pricing: {
      title: "Fiyatlandırma",
      subtitle: "İşletmenize uygun planı seçin",
      popular: "En Popüler",
      plans: [
        { key: "free", name: "Ücretsiz", price: "0", period: "", desc: "Başlangıç için ideal", features: ["10 Fatura İşleme", "1 Banka Dökümü", "Fatura Gider Analizi", "Aylık Rapor"], excluded: ["Kurallar", "Export", "Online Destek"], buttonText: "Ücretsiz Başla", isFree: true },
        { key: "monthly", name: "Aylık", price: "40", period: "/ay", desc: "Sadece mevcut ay için erişim", features: ["Sınırsız Fatura İşleme", "Aylık Banka Dökümü", "Fatura Gider Analizi", "Kurallar", "Export", "Online Destek"], excluded: ["Geçmiş Dönemlere Erişim"], buttonText: "Planı Seç" },
        { key: "quarterly", name: "3 Aylık", price: "120", period: "/3 ay", desc: "Çeyrek içi geçmiş dönemlere erişim", features: ["Sınırsız Fatura İşleme", "3 Aylık Banka Dökümü", "Fatura Gider Analizi", "Kurallar", "Export", "Online Destek", "Çeyrek İçi Geçmiş Dönem"], excluded: [], buttonText: "Planı Seç" },
        { key: "yearly", name: "Yıllık", price: "400", period: "/yıl", desc: "En avantajlı plan — aylık ~33€", features: ["Sınırsız Fatura İşleme", "12 Aylık Banka Dökümü", "Fatura Gider Analizi", "Kurallar", "Export", "Online Destek", "Yıl İçi Tüm Geçmiş Dönem"], excluded: [], buttonText: "Planı Seç", popular: true },
      ],
    },
    about: {
      title: "Hakkımızda",
      desc: "FikoAI, Almanya merkezli bir fintech girişimi olarak 2024 yılında kurulmuştur. Kökleri ve teknolojik altyapısı, geliştirici firmamızın 2023 yılında attığı sağlam temellere dayanmaktadır. Amacımız, Avrupa genelindeki küçük ve orta ölçekli işletmelerin karmaşık muhasebe süreçlerini en ileri yapay zeka teknolojileriyle baştan aşağı dönüştürmektir.\n\nSıradan bir yazılım sunmanın ötesine geçerek; şirket yetkililerimizin muhasebe, mali denetim ve finansal danışmanlık alanındaki 20 yılı aşkın derin saha tecrübesini, modern ve etkileyici bir teknoloji altyapısıyla buluşturuyoruz.\n\nDeneyimli muhasebeciler, mali müşavirler ve üst düzey yazılım mühendislerinden oluşan vizyoner ekibimiz; her gün daha akıllı, daha hızlı, hatasız ve benzersiz bir dijital muhasebe deneyimi sunmak için kararlılıkla çalışmaktadır.",
    },
    footer: {
      rights: "Tüm hakları saklıdır.",
      about: "Hakkımızda",
      ssl: "SSL Sertifikası",
      delivery: "Teslimat ve İade Şartları",
      privacy: "Gizlilik Sözleşmesi",
      distance: "Mesafeli Satış Sözleşmesi",
      secure: "Güvenli Ödeme",
    },
    trust: {
      title: "Güvenli Ödeme Altyapısı",
      desc: "Ödemeleriniz iyzico güvencesiyle, SSL şifreleme altında güvenle işlenir.",
    },
  },
  de: {
    nav: { features: "Funktionen", why: "Warum FikoAI?", pricing: "Preise", about: "Über uns", login: "Anmelden", startFree: "Kostenlos starten" },
    hero: {
      badge: "KI-gestützte Buchhaltung",
      title1: "Machen Sie Ihre",
      titleHighlight: "Buchhaltung",
      title2: "intelligent",
      subtitle: "KI-gestützte Buchhaltungslösung für KMU in Deutschland und Europa. Laden Sie Ihre Rechnungen hoch, analysieren Sie Kontoauszüge — FikoAI erledigt den Rest.",
      cta: "Jetzt starten",
      ctaSecondary: "Demo ansehen",
      stat1: "Ziel Analyse",
      stat2: "Genauigkeit",
      stat3: "Zeitersparnis",
    },
    features: {
      title: "Leistungsstarke Funktionen",
      subtitle: "KI-Technologie, die Ihr Unternehmen voranbringt",
      items: [
        { icon: "brain", title: "KI-Rechnungsanalyse", desc: "Mit Google Gemini AI werden Ihre Rechnungen automatisch gelesen, kategorisiert und SKR03/SKR04-Kontenrahmen zugeordnet." },
        { icon: "file", title: "Kontoauszug-Analyse", desc: "Laden Sie PDF-Kontoauszüge hoch — Transaktionen werden automatisch analysiert und mit Rechnungen abgeglichen." },
        { icon: "chart", title: "Detaillierte Berichte", desc: "USt-Berichte, Lieferantenanalysen, Steuerberater-Reports und DATEV-kompatibler Export." },
        { icon: "shield", title: "Sichere Infrastruktur", desc: "SSL-Verschlüsselung, Row Level Security (RLS), DSGVO-konforme Datenverarbeitung." },
        { icon: "globe", title: "Mehrsprachig", desc: "Türkische und deutsche Benutzeroberfläche für europaweite Nutzung." },
        { icon: "zap", title: "Schnell & Automatisch", desc: "OCR-Technologie verarbeitet auch gescannte Belege in Sekunden. Schluss mit manueller Dateneingabe." },
      ],
    },
    why: {
      title: "Warum FikoAI?",
      subtitle: "Die Lösung, die in Deutschland und Europa den Unterschied macht",
      reasons: [
        { title: "DATEV-kompatibel", desc: "Vollständig kompatibler Export mit Deutschlands führender Buchhaltungssoftware DATEV." },
        { title: "SKR03 & SKR04", desc: "Vollständig kompatible automatische Kontierung mit deutschen Kontenrahmen SKR03 und SKR04." },
        { title: "DSGVO-konform", desc: "Volle Konformität mit der EU-Datenschutz-Grundverordnung (DSGVO). Ihre Daten sind sicher." },
        { title: "24/7 Zugriff", desc: "Cloud-basierte Infrastruktur — greifen Sie jederzeit und überall auf Ihre Buchhaltung zu." },
        { title: "99,5% Genauigkeit", desc: "Unser KI-Modell lernt kontinuierlich. Die Rechnungslesegenauigkeit erreicht 99,5%." },
        { title: "80% Zeitersparnis", desc: "Eliminieren Sie manuelle Dateneingabe und beschleunigen Sie Ihre Buchhaltung um 80%." },
      ],
    },
    pricing: {
      title: "Preise",
      subtitle: "Wählen Sie den passenden Plan für Ihr Unternehmen",
      popular: "Beliebteste",
      plans: [
        { key: "free", name: "Kostenlos", price: "0", period: "", desc: "Ideal für den Einstieg", features: ["10 Rechnungen verarbeiten", "1 Kontoauszug", "Rechnungsausgabenanalyse", "Monatlicher Bericht"], excluded: ["Regeln", "Exportieren", "Online-Support"], buttonText: "Kostenlos starten", isFree: true },
        { key: "monthly", name: "Monatlich", price: "40", period: "/Monat", desc: "Zugriff nur auf den aktuellen Monat", features: ["Unbegrenzte Rechnungen", "Monatlicher Kontoauszug", "Rechnungsausgabenanalyse", "Regeln", "Exportieren", "Online-Support"], excluded: ["Zugriff auf vergangene Zeiträume"], buttonText: "Plan wählen" },
        { key: "quarterly", name: "3 Monate", price: "120", period: "/3 Mon.", desc: "Zugriff auf vergangene Monate im Quartal", features: ["Unbegrenzte Rechnungen", "3 Monate Kontoauszug", "Rechnungsausgabenanalyse", "Regeln", "Exportieren", "Online-Support", "Zugriff auf Quartalsmonate"], excluded: [], buttonText: "Plan wählen" },
        { key: "yearly", name: "Jährlich", price: "400", period: "/Jahr", desc: "Bester Plan — ~33€ monatlich", features: ["Unbegrenzte Rechnungen", "12 Monate Kontoauszug", "Rechnungsausgabenanalyse", "Regeln", "Exportieren", "Online-Support", "Alle vergangenen Jahresmonate"], excluded: [], buttonText: "Plan wählen", popular: true },
      ],
    },
    about: {
      title: "Über uns",
      desc: "FikoAI wurde 2024 als Fintech-Startup mit Sitz in Deutschland gegründet. Die Wurzeln und die technologische Infrastruktur basieren auf den soliden Grundlagen, die unser Entwicklungsunternehmen im Jahr 2023 gelegt hat. Unser Ziel ist es, die komplexen Buchhaltungsprozesse von KMU in Europa mit modernsten KI-Technologien zu transformieren.\n\nWir vereinen die über 20-jährige Felderfahrung unserer Führungskräfte in den Bereichen Buchhaltung, Wirtschaftsprüfung und Finanzberatung mit einer beeindruckenden technologischen Infrastruktur.\n\nUnser visionäres Team aus erfahrenen Buchhaltern, Steuerberatern und Softwareentwicklern arbeitet entschlossen daran, jeden Tag ein intelligenteres, fehlerfreies und zukunftssicheres Buchhaltungserlebnis zu bieten.",
    },
    footer: {
      rights: "Alle Rechte vorbehalten.",
      about: "Über uns",
      ssl: "SSL-Zertifikat",
      delivery: "Liefer- und Rückgabebedingungen",
      privacy: "Datenschutzerklärung",
      distance: "Fernabsatzvertrag",
      secure: "Sichere Zahlung",
    },
    trust: {
      title: "Sichere Zahlungsinfrastruktur",
      desc: "Ihre Zahlungen werden mit iyzico-Sicherheit unter SSL-Verschlüsselung sicher verarbeitet.",
    },
  },
};

const featureIcons: Record<string, React.ReactNode> = {
  brain: <Brain size={24} />,
  file: <FileText size={24} />,
  chart: <BarChart3 size={24} />,
  shield: <Shield size={24} />,
  globe: <Globe size={24} />,
  zap: <Zap size={24} />,
};

const whyIcons = [
  <FileText size={22} />,
  <BarChart3 size={22} />,
  <Lock size={22} />,
  <Clock size={22} />,
  <Award size={22} />,
  <TrendingUp size={22} />,
];

const guideContent: any = {
  tr: {
    title: "Modern Muhasebe Rehberi",
    subtitle: "Yapay Zeka ile Finansal Dönüşüm",
    sections: [
      {
        id: 1,
        title: "Muhasebede Yeni Bir Dönem",
        content: "Geleneksel muhasebe yöntemleri; manuel veri girişi, bitmek bilmeyen kağıt fatura yığınları ve insan hatasına açık dosyalama süreçleri arasında sıkışmış durumdadır. FikoAI, Avrupa’daki KOBİ’ler için bu dönüşümün öncülüğünü üstlenerek, 20 yılı aşkın finansal saha tecrübesini en ileri teknolojiyle harmanlıyor.",
        extra: "Eski vs. Yeni: Belgelerin saniyeler içinde dijitalleşmesi, %99.5 doğruluk oranı, %80 zaman tasarrufu.",
        icon: <Sparkles size={20} />
      },
      {
        id: 2,
        title: "Muhasebenin Yeni Dili",
        content: "OCR Teknolojisi (Dijital Gözler), taranmış kağıt belgeleri dijital verilere dönüştürür. AI Destekli Kategorizasyon ise faturayı doğru gider kalemine yerleştiren 'Akıllı Kütüphane' görevi görür.",
        extra: "Banka Hesap Özeti Analizi ile finansal puzzle saniyeler içinde tamamlanır.",
        icon: <Languages size={20} />
      },
      {
        id: 3,
        title: "Uygulamada Yapay Zeka",
        content: "FikoAI, karmaşık algoritmaları sade bir kullanıcı deneyimine dönüştürür. Google Gemini AI desteğiyle %99.5 doğruluk ile profesyonel standartlara ulaşırsınız.",
        extra: "DATEV entegrasyonu ve SKR03/04 eşleme ile Avrupa genelinde yetkinlik kazandırır.",
        icon: <Zap size={20} />
      },
      {
        id: 4,
        title: "Güvenlik ve Standartlar",
        content: "GDPR/DSGVO uyumluluğu ile veri sızıntısı risklerini ortadan kaldırıyoruz. SSL ve RLS güvenliği ile verileriniz hem iletimde hem depolamada şifrelenir.",
        extra: "Alman muhasebe planlarıyla (SKR) tam uyumlu otomatik kodlama.",
        icon: <Shield size={20} />
      },
      {
        id: 5,
        title: "Verimlilik Analizi",
        content: "Geleceğin muhasebe uzmanı, operasyonel yüklerden kurtulup 'finansal danışman' rolüne soyunandır. FikoAI ile %80 zaman tasarrufu sağlanır.",
        extra: "50.000'den fazla fatura işleme deneyimi ile saniyeler içinde raporlama.",
        icon: <TrendingUp size={20} />
      },
      {
        id: 6,
        title: "Kariyer Yol Haritası",
        content: "FikoAI'nın sunduğu imkanları birer eğitim basamağı olarak kullanın. Ücretsiz plan ile teorik bilgilerinizi pratikle birleştirin.",
        extra: "FikoAI ile bu dijital dönüşümün sadece bir tanığı değil, bizzat yöneticisi olun.",
        icon: <Globe size={20} />
      }
    ]
  },
  de: {
    title: "Moderner Buchhaltungsleitfaden",
    subtitle: "Finanzielle Transformation mit KI",
    sections: [
      {
        id: 1,
        title: "Neue Ära der Buchhaltung",
        content: "Traditionelle Methoden sind zwischen manueller Dateneingabe und Papierstapeln gefangen. FikoAI kombiniert 20+ Jahre Erfahrung mit modernster KI für KMU in Europa.",
        extra: "Alt vs. Neu: Digitalisierung in Sekunden, 99,5% Genauigkeit, 80% Zeitersparnis.",
        icon: <Sparkles size={20} />
      },
      {
        id: 2,
        title: "Die neue Sprache",
        content: "OCR-Technologie wandelt Papier in digitale Daten um. KI-gestützte Kategorisierung fungiert als 'Smarte Bibliothek' für Ihre Ausgaben.",
        extra: "Kontoauszug-Analyse löst das Finanzpuzzle in Sekundenschnelle.",
        icon: <Languages size={20} />
      },
      {
        id: 3,
        title: "KI in der Anwendung",
        content: "FikoAI verwandelt komplexe Algorithmen in einfache Benutzererfahrungen. Mit Google Gemini erreichen Sie professionelle Standards.",
        extra: "DATEV-Integration und SKR03/04-Mapping für europaweite Kompetenz.",
        icon: <Zap size={20} />
      },
      {
        id: 4,
        title: "Sicherheit und Standards",
        content: "DSGVO-Konformität eliminiert Risiken. SSL- und RLS-Sicherheit verschlüsseln Ihre Daten bei Übertragung und Speicherung.",
        extra: "Automatische Kontierung nach deutschen SKR-Standards.",
        icon: <Shield size={20} />
      },
      {
        id: 5,
        title: "Effizienzanalyse",
        content: "Befreien Sie sich von operativer Last und werden Sie zum Finanzberater. FikoAI spart bis zu 80% Ihrer wertvollen Zeit.",
        extra: "Erfahrung aus über 50.000 verarbeiteten Rechnungen.",
        icon: <TrendingUp size={20} />
      },
      {
        id: 6,
        title: "Karriere-Roadmap",
        content: "Nutzen Sie FikoAI als Bildungsstufe. Verbinden Sie mit unserem kostenlosen Plan theoretisches Wissen mit der Praxis.",
        extra: "Werden Sie mit FikoAI zum Manager der digitalen Transformation.",
        icon: <Globe size={20} />
      }
    ]
  }
};

export const LandingPage: React.FC<LandingPageProps> = ({ onGoToLogin, onGoToRegister, lang, onLangChange }) => {
  const c = t[lang];
  const [scrollY, setScrollY] = useState(0);
  const [activeModal, setActiveModal] = useState<string | null>(null);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div style={{ background: "#090d14", color: "#e2e8f0", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100vh" }}>

      {/* ══ NAVBAR ══ */}
      <nav
        className="pt-safe"
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
          background: scrollY > 50 ? "rgba(9,13,20,.92)" : "transparent",
          backdropFilter: scrollY > 50 ? "blur(20px)" : "none",
          borderBottom: scrollY > 50 ? "1px solid rgba(255,255,255,.07)" : "1px solid transparent",
          transition: "all .3s",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/logo.png" alt="FikoAI" style={{ width: 32, height: 32, borderRadius: 8 }} />
            <span className="font-syne" style={{ fontSize: 20, fontWeight: 700, background: "linear-gradient(135deg, #06b6d4, #8b5cf6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              FikoAI
            </span>
          </div>

          <div className="hidden md:flex" style={{ gap: 28, alignItems: "center" }}>
            {[
              { label: c.nav.features, id: "features" },
              { label: c.nav.why, id: "why" },
              { label: c.nav.pricing, id: "pricing" },
              { label: c.nav.about, id: "about" },
            ].map((item) => (
              <button key={item.id} onClick={() => scrollTo(item.id)}
                style={{ background: "none", border: "none", color: "#8b9ab0", cursor: "pointer", fontSize: 14, fontWeight: 500, fontFamily: "inherit", transition: "color .2s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#e2e8f0")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#8b9ab0")}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Language Toggle */}
            <button onClick={() => onLangChange(lang === "tr" ? "de" : "tr")}
              style={{
                background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)",
                borderRadius: 8, padding: "6px 12px", color: "#8b9ab0", cursor: "pointer",
                fontSize: 12, fontWeight: 600, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <Languages size={14} />
              {lang === "tr" ? "DE" : "TR"}
            </button>

            <button onClick={onGoToLogin}
              style={{ background: "none", border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, padding: "8px 16px", color: "#e2e8f0", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}
            >
              {c.nav.login}
            </button>
            <button onClick={onGoToRegister} className="hidden md:block c-btn-primary"
              style={{ padding: "8px 20px", fontSize: 13 }}
            >
              {c.nav.startFree}
            </button>
          </div>
        </div>
      </nav>

      {/* ══ HERO ══ */}
      <section style={{ position: "relative", overflow: "hidden", paddingTop: 140, paddingBottom: 100, textAlign: "center" }}>
        {/* Background gradient orbs */}
        <div style={{ position: "absolute", top: -200, left: "50%", transform: "translateX(-50%)", width: 800, height: 800, background: "radial-gradient(circle, rgba(6,182,212,.08) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: -100, right: -200, width: 600, height: 600, background: "radial-gradient(circle, rgba(139,92,246,.06) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 1, maxWidth: 900, margin: "0 auto", padding: "0 24px" }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(6,182,212,.1)", border: "1px solid rgba(6,182,212,.2)",
              borderRadius: 100, padding: "6px 18px", fontSize: 13, fontWeight: 600, color: "#06b6d4", marginBottom: 24,
            }}>
              <Sparkles size={14} /> {c.hero.badge}
            </span>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }}
            className="font-syne"
            style={{ fontSize: "clamp(36px, 6vw, 64px)", fontWeight: 700, lineHeight: 1.1, margin: "24px 0 20px" }}
          >
            {c.hero.title1}{" "}
            <span style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {c.hero.titleHighlight}
            </span>{" "}
            {c.hero.title2}
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
            style={{ fontSize: "clamp(15px, 2vw, 18px)", color: "#8b9ab0", maxWidth: 640, margin: "0 auto 40px", lineHeight: 1.7 }}
          >
            {c.hero.subtitle}
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}
            style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}
          >
            <button onClick={onGoToRegister} className="c-btn-primary"
              style={{ padding: "14px 32px", fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}
            >
              {c.hero.cta} <ArrowRight size={18} />
            </button>
          </motion.div>

          {/* Stats */}
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.5 }}
            style={{ display: "flex", justifyContent: "center", gap: 48, marginTop: 64, flexWrap: "wrap" }}
          >
            {[
              { value: "hedef 50K", label: c.hero.stat1 },
              { value: "99.5%", label: c.hero.stat2 },
              { value: "80%", label: c.hero.stat3 },
            ].map((stat, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div className="font-syne" style={{ fontSize: 32, fontWeight: 700, background: "linear-gradient(135deg, #06b6d4, #8b5cf6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══ FEATURES ══ */}
      <section id="features" style={{ padding: "80px 24px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 className="font-syne" style={{ fontSize: 36, fontWeight: 700, marginBottom: 12 }}>{c.features.title}</h2>
          <p style={{ color: "#64748b", fontSize: 16 }}>{c.features.subtitle}</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
          {c.features.items.map((item, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.1 }}
              className="c-card" style={{ padding: 28, cursor: "default" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(6,182,212,.25)";
                e.currentTarget.style.transform = "translateY(-4px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,.07)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(6,182,212,.1)", color: "#06b6d4", marginBottom: 16,
              }}>
                {featureIcons[item.icon]}
              </div>
              <h3 className="font-syne" style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{item.title}</h3>
              <p style={{ color: "#8b9ab0", fontSize: 14, lineHeight: 1.7 }}>{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ══ WHY FIKOAI ══ */}
      <section id="why" style={{ padding: "80px 24px", background: "rgba(255,255,255,.01)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <h2 className="font-syne" style={{ fontSize: 36, fontWeight: 700, marginBottom: 12 }}>{c.why.title}</h2>
            <p style={{ color: "#64748b", fontSize: 16 }}>{c.why.subtitle}</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}>
            {c.why.reasons.map((reason, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }} whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.08 }}
                style={{
                  display: "flex", gap: 16, padding: 24,
                  background: "rgba(15,20,32,.5)", border: "1px solid rgba(255,255,255,.07)",
                  borderRadius: 14, transition: "all .2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(139,92,246,.25)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,.07)")}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(139,92,246,.1)", color: "#8b5cf6",
                }}>
                  {whyIcons[i]}
                </div>
                <div>
                  <h4 className="font-syne" style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{reason.title}</h4>
                  <p style={{ color: "#8b9ab0", fontSize: 13, lineHeight: 1.6 }}>{reason.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ MODERN ACCOUNTING GUIDE ══ */}
      <section style={{ padding: "80px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{ textAlign: "center", marginBottom: 48 }}
          >
            <h3 className="font-syne" style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: "#fff" }}>
              {guideContent[lang].title}
            </h3>
            <p style={{ color: "#8b5cf6", fontSize: 16, fontWeight: 500 }}>
              {guideContent[lang].subtitle}
            </p>
          </motion.div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 24
          }}>
            {guideContent[lang].sections.map((section: any, i: number) => (
              <motion.div
                key={section.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                whileHover={{ y: -8, borderColor: "rgba(139,92,246,0.3)" }}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 20,
                  padding: 24,
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                  transition: "all 0.3s ease"
                }}
              >
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(6,182,212,0.1))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#8b5cf6"
                }}>
                  {section.icon}
                </div>
                <div>
                  <h4 className="font-syne" style={{ fontSize: 18, fontWeight: 600, color: "#fff", marginBottom: 12 }}>
                    {section.title}
                  </h4>
                  <p style={{ color: "#8b9ab0", fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
                    {section.content}
                  </p>
                  <div style={{
                    paddingTop: 16,
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    color: "#06b6d4",
                    fontSize: 12,
                    fontStyle: "italic",
                    lineHeight: 1.5
                  }}>
                    {section.extra}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ PRICING ══ */}
      <section id="pricing" style={{ padding: "80px 24px", maxWidth: 1300, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 className="font-syne" style={{ fontSize: 36, fontWeight: 700, marginBottom: 12 }}>{c.pricing.title}</h2>
          <p style={{ color: "#64748b", fontSize: 16 }}>{c.pricing.subtitle}</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, alignItems: "stretch" }}>
          {c.pricing.plans.map((plan: any, i: number) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.15 }}
              style={{
                position: "relative",
                padding: 32,
                background: plan.popular ? "linear-gradient(145deg, rgba(6,182,212,.08), rgba(139,92,246,.05))" : "rgba(15,20,32,.5)",
                border: plan.popular ? "1px solid rgba(6,182,212,.3)" : "1px solid rgba(255,255,255,.07)",
                borderRadius: 16,
                display: "flex", flexDirection: "column",
              }}
            >
              {plan.popular && (
                <span style={{
                  position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
                  background: "linear-gradient(135deg, #06b6d4, #8b5cf6)", borderRadius: 100,
                  padding: "4px 16px", fontSize: 11, fontWeight: 700, color: "#fff",
                }}>
                  {c.pricing.popular}
                </span>
              )}
              <h3 className="font-syne" style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>{plan.name}</h3>
              <p style={{ color: "#64748b", fontSize: 13, marginBottom: 16 }}>{plan.desc}</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 24 }}>
                <span style={{ fontSize: 14, color: "#64748b" }}>€</span>
                <span className="font-syne" style={{ fontSize: 42, fontWeight: 700 }}>{plan.price}</span>
                {plan.period && <span style={{ color: "#64748b", fontSize: 14 }}>{plan.period}</span>}
              </div>
              <div style={{ flex: 1 }}>
                {plan.features.map((feature: string, fi: number) => (
                  <div key={fi} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, color: "#8b9ab0", fontSize: 13 }}>
                    <CheckCircle2 size={15} style={{ color: "#06b6d4", flexShrink: 0 }} /> {feature}
                  </div>
                ))}
                {plan.excluded?.map((feature: string, fi: number) => (
                  <div key={`ex-${fi}`} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, color: "#3d4e63", fontSize: 13, textDecoration: "line-through" }}>
                    <CheckCircle2 size={15} style={{ color: "#3d4e63", flexShrink: 0 }} /> {feature}
                  </div>
                ))}
              </div>
              <button onClick={plan.isFree ? onGoToRegister : onGoToLogin}
                className={plan.popular ? "c-btn-primary" : plan.isFree ? "c-btn-primary" : "c-btn-ghost"}
                style={{ width: "100%", padding: "12px 0", fontSize: 14, marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                {plan.buttonText} <ChevronRight size={16} />
              </button>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ══ ABOUT ══ */}
      <section id="about" style={{ padding: "80px 24px", background: "rgba(255,255,255,.01)" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <h2 className="font-syne" style={{ fontSize: 36, fontWeight: 700, marginBottom: 20 }}>{c.about.title}</h2>
          <p style={{ color: "#8b9ab0", fontSize: 16, lineHeight: 1.8, whiteSpace: "pre-line", textAlign: "left" }}>{c.about.desc}</p>
        </div>
      </section>

      {/* ══ TRUST / PAYMENT SECTION ══ */}
      <section style={{ padding: "60px 24px", maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
        <h3 className="font-syne" style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>{c.trust.title}</h3>
        <p style={{ color: "#64748b", fontSize: 14, marginBottom: 32 }}>{c.trust.desc}</p>

        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
          {/* SSL Badge */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 20px",
            background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.2)",
            borderRadius: 10, color: "#10b981", fontSize: 13, fontWeight: 600,
          }}>
            <Lock size={16} /> SSL {lang === "tr" ? "Güvenli" : "Sicher"}
          </div>

          {/* Visa */}
          <div style={{
            padding: "8px 20px", background: "rgba(255,255,255,.06)",
            border: "1px solid rgba(255,255,255,.1)", borderRadius: 10,
            fontSize: 18, fontWeight: 800, color: "#1a1f71", letterSpacing: 1,
          }}>
            <span style={{ color: "#e2e8f0", fontFamily: "'Space Grotesk', sans-serif", fontStyle: "italic" }}>VISA</span>
          </div>

          {/* MasterCard */}
          <div style={{
            padding: "8px 20px", background: "rgba(255,255,255,.06)",
            border: "1px solid rgba(255,255,255,.1)", borderRadius: 10,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#eb001b", opacity: 0.9 }} />
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#f79e1b", opacity: 0.9, marginLeft: -12 }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginLeft: 4 }}>mastercard</span>
          </div>

          {/* iyzico */}
          <div style={{
            padding: "6px 16px", background: "rgba(255,255,255,.06)",
            border: "1px solid rgba(255,255,255,.1)", borderRadius: 10,
            display: "flex", alignItems: "center",
          }}>
            <img src="/iyzico-checkout.png" alt="iyzico ile Öde" style={{ height: 28, objectFit: "contain" }} />
          </div>

          {/* PayTR */}
          <div style={{
            padding: "6px 20px", background: "rgba(255,255,255,.06)",
            border: "1px solid rgba(255,255,255,.1)", borderRadius: 10,
            display: "flex", alignItems: "center",
          }}>
            <svg width="80" height="22" viewBox="0 0 120 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <text x="0" y="24" fill="#00C853" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="26">Pay</text>
              <text x="44" y="24" fill="#e2e8f0" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="26">TR</text>
            </svg>
          </div>
        </div>
      </section>

      {/* ══ CTA BANNER ══ */}
      <section style={{ padding: "80px 24px" }}>
        <div style={{
          maxWidth: 900, margin: "0 auto", textAlign: "center", padding: "56px 40px",
          background: "linear-gradient(135deg, rgba(6,182,212,.1), rgba(139,92,246,.08))",
          border: "1px solid rgba(6,182,212,.2)", borderRadius: 20,
        }}>
          <h2 className="font-syne" style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, marginBottom: 16 }}>
            {lang === "tr" ? "Muhasebenizi Dönüştürmeye Hazır mısınız?" : "Bereit, Ihre Buchhaltung zu transformieren?"}
          </h2>
          <p style={{ color: "#8b9ab0", fontSize: 16, marginBottom: 32, maxWidth: 500, margin: "0 auto 32px" }}>
            {lang === "tr"
              ? "Hemen ücretsiz denemeye başlayın. Kredi kartı gerekmez."
              : "Starten Sie jetzt Ihre kostenlose Testversion. Keine Kreditkarte erforderlich."}
          </p>
          <button onClick={onGoToRegister} className="c-btn-primary"
            style={{ padding: "16px 40px", fontSize: 16, display: "inline-flex", alignItems: "center", gap: 10 }}
          >
            {c.hero.cta} <ArrowRight size={20} />
          </button>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer style={{ borderTop: "1px solid rgba(255,255,255,.07)", padding: "48px 24px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          {/* Top row */}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 40, marginBottom: 40 }}>
            {/* Brand */}
            <div style={{ maxWidth: 300 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <img src="/logo.png" alt="FikoAI" style={{ width: 28, height: 28, borderRadius: 6 }} />
                <span className="font-syne" style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>FikoAI</span>
              </div>
              <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.7 }}>
                {lang === "tr"
                  ? "Yapay zeka destekli muhasebe çözümü. Almanya ve Avrupa'daki KOBİ'ler için tasarlandı."
                  : "KI-gestützte Buchhaltungslösung. Entwickelt für KMU in Deutschland und Europa."}
              </p>
            </div>

            {/* Legal Links */}
            <div>
              <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "#3d4e63", marginBottom: 16 }}>
                {lang === "tr" ? "Yasal" : "Rechtliches"}
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { id: "about", label: c.footer.about },
                  { id: "ssl", label: lang === "tr" ? "Güvenlik" : "Sicherheit" },
                  { id: "deliveryReturn", label: c.footer.delivery },
                  { id: "privacy", label: c.footer.privacy },
                  { id: "distanceSelling", label: c.footer.distance },
                ].map((link, i) => (
                  <button key={i} onClick={() => {
                    if (link.id === "about") {
                      scrollTo("about");
                    } else {
                      setActiveModal(link.id);
                    }
                  }}
                    style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", color: "#8b9ab0", fontSize: 13, transition: "color .2s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#e2e8f0")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#8b9ab0")}
                  >
                    {link.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Contact */}
            <div>
              <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "#3d4e63", marginBottom: 16 }}>
                {lang === "tr" ? "İletişim" : "Kontakt"}
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, color: "#8b9ab0", fontSize: 13 }}>
                <span>cevikhann@gmail.com</span>
                <span>Türkiye</span>
              </div>
            </div>

            {/* Payment Logos (compact) */}
            <div>
              <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "#3d4e63", marginBottom: 16 }}>
                {c.footer.secure}
              </h4>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ padding: "4px 12px", background: "rgba(255,255,255,.05)", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                  <Lock size={12} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                  <span style={{ verticalAlign: "middle", color: "#10b981" }}>SSL</span>
                </div>
                <div style={{ padding: "4px 12px", background: "rgba(255,255,255,.05)", borderRadius: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", fontStyle: "italic" }}>VISA</span>
                </div>
                <div style={{ padding: "4px 12px", background: "rgba(255,255,255,.05)", borderRadius: 6, display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#eb001b" }} />
                  <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#f79e1b", marginLeft: -8 }} />
                </div>
                <div style={{ padding: "2px 8px", background: "rgba(255,255,255,.05)", borderRadius: 6, display: "flex", alignItems: "center" }}>
                  <img src="/iyzico-footer.png" alt="iyzico" style={{ height: 18, objectFit: "contain" }} />
                </div>
                <div style={{ padding: "2px 10px", background: "rgba(255,255,255,.05)", borderRadius: 6, display: "flex", alignItems: "center" }}>
                  <svg width="48" height="14" viewBox="0 0 120 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <text x="0" y="24" fill="#00C853" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="26">Pay</text>
                    <text x="44" y="24" fill="#e2e8f0" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="26">TR</text>
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom */}
          <div style={{
            borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: 20,
            display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12,
          }}>
            <span style={{ color: "#3d4e63", fontSize: 12 }}>
              © {new Date().getFullYear()} FikoAI. {c.footer.rights}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ color: "#3d4e63", fontSize: 11 }}>Made with AI in Germany</span>
            </div>
          </div>
        </div>
      </footer>

      {activeModal === "ssl" && <SecurityCertificatesModal onClose={() => setActiveModal(null)} />}
      {activeModal === "deliveryReturn" && (
        <LegalModal title={c.footer.delivery} icon={Zap} onClose={() => setActiveModal(null)}>
          <DeliveryReturnPanel />
        </LegalModal>
      )}
      {activeModal === "privacy" && (
        <LegalModal title={c.footer.privacy} icon={Shield} onClose={() => setActiveModal(null)}>
          <PrivacyPolicyPanel />
        </LegalModal>
      )}
      {activeModal === "distanceSelling" && (
        <LegalModal title={c.footer.distance} icon={FileText} onClose={() => setActiveModal(null)}>
          <DistanceSellingPanel />
        </LegalModal>
      )}
    </div>
  );
};
