# fikoai.de — Yeni Ön Yüz (11.07.2026)

## Ne değişti?

Site artık sadece muhasebe değil, **işletmelere özel web tabanlı sistemler kuran bir stüdyo** olarak konumlandı.
Muhasebe sistemi (fikoai Smart Accounting) referanslar bölümünde bir proje olarak yer alıyor.

## Dosyalar

| Dosya | Açıklama |
|---|---|
| `index.html` | **YENİ ana sayfa** — tek dosya, tüm CSS/JS/logolar gömülü. `npm run dev` veya dosyaya çift tıklayınca bu açılır. |
| `muhasebe-app.html` | Eski `index.html`'in yedeği (muhasebe React uygulamasının girişi). Dev sunucuda `http://localhost:5173/muhasebe-app.html` adresinden hâlâ açılır. |
| `yeni-site/img/` | Referans logolarının optimize edilmiş kopyaları (webp). Logolar HTML'e gömülü olduğu için site bunlara ihtiyaç duymaz — ileride düzenleme için yedek. |
| `yeni-site/YENI-SITE-NOTLAR.md` | Bu dosya. |

## Yeni sayfanın özellikleri

- **İki dilli:** Almanca (varsayılan) + Türkçe — sağ üstteki DE | TR düğmesi. Seçim tarayıcıda hatırlanır.
- **Bölümler:** Hero → istatistikler → kayan logo bandı → 6 hizmet kartı → 4 adımlı çalışma süreci → 9 referans kartı (hikayeli) → Hakkında (Adem Çevik) → İletişim (form + WhatsApp + telefon) → Footer.
- **Referanslar:** 2MC Gastro, Gecit-KFZ, BAC Handels Management, BAC Kiosk & Bestellsystem, Genusswerk, Kudret, Lucullus, Nett Consultancy, fikoai Smart Accounting.
- **Form:** Sunucu gerektirmez — gönderince ziyaretçinin e-posta programını açar (mailto). İleride Resend/Formspree gibi bir servise bağlanabilir.
- Tamamen responsive (mobil menü dahil), animasyonlu, SEO meta etiketleri hazır.

## ⚠️ Yayına almadan önce DOLDURULMASI gerekenler

1. **Telefon / WhatsApp:** Şu an `+49 000 0000000` — `index.html` içinde `490000000000` araması yapıp gerçek numarayla değiştirin (3 yerde: wa.me linki, tel: linki, görünen etiketler).
2. **E-posta:** `info@fikoai.de` varsayıldı — form ve iletişim kartında geçiyor. Farklıysa `info@fikoai.de` araması yapıp değiştirin.
3. **Impressum & Datenschutz:** Footer'daki linkler şu an boş (`#`). Almanya'da yasal zorunluluk — sayfalar eklenip linklenmelidir.
4. **Hakkında alıntısı:** "Yazılımı aile işletmesinde tanıdım..." cümlesi taslaktır — Adem'in onayından geçmeli.

## Hero animasyonları (Motion — motion.dev, 11.07.2026 güncellemesi)

Ana ekran **Motion One v10.18** kütüphanesiyle canlandırıldı. Kütüphane dosyanın İÇİNE gömülü (~24 KB) — CDN'e bağımlılık yok, internet yavaş olsa bile animasyonlar çalışır.

- **Başlık:** Kelime kelime, blur'dan süzülerek açılır; dil değiştirince yeni dilde tekrar oynar.
- **Dönen kelime:** "Wir bauen / Sizin için kuruyoruz: [web siteleri → QR menüler → vardiya planları...]" — 2,4 sn'de bir 3D flip.
- **Işık küreleri (orb):** 3 renkli küre arka planda sonsuz döngüde organik süzülür.
- **Süzülen çipler:** "QR menü 48 saatte yayında" gibi 4 mini rozet sırayla belirir, kendi ritminde yüzer (mobilde gizli).
- **Mouse paralaksı:** Küreler ve çipler fareyi derinliklerine göre takip eder (`data-depth` özniteliği; sayıyı büyütmek hareketi artırır).
- **İstatistikler:** Görünür olunca 0'dan hedefe sayar (10+, 6, 2, %100).
- **Manyetik butonlar:** CTA'lar fareye doğru eğilir, bırakınca yay gibi geri döner; üzerine gelince parlama süpürmesi geçer.
- `prefers-reduced-motion` açık olan kullanıcılarda animasyonlar otomatik kapanır.

Dönen kelime listesini değiştirmek için: `<script>` içinde `const ROT={de:[...], tr:[...]}` dizilerini düzenleyin.

## Metin değiştirme

- Almanca metinler doğrudan HTML içinde.
- Türkçe çeviriler `<script>` içindeki `I18N.tr` sözlüğünde (anahtar → metin).
- Bir metni değiştirirken iki yeri de güncelleyin.

## Dağıtım notu

- `vite build` varsayılan olarak kök `index.html`'i derler → build artık yeni vitrin sayfasını üretir.
- Muhasebe uygulamasını ayrı yayınlamak isterseniz: ya `muhasebe-app.html`'i vite config'e ikinci giriş (input) olarak ekleyin, ya da muhasebe uygulamasını `app.fikoai.de` gibi ayrı bir alt alan adına taşıyın (önerilen).
