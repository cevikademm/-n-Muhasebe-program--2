# fikoai-spiele dalı

Bu dal, fikoai.de'ye "Spiele / Oyunlar" bölümünü eklemek için açıldı (4 Kasım 2026).

- `site-dist/` — canlı sitenin (dpl_9nZRUUi34fGpniTRLCqh6sCzt9vZ) derlenmiş dosyaları, birebir indirildi. Tek değişen dosya `site-dist/index.html` (oyunlar bölümü eklendi).
- `yedek/index.canli-2026-11-04.html` — değişiklikten önceki canlı ana sayfa.
- `vercel.json` bu dalda derleme yapmaz; `site-dist/` olduğu gibi yayınlanır. Böylece bilgisayardaki commit edilmemiş değişiklikler (ana sayfa ve /app) kaybolmaz.
- `main` dalına dokunulmadı. Yerel kaynak klasörü bağlandığında oyunlar bölümü kaynağa taşınacak ve normal derlemeye dönülecek.

## 4 Kasım (2) — fikoai.de/oyunlar + Supabase taşıma
- Oyun lisans sistemi Kirpi Pro'dan **Ön Muhasebe Programı-3** (`edlbvezskqbxasqkszvd`, fikoai uygulamasının projesi) taşındı: `license_*` tabloları, RSA anahtarı (aynı), `license-check`, `game-download`, `game-covers`/`game-builds` storage.
- `site-dist/oyunlar.html` + `site-dist/oyunlar-panel/` → fikoai.de/oyunlar: fikoai hesabıyla giriş, yalnızca `license_admins` (cevikademm@gmail.com). Lisans kodları, oyunlar (uzaktan aç/kapat), build'ler, kayıtlar.
- Build yükleme denetimi: yalnızca .zip/.exe; kaynak kod, Unity proje klasörleri ve Mono build reddedilir.
- Ana sayfadaki Spiele bölümü artık yeni projeden okuyor.

## 4 Kasım (3) — /app menüsünde "Oyunlar"
- `site-dist/oyunlar-panel/app-menu.js`, `site-dist/muhasebe-app.html`'e tek `<script>` satırıyla eklendi. Derlenmiş uygulama koduna (app-C1_zGVDr.js) dokunulmadı.
- YÖNETİM menüsündeki "Hesap Planları" öğesini kopyalayıp "Oyunlar" (DE: "Spiele") ekler; bekleyen lisans kodu sayısını rozetle gösterir; tıklanınca /oyunlar açılır (aynı oturum).
- Kalıcı çözüm: yerel kaynak bağlandığında LeftPanel.tsx'e gerçek menü öğesi olarak eklenmeli.

## 4 Kasım (4) — Oyunlar modülü
- `app-menu.js` yerine `site-dist/oyunlar-panel/app-modul.js`: Oyunlar, Muhasebe · Müşteri Bulma · Sosyal Medya yanına 4. modül olarak eklenir (çekmece modül kartları, alt sekme çubuğu, masaüstü listesi + YÖNETİM menüsü). Tıklanınca panel uygulamanın içinde kendi modül çubuğuyla açılır (fikoai.de/app#oyunlar); yalnızca license_admins hesabına görünür.
- /oyunlar artık yalnızca fikoai.de içinden gömülebilir (X-Frame-Options SAMEORIGIN, frame-ancestors 'self'); `?embed=1` modunda çıkış/bağlantılar gizli.
- Lisans onayı zorunlu: `license_apps.auto_approve` kısıtla her zaman false; paneldeki otomatik onay anahtarı kaldırıldı.
- Ana sayfa kartları: her kartta indirme butonu (dosya yoksa pasif "İndirme yakında"); not metni: yalnızca oynanabilir Windows sürümü, kaynak kod yok, ilk açılışta lisans kodu.
