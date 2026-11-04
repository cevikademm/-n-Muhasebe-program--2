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
