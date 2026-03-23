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
          <h1 className="text-3xl font-bold font-syne text-white">Gizlilik Sözleşmesi</h1>
        </div>
        
        <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-8 mb-8 backdrop-blur-sm text-sm">
          <h2 className="text-lg font-semibold text-white mb-3">1. Veri Sorumlusu ve Yasal Dayanak (KVKK & GDPR)</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            FikoAI ("Veri Sorumlusu") olarak, platformumuza üye olan ve hizmetlerimizi kullanan tüm kullanıcılarımızın verilerini 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") ve Avrupa Birliği Genel Veri Koruma Tüzüğü ("GDPR") kapsamında en yüksek güvenlik standartlarıyla işlemekteyiz. Tüm veri akışı 256-Bit SSL/TLS 1.3 alt yapısında şifrelenmektedir.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">2. Toplanan Veriler ve İşleme Amaçları</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            <strong>Kimlik ve İletişim Verileri:</strong> Ad, soyad, e-posta adresi, firma unvanı, VKN/TCKN bilgileri; hizmet sözleşmesinin kurulması, faturalandırma ve hesabınızın güvenliği amacıyla.<br/>
            <strong>Finansal ve Muhasebe Verileri:</strong> Sisteme yüklediğiniz PDF faturalar ve banka ekstresi dökümleri; yapay zeka aracılığıyla salt muhasebeleştirme ve raporlama hizmetinin ("Sözleşmenin İfası") sunulması amacıyla.<br/>
            <strong>İşlem Güvenliği Verileri:</strong> IP adresi ve log kayıtları; yasal yükümlülüklerin (Örn. 5651 Sayılı Kanun) yerine getirilmesi amacıyla toplanır.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">3. Yapay Zeka (AI) ve Veri Gizliliği Çerçevesi</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            Sisteme yüklediğiniz tüm finansal evraklar, Google Gemini ve Tesseract OCR alt yapıları kullanılarak cihazınızın ve güvenli sunucularımızın entegrasyonu ile <strong>yalnızca anlık analiz işlemi için</strong> işlenir. Altını çizerek belirtmek isteriz ki; finansal belgeleriniz veya şirket verileriniz, yapay zeka modellerinin genel bağlamda eğitilmesi (Training) sürecinde <strong>KULLANILMAZ</strong>. Fiş, fatura veya PDF verileriniz, arayüz üzerinden sildiğiniz anda veritabanımızdan (Supabase RLS altyapısı ile kriptolanmış alanlardan) kalıcı olarak yok edilir.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">4. Veri Aktarımı ve Üçüncü Taraflar</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            Kullanıcı ve şirket verileriniz, kanuni bir zorunluluk bulunmadıkça hiçbir reklam/pazarlama ajansı veya yetkisiz üçüncü şahısla paylaşılmaz. Ancak hizmetin doğası gereği; ödeme işlemleri için BDDK onaylı <strong>iyzico</strong> kurumuyla finansal verileriniz kapalı devre güvenli API'ler üzerinden iletilir. Bulut sistemi olarak sertifikalı Supabase mimarisi kullanılmaktadır.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">5. Çerez (Cookie) Kullanımı</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            FikoAI platformu yalnızca uygulamanın düzgün çalışması ve kullanıcı oturum güvenliğini sağlayan "Zorunlu Çerezler" (Session/Auth/JWT Cookies) kullanmaktadır. İradeniz dışında çalışan, profilleme amaçlı agresif takip (tracking) harici çerezleri sistemimizde yer almaz.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">6. Haklarınız (KVKK Hakları / GDPR)</h2>
          <p className="text-slate-300 leading-relaxed">
            İlgili kişi sıfatıyla KVKK m.11 ve GDPR kapsamında; verilerinizin işlenip işlenmediğini öğrenme, silinmesini (Unutulma Hakkı) veya yok edilmesini isteme, aktarılan üçüncü kişileri bilme ve rızanızı geri çekme haklarına tam olarak sahipsiniz. Başvurularınızı yasal veri sorumlusu kayıtlı e-postası <strong>cevikhann@gmail.com</strong> adresi üzerinden iletebilirsiniz. Yasal süre olan 30 gün içinde titizlikle yanıtlanacaktır.
          </p>
        </div>
      </div>
    </div>
  );
}
