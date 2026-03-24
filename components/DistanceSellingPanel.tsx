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
          <p className="text-xs text-slate-500 mb-5">Son güncelleme: 24.03.2026 — Yürürlük tarihi: 24.03.2026</p>

          <h2 className="text-lg font-semibold text-white mb-3">MADDE 1 — TARAFLAR</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            <strong>SATICI (HİZMET SAĞLAYICI):</strong><br/>
            Unvanı: FikoAI Yazılım Çözümleri<br/>
            Merkez: Türkiye<br/>
            Vergi Durumu: T.C. mevzuatına tabi, fatura kesmeye yetkili ticari işletme<br/>
            E-Posta: cevikhann@gmail.com<br/>
            <br/>
            <strong>ALICI (MÜŞTERİ):</strong><br/>
            Web platformuna kayıt olarak dijital hizmet (SaaS) satın alan, sistemde kayıtlı e-posta, unvan ve VKN/TC bilgileri esas alınan ticari işletme yetkilisi veya bireysel kullanıcı. (Sözleşme kapsamında "ALICI" olarak anılacaktır.)
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">MADDE 2 — KONU VE YASAL DAYANAK</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            İşbu sözleşmenin konusu; ALICI'nın SATICI'ya ait "FikoAI" dijital muhasebe platformundan elektronik ortamda siparişini verdiği aboneliğe dair hak ve yükümlülüklerin belirlenmesidir.
            <br/><br/>
            <strong>Yasal dayanak:</strong> 6502 Sayılı Tüketicinin Korunması Hakkında Kanun ve <strong>Mesafeli Sözleşmeler Yönetmeliği (RG: 27.11.2014/29188)</strong> hükümleri uygulanır. Tacirler arası işlemlerde 6102 sayılı Türk Ticaret Kanunu hükümleri saklıdır.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">MADDE 3 — HİZMET BİLGİLERİ VE FİYATLANDIRMA</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            3.1. Satışa konu hizmet, yapay zeka destekli dijital ön muhasebe yazılımı (SaaS) aboneliğidir.<br/>
            3.2. Abonelik bedelleri, limit özellikleri ve kullanım periyotları (Aylık/3 Aylık/Yıllık) platformdaki "Fiyatlandırma" bölümünde ve ödeme onay ekranında açıkça belirtilmiştir.<br/>
            3.3. Tüm fiyatlara KDV dahildir. Fatura bedeli Türk Lirası veya Euro cinsinden tahsil edilebilir.<br/>
            3.4. SATICI, fiyatları önceden duyurmak kaydıyla değiştirme hakkını saklı tutar. Mevcut abonelik döneminde fiyat değişikliği uygulanmaz.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">MADDE 4 — SİPARİŞ, ÖDEME VE TESLİMAT (İFA)</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            4.1. Ödeme, güvenli sanal POS altyapısı kullanılarak 256-Bit SSL sertifikası güvencesinde tahsil edilir.<br/>
            4.2. İşbu sözleşmeye konu hizmet bir "SaaS" olduğundan, bedel tahsil edildiği andan itibaren ALICI'nın kullanım paneline <strong>anında elektronik ortamda teslim ve ifa</strong> edilir.<br/>
            4.3. Her başarılı ödeme işlemi için ALICI'nın kayıt bilgileriyle e-fatura / e-arşiv fatura düzenlenir ve kayıtlı e-posta adresine iletilir.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">MADDE 5 — CAYMA HAKKI VE HUKUKİ İSTİSNASI</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            5.1. Mesafeli Sözleşmeler Yönetmeliği'nin <strong>"Cayma Hakkının İstisnaları" başlıklı 15. maddesi 1. fıkrası (ğ) bendi</strong> (<em>"Elektronik ortamda anında ifa edilen hizmetlere veya tüketiciye anında teslim edilen gayrimaddi mallara ilişkin sözleşmeler"</em>) gereğince, ALICI'nın yasal cayma hakkı bulunmamaktadır.<br/><br/>
            5.2. ALICI, satın alma işlemini tamamlamadan önce bu durumu açıkça kabul ettiğine dair elektronik onay verir. Bu ön bilgilendirme onayı verilmeksizin satış işlemi tamamlanmaz.<br/><br/>
            5.3. Cayma hakkının bulunmaması, Madde 7'deki iyi niyet iade koşullarını ortadan kaldırmaz.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">MADDE 6 — ÖN BİLGİLENDİRME YÜKÜMLÜLÜĞÜ</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            6502 sayılı Kanun m.48 ve Mesafeli Sözleşmeler Yönetmeliği m.5 gereğince SATICI, sözleşme kurulmadan önce ALICI'yı aşağıdaki hususlarda bilgilendirmiştir:<br/><br/>
            &bull; Hizmetin temel nitelikleri<br/>
            &bull; SATICI'nın kimlik ve iletişim bilgileri<br/>
            &bull; Hizmet bedeli (tüm vergiler dahil)<br/>
            &bull; Ödeme ve teslimat (ifa) bilgileri<br/>
            &bull; Cayma hakkının bulunmadığı ve bunun hukuki dayanağı<br/>
            &bull; Şikayet ve itiraz başvuru mercileri<br/>
            <br/>
            ALICI, işbu ön bilgilendirmeyi elektronik ortamda okuduğunu ve onayladığını kabul eder.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">MADDE 7 — İYİ NİYET İADE KOŞULLARI</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            Yasal cayma hakkı istisnasına rağmen FikoAI, aşağıdaki özel durumlarda ücret iadesi yapabilir:<br/><br/>
            &bull; <strong>Sistem kaynaklı kesinti:</strong> Mücbir sebepler dışında 48 saatten fazla erişim kesintisi<br/>
            &bull; <strong>Kullanılmamış hizmet:</strong> Hiçbir veri yüklememiş/işlememiş ALICI'nın ilk 72 saat içinde yazılı talebi<br/>
            &bull; <strong>Mükerrer ödeme:</strong> Teknik hata sonucu çift ödeme durumunda fazla tutar derhal iade edilir
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">MADDE 8 — KULLANIM SINIRLARI VE SORUMLULUK</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            8.1. SATICI, %99'un üzerinde sistem çalışma süresi (uptime) hedeflemektedir. Planlı bakım çalışmaları önceden duyurulur.<br/>
            8.2. ALICI, hukuka ve kamu ahlakına aykırı sahte/manipülatif belgeleri sisteme yüklemeyeceğini; sisteme tersine mühendislik yapmayacağını kabul eder. Aksi durumda SATICI hesabı askıya alma ve yasal yollara başvurma hakkını saklı tutar.<br/>
            8.3. FikoAI tarafından sunulan OCR ve AI destekli veriler bir <strong>"ön analiz"</strong> niteliğindedir. Dışa aktarılan muhasebe verileri, beyan edilmeden önce ALICI'nın yetkili mali müşaviri tarafından kontrol edilmelidir. Vergi beyannamesi kaynaklı mali yaptırımlardan SATICI sorumlu tutulamaz.<br/>
            8.4. SATICI'nın toplam sorumluluğu, ALICI'nın son 12 ay içinde ödediği hizmet bedeli ile sınırlıdır.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">MADDE 9 — FİKRİ MÜLKİYET HAKLARI</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            FikoAI platformunun tüm fikri ve sınai mülkiyet hakları SATICI'ya aittir. ALICI'ya yalnızca abonelik süresi boyunca sınırlı, münhasır olmayan kullanım lisansı verilir. Çoğaltma, dağıtma, kaynak kod elde etme girişimi yasaktır.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">MADDE 10 — KİŞİSEL VERİLERİN KORUNMASI</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            ALICI'nın kişisel verileri, Gizlilik ve Kişisel Verilerin Korunması Sözleşmesi'nde belirtilen esaslar çerçevesinde KVKK ve GDPR'a uygun olarak işlenir. ALICI, sözleşmeyi onaylamadan önce ilgili gizlilik sözleşmesini de ayrıca okumuş ve onaylamış olmalıdır.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">MADDE 11 — SÖZLEŞME DEĞİŞİKLİKLERİ</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            SATICI, işbu sözleşmeyi makul süre öncesinden (en az 30 gün) bildirimde bulunarak değiştirme hakkını saklı tutar. Değişiklikler kayıtlı e-posta ve/veya platform üzerinden duyurulur. ALICI, değişikliği kabul etmemesi halinde aboneliğini dönem sonunda sonlandırabilir.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">MADDE 12 — MÜCBİR SEBEPLER</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            Doğal afet, savaş, pandemi, yasal düzenleme değişikliği, internet altyapı kesintisi gibi tarafların kontrolü dışındaki mücbir sebep hallerinde taraflar yükümlülüklerinden muaf tutulur.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">MADDE 13 — UYUŞMAZLIK ÇÖZÜMÜ VE YETKİLİ MERCİLER</h2>
          <p className="text-slate-300 leading-relaxed mb-5">
            13.1. İşbu sözleşmeden doğan uyuşmazlıklarda öncelikle dostane çözüm yolları aranacaktır.<br/>
            13.2. Tüketici işlemlerinde: Ticaret Bakanlığı'nca ilan edilen parasal sınırlar dahilinde <strong>Tüketici Hakem Heyetleri</strong>; sınır aşımında <strong>Tüketici Mahkemeleri</strong> yetkilidir.<br/>
            13.3. Tacirler arası işlemlerde: SATICI'nın merkezinin bulunduğu yer <strong>Ticaret Mahkemeleri</strong> yetkilidir.<br/>
            13.4. <strong>Uygulanacak Hukuk:</strong> Türkiye Cumhuriyeti hukuku uygulanır.
          </p>

          <h2 className="text-lg font-semibold text-white mb-3 mt-6">MADDE 14 — YÜRÜRLÜK</h2>
          <p className="text-slate-300 leading-relaxed">
            İşbu sözleşme, ALICI'nın platformda kayıt olurken sözleşmeyi elektronik ortamda onaylaması ile yürürlüğe girer. ALICI, sözleşmenin tamamını okuduğunu, anladığını ve kabul ettiğini beyan eder.
          </p>
        </div>
      </div>
    </div>
  );
}
