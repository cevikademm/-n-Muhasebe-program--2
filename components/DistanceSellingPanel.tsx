import React from "react";
import { FileText } from "lucide-react";

export function DistanceSellingPanel() {
  return (
    <div className="flex-1 w-full h-full overflow-y-auto" style={{ background: "#111318", color: "#e2e8f0" }}>
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 rounded-2xl bg-cyan-500/10 text-cyan-400">
            <FileText size={28} />
          </div>
          <h1 className="text-3xl font-bold font-syne text-white">Mesafeli Satış Sözleşmesi</h1>
        </div>
        
        <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-8 mb-8 backdrop-blur-sm text-sm">
          <h2 className="text-lg font-semibold text-white mb-3">MADDE 1 - TARAFLAR</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            <strong>SATICI (HİZMET SAĞLAYICI):</strong><br/>
            Unvanı: FikoAI Yazılım Çözümleri<br/>
            E-Posta: cevikhann@gmail.com<br/>
            <br/>
            <strong>ALICI (MÜŞTERİ):</strong><br/>
            Web platformuna kayıt olarak dijital hizmet (SaaS) satın alan, sistemde kayıtlı e-posta, unvan ve VKN/TC bilgileri esas alınan ticari işletme yetkilisi veya doğrudan kullanıcı. (Sözleşme kapsamında ALICI olarak anılacaktır.)
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">MADDE 2 - KONU VE YASAL DAYANAK</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            İşbu sözleşmenin konusu ve yasal dayanağı; ALICI'nın SATICI'ya ait "FikoAI" dijital muhasebe platformundan elektronik ortamda siparişini verdiği aboneliğe dair olarak 6502 Sayılı Tüketicinin Korunması Hakkında Kanun ve <strong>Mesafeli Sözleşmeler Yönetmeliği (RG:27.11.2014/29188)</strong> hükümleri gereğince paket satışı, ifası, iade edilemezliği ve hukuki koşulların güvence altına alınmasıdır.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">MADDE 3 - SİPARİŞ, ÖDEME VE TESLİMAT (İFA) KOŞULLARI</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            3.1. Ürün abonelik bedelleri, limit özellikleri ve kullanım periyotları (Aylık/Yıllık) platformdaki "Fiyatlandırma" sekmesinde ve sepet onayında şeffafça bildirilmiştir.<br/>
            3.2. Satın alınan dijital paket tutarı, BBDK onaylı iyzico güvenli sanal POST altyapısı kullanılarak 256-Bit SSL sertifikası güvencesinde tahsil edilir.<br/>
            3.3. İşbu sözleşmeye konu olan ürün bir "SaaS (Hizmet Olarak Yazılım)" olduğundan, bedel tahsil edildiği andan itibaren, herhangi bir manuel onaya tabi olmaksızın ALICI'nın kullanım paneline <strong>anında elektronik ortamda teslim ve ifa</strong> edilir.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">MADDE 4 - CAYMA HAKKI VE HUKUKİ İSTİSNASI (ÖNEMLİ)</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            ALICI, yasal mevzuat olan Mesafeli Sözleşmeler Yönetmeliği'nin <strong>"Cayma Hakkının İstisnaları" başlıklı 15. maddesi 1. fıkrası (ğ) bendi</strong> (<em>"Elektronik ortamda anında ifa edilen hizmetlere veya tüketiciye anında teslim edilen gayrimaddi mallara ilişkin sözleşmeler"</em>) gereğince, satın aldığı yapay zeka aboneliğinin niteliği dolayısı ile <strong>CAYMA HAKKININ BULUNMADIĞINI</strong> açıkça bildiğini, okuduğunu ve elektronik onay butonuyla kayıtsız şartsız kabul ettiğini beyan eder. Sözleşme onaylanıp hizmet ifa edildiğinde "koşulsuz iade/cayma hakkı" tamamen sona erer.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">MADDE 5 - KULLANIM SINIRLARI VE SORUMLULUK REDDİ</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            5.1. SATICI; FATURA Cinsi belgelerin OCR teknolojisi ile işlenmesi aşamasında SLA bazlı %99'un üzerinde sistem up-time'ı ve yapay zeka işlem kapasitesi tahsis etmeyi taahhüt eder.<br/>
            5.2. ALICI, hukuka, kamu ahlakına ve ilgili regülasyonlara aykırı manipülatif (sahte) belgeleri sisteme yüklememeyi; sisteme tersine mühendislik (reverse engineering) yapmayacağını kabul eder. Fesih halinde maddi/manevi tazminat hakları saklıdır.<br/>
            5.3. SATICI tarafından sağlanan OCR verileri bir "Ön Analiz" işlemidir. Dışa aktarılan muhasebe fişleri (örn: DATEV ihracatı), beyan edilmeden önce ALICI'nın yasal yetkili mali müşaviri tarafından kontrol edilmelidir. Meydana gelebilecek mali idareye karşı (vergi cezası vb.) olası kayıplardan SATICI yazılım kurumu sorumlu tutulamaz.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">MADDE 6 - YETKİLİ ADLİ MERCİLER</h2>
          <p className="text-slate-300 leading-relaxed">
            İşbu sözleşmenin uygulanmasından veya yorumlanmasından doğacak her türlü ihtilaf halinde, yasal sınırlar dâhilinde ALICI'nın yerleşim yerindeki <strong>Tüketici Hakem Heyetleri</strong>; sınır aşımı durumunda ise yerel/bölgesel <strong>Tüketici Mahkemeleri</strong> (ve tacirler için Ticaret Mahkemeleri) tam yetkilidir. Sipariş ödemesini tamamlayarak "Sipariş Ver" veya "Paketi Seç" aşamasını bitiren ALICI, sözleşmenin tamamını okumuş, anlamış ve e-İmza/elektronik onay muadili bir yöntemle kabul etmiş sayılır.
          </p>
        </div>
      </div>
    </div>
  );
}
