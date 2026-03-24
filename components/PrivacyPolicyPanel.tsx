import React from "react";
import { ShieldAlert } from "lucide-react";

export function PrivacyPolicyPanel() {
  return (
    <div className="flex-1 w-full h-full overflow-y-auto" style={{ background: "#111318", color: "#e2e8f0" }}>
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 rounded-2xl bg-cyan-500/10 text-cyan-400">
            <ShieldAlert size={28} />
          </div>
          <h1 className="text-3xl font-bold font-syne text-white">Gizlilik ve Kişisel Verilerin Korunması Sözleşmesi</h1>
        </div>

        <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-8 mb-8 backdrop-blur-sm text-sm">
          <p className="text-xs text-slate-500 mb-5">Son güncelleme: 24.03.2026 — Yürürlük tarihi: 24.03.2026</p>

          <h2 className="text-lg font-semibold text-white mb-3">1. Veri Sorumlusu Bilgileri</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            <strong>Unvan:</strong> FikoAI Yazılım Çözümleri<br/>
            <strong>Merkez:</strong> Türkiye<br/>
            <strong>İletişim:</strong> cevikhann@gmail.com<br/>
            <br/>
            FikoAI ("Veri Sorumlusu"), Türkiye Cumhuriyeti'nde yerleşik, fatura kesmeye yetkili bir ticari işletme olup platformumuza üye olan ve hizmetlerimizi kullanan tüm kullanıcılarımızın kişisel verilerini <strong>6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK")</strong> ve ilgili ikincil mevzuat kapsamında en yüksek güvenlik standartlarıyla işlemektedir.
            <br/><br/>
            Avrupa Birliği'nde ikamet eden kullanıcılar için ayrıca <strong>Genel Veri Koruma Tüzüğü ("GDPR")</strong> hükümleri de uygulanır.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">2. Toplanan Kişisel Veriler ve İşleme Amaçları</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            <strong>a) Kimlik ve İletişim Verileri:</strong> Ad, soyad, e-posta adresi, telefon numarası, firma unvanı, VKN/TCKN bilgileri — hizmet sözleşmesinin kurulması, faturalandırma ve hesap güvenliği amacıyla (KVKK m.5/2-c: sözleşmenin ifası).<br/><br/>
            <strong>b) Finansal ve Muhasebe Verileri:</strong> Sisteme yüklenen PDF faturalar ve banka ekstresi dökümleri — yapay zeka aracılığıyla muhasebeleştirme ve raporlama hizmetinin sunulması amacıyla (KVKK m.5/2-c: sözleşmenin ifası).<br/><br/>
            <strong>c) İşlem Güvenliği Verileri:</strong> IP adresi, tarayıcı bilgisi ve oturum logları — 5651 sayılı Kanun gereği yasal yükümlülüklerin yerine getirilmesi amacıyla (KVKK m.5/2-ç: hukuki yükümlülük).<br/><br/>
            <strong>d) Ödeme Verileri:</strong> Kredi kartı bilgileri doğrudan FikoAI sunucularında saklanmaz; ödeme altyapısı sağlayıcısı tarafından PCI-DSS uyumlu ortamda işlenir.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">3. Kişisel Verilerin İşlenmesinin Hukuki Dayanağı</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            Kişisel verileriniz aşağıdaki hukuki sebeplere dayanılarak işlenmektedir:<br/>
            &bull; KVKK m.5/2-c: Bir sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması<br/>
            &bull; KVKK m.5/2-ç: Veri sorumlusunun hukuki yükümlülüğünü yerine getirmesi (VUK, TTK, 5651 s.K.)<br/>
            &bull; KVKK m.5/2-f: İlgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla veri sorumlusunun meşru menfaati<br/>
            &bull; KVKK m.5/1: Açık rıza (yalnızca yukarıdaki hukuki sebeplerin kapsamı dışında kalan işlemler için)
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">4. Yapay Zeka (AI) ve Veri Gizliliği Çerçevesi</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            Sisteme yüklenen tüm finansal evraklar, Google Gemini ve Tesseract OCR altyapıları kullanılarak <strong>yalnızca anlık analiz işlemi için</strong> işlenir. Finansal belgeleriniz veya şirket verileriniz, yapay zeka modellerinin eğitilmesi (training) sürecinde <strong>KESİNLİKLE KULLANILMAZ</strong>.
            <br/><br/>
            Verileriniz arayüz üzerinden sildiğiniz anda veritabanından (Supabase RLS altyapısı ile erişim kontrollü alanlardan) kalıcı olarak yok edilir.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">5. Veri Aktarımı ve Üçüncü Taraflar</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            Kişisel verileriniz, kanuni zorunluluk bulunmadıkça reklam/pazarlama ajansları veya yetkisiz üçüncü kişilerle paylaşılmaz. Hizmetin doğası gereği aşağıdaki üçüncü taraflarla veri paylaşımı yapılmaktadır:<br/><br/>
            &bull; <strong>Ödeme altyapısı sağlayıcısı</strong> — ödeme işlemlerinin güvenli şekilde gerçekleştirilmesi amacıyla<br/>
            &bull; <strong>Supabase (bulut veritabanı)</strong> — veri saklama ve erişim kontrolü amacıyla<br/>
            &bull; <strong>Google Gemini API</strong> — fatura/belge analizi amacıyla (veriler kalıcı olarak saklanmaz)<br/>
            <br/>
            <strong>Yurt dışı veri aktarımı:</strong> Yukarıdaki hizmet sağlayıcılarının sunucuları yurt dışında bulunabilir. KVKK m.9 ve GDPR m.46 kapsamında gerekli güvenlik tedbirleri (standart sözleşme hükümleri vb.) alınmaktadır.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">6. Veri Saklama Süresi</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            Kişisel verileriniz, işleme amacının gerektirdiği süre boyunca saklanır. Yasal saklama yükümlülükleri (VUK: 5 yıl, TTK: 10 yıl, 5651 s.K.: 2 yıl log kaydı) saklıdır. Yasal sürelerin dolmasının ardından verileriniz re'sen silinir, yok edilir veya anonim hale getirilir.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">7. Çerez (Cookie) Kullanımı</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            FikoAI platformu yalnızca uygulamanın düzgün çalışması ve kullanıcı oturum güvenliğini sağlayan <strong>zorunlu çerezler</strong> (Session/Auth/JWT Cookies) kullanmaktadır. Profilleme amaçlı takip çerezleri sistemimizde yer almaz.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">8. İlgili Kişi Hakları (KVKK m.11 / GDPR)</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            KVKK m.11 ve GDPR kapsamında aşağıdaki haklara sahipsiniz:<br/><br/>
            &bull; Kişisel verilerinizin işlenip işlenmediğini öğrenme<br/>
            &bull; İşlenmişse buna ilişkin bilgi talep etme<br/>
            &bull; İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme<br/>
            &bull; Yurt içinde/dışında aktarıldığı üçüncü kişileri bilme<br/>
            &bull; Eksik/yanlış işlenmiş verilerin düzeltilmesini isteme<br/>
            &bull; KVKK m.7 şartları çerçevesinde silinmesini/yok edilmesini isteme (Unutulma Hakkı)<br/>
            &bull; Düzeltme/silme işlemlerinin aktarılan üçüncü kişilere bildirilmesini isteme<br/>
            &bull; İşlenen verilerin münhasıran otomatik sistemlerle analiz edilmesi suretiyle aleyhinize bir sonucun ortaya çıkmasına itiraz etme<br/>
            &bull; Kanuna aykırı işleme sebebiyle zarara uğranması halinde tazminat talep etme<br/>
            <br/>
            Başvurularınızı kayıtlı e-posta adresiniz üzerinden <strong>cevikhann@gmail.com</strong> adresine iletebilirsiniz. Talepler yasal süre olan <strong>30 gün</strong> içinde yanıtlanacaktır.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">9. Veri Güvenliği Tedbirleri</h2>
          <p className="text-slate-300 leading-relaxed">
            FikoAI, kişisel verilerin hukuka aykırı olarak işlenmesini ve erişilmesini önlemek ile verilerin muhafazasını sağlamak amacıyla KVKK m.12 gereği gerekli teknik ve idari tedbirleri almaktadır: 256-Bit SSL/TLS şifreleme, Supabase Row Level Security (RLS), erişim log kayıtları ve düzenli güvenlik denetimleri uygulanmaktadır.
          </p>
        </div>
      </div>
    </div>
  );
}
