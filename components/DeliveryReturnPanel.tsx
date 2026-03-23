import React from "react";
import { Truck } from "lucide-react";

export function DeliveryReturnPanel() {
  return (
    <div className="flex-1 w-full h-full overflow-y-auto" style={{ background: "#111318", color: "#e2e8f0" }}>
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 rounded-2xl bg-cyan-500/10 text-cyan-400">
            <Truck size={28} />
          </div>
          <h1 className="text-3xl font-bold font-syne text-white">Teslimat ve İade Şartları</h1>
        </div>
        
        <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-8 mb-8 backdrop-blur-sm">
          <h2 className="text-xl font-semibold text-white mb-4">1. Teslimat Şartları ve Kapsamı</h2>
          <p className="text-slate-300 leading-relaxed mb-6">
            Satın almış olduğunuz FikoAI Yazılım lisansları, hizmet paketleri ve aylık/yıllık abonelikler tamamen dijital ("SaaS - Software as a Service") yapıdadır. Ödeme işleminin ödeme altyapısı (iyzico) üzerinden başarıyla gerçekleşmesinin ardından, satın alınan hizmet kullanıcının hesabına <strong>anında ve otomatik olarak</strong> tanımlanır. Herhangi bir fiziksel kargo veya evrak gönderimi süreci bulunmamaktadır. Hizmetin aktif olduğu, kayıtlı e-posta adresinize anında iletilir.
          </p>

          <h2 className="text-xl font-semibold text-white mb-4 mt-8">2. Cayma Hakkı ve Yasal İstisnaları</h2>
          <p className="text-slate-300 leading-relaxed mb-6">
            6502 sayılı Tüketicinin Korunması Hakkında Kanun ve <strong>Mesafeli Sözleşmeler Yönetmeliği Madde 15/1-ğ bendi</strong> uyarınca, <em>"Elektronik ortamda anında ifa edilen hizmetler veya tüketiciye anında teslim edilen gayrimaddi mallara ilişkin sözleşmeler"</em> cayma hakkının istisnaları arasındadır. ALICI, alınan abonelik ve fatura işleme paketlerinin dijital içerik olduğunu, satın alım tamamlanıp hizmet anında ifa edildiği anda (hesaba tanımlandığında) <strong>cayma hakkını yasal olarak yitirdiğini</strong> peşinen kabul ve beyan eder.
          </p>

          <h2 className="text-xl font-semibold text-white mb-4 mt-8">3. İade Koşulları (Özel Durumlar)</h2>
          <p className="text-slate-300 leading-relaxed mb-6">
            Yukarıda belirtilen yasal cayma hakkı istisnasına rağmen FikoAI, müşteri memnuniyeti adına aşağıdaki özel durumlarda ücret iadesi yapabilir:
            <br/><br/>
            &bull; <strong>Sistem Kaynaklı Kesintiler:</strong> Hizmete erişimin FikoAI kaynaklı bir sunucu veya altyapı arızası sebebiyle mücbir sebepler dışında art arda 48 saatten fazla kesintiye uğraması.<br/>
            &bull; <strong>Hizmetin Kullanılmamış Olması:</strong> Kullanıcının paket satın almasına rağmen, sisteme hiçbir fatura veya banka dokümanı <strong>yüklememiş/işlememiş</strong> olması kaydıyla, satın alım anından itibaren ilk 3 gün (72 saat) içerisinde yazılı talepte bulunulması.
          </p>

          <h2 className="text-xl font-semibold text-white mb-4 mt-8">4. İade İşlem Süreci</h2>
          <p className="text-slate-300 leading-relaxed mb-6">
            Onaylanan iade ödemeleri, işlemi gerçekleştirdiğiniz ödeme yöntemine (iyzico vb.) ve bankanıza bağlı olarak, iade talebinin FikoAI tarafından onaylanmasından itibaren <strong>3 ile 10 iş günü</strong> içerisinde ekstrenize yansıtılır. Taksitli işlemlerin iadeleri bankalar tarafından taksitli olarak yansıtılabilir.
          </p>

          <h2 className="text-xl font-semibold text-white mb-4 mt-8">5. İletişim ve Talepler</h2>
          <p className="text-slate-300 leading-relaxed">
            Her türlü talep, teknik destek ve iptal bildirimleriniz kayıtlı kullanıcı e-postanız üzerinden yazılı olarak <strong>cevikhann@gmail.com</strong> adresine iletilmelidir. İletilen talepler maksimum 48 saat içerisinde değerlendirilerek sonucu tarafınıza bildirilecektir.
          </p>
        </div>
      </div>
    </div>
  );
}
