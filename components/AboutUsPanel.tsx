import React from "react";
import { Info } from "lucide-react";

export function AboutUsPanel() {
  return (
    <div className="flex-1 w-full h-full overflow-y-auto" style={{ background: "#111318", color: "#e2e8f0" }}>
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 rounded-2xl bg-cyan-500/10 text-cyan-400">
            <Info size={28} />
          </div>
          <h1 className="text-3xl font-bold font-syne text-white">Hakkımızda</h1>
        </div>
        
        <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-8 mb-8 backdrop-blur-sm">
          <p className="text-slate-300 leading-relaxed mb-6">
            FikoAI, Almanya merkezli bir fintech girişimi olarak 2024 yılında kurulmuştur. Kökleri ve teknolojik altyapısı, geliştirici firmamızın 2023 yılında attığı sağlam temellere dayanmaktadır. Amacımız, Avrupa genelindeki küçük ve orta ölçekli işletmelerin karmaşık muhasebe süreçlerini en ileri yapay zeka teknolojileriyle baştan aşağı dönüştürmektir.
          </p>
          <p className="text-slate-300 leading-relaxed mb-6">
            Sıradan bir yazılım sunmanın ötesine geçerek; şirket yetkililerimizin muhasebe, mali denetim ve finansal danışmanlık alanındaki <strong>20 yılı aşkın derin saha tecrübesini</strong>, modern ve etkileyici bir teknoloji altyapısıyla buluşturuyoruz. Deneyimli muhasebeciler, mali müşavirler ve üst düzey yazılım mühendislerinden oluşan vizyoner ekibimiz; her gün daha akıllı, daha hızlı, hatasız ve benzersiz bir dijital muhasebe deneyimi sunmak için kararlılıkla çalışmaktadır.
          </p>
          <p className="text-slate-300 leading-relaxed mb-8">
            İnşa ettiğimiz bu yenilikçi ve yüksek performanslı mimari sayesinde; finansal verileri saniyeler içinde analiz eden, makine öğrenimi modelleriyle her işlemde kendini sürekli eğiten ve işletmenizi geleceğe en güvenli şekilde hazırlayan kusursuz bir dijital asistan yarattık.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-slate-900/60 p-6 rounded-2xl border border-slate-800/60 transition-transform duration-300 hover:-translate-y-1">
              <h2 className="text-xl font-semibold text-cyan-400 mb-3">Vizyonumuz</h2>
              <p className="text-slate-300 leading-relaxed text-sm">
                Muhasebe ve finans dünyasında geleneksel ezberleri bozan, teknoloji ve 20 yıllık köklü tecrübenin kusursuz senteziyle uluslararası düzeyde öncü bir yönetim platformu olmak.
              </p>
            </div>

            <div className="bg-slate-900/60 p-6 rounded-2xl border border-slate-800/60 transition-transform duration-300 hover:-translate-y-1">
              <h2 className="text-xl font-semibold text-cyan-400 mb-3">Misyonumuz</h2>
              <p className="text-slate-300 leading-relaxed text-sm">
                Müşterilerimizin karmaşık operasyonlarını uçtan uca, en yüksek güvenlik (256-Bit SSL) standartlarıyla yönetebileceği, sıfır hata prensibiyle çalışan akıllı otomasyon sistemleri sunmak.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
