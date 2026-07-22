# Sosyal Medya OS — Faz 2, 3, 4 & 5

Ajans seviyesinde sosyal medya yönetimi modülü. PRD'nin *mimari vizyonunu*
(modüler, API-first, platform başına adapter, storage soyutlaması) mevcut
Vite + React + Supabase yığınının içinde uygular — ayrı bir Next.js/Prisma
uygulaması kurulmaz, auth/müşteri/RLS/storage yeniden yazılmaz.

**Hazır:** Medya Kütüphanesi (Faz 2), Sosyal Hesaplar (Faz 3),
Yayınlama + Yayın Kuyruğu (Faz 4), **AI üretim kuyruğu + Onay kutusu (Faz 5)**.
**Sonraki faz:** uygulama içi takvim düzenleme & analitik.

---

## Erişim

Sol paneldeki **platform anahtarı** üçüncü seçenek olarak açılır:
Muhasebe · Müşteri Bulma · **Sosyal Medya**. Modül içi gezinme (Medya / Onay /
Yayın / Otomasyon / Hesaplar / Takvim / Analiz) `SosyalMedyaPanel` iç state'iyle
yapılır — `MenuKey` sekme başına şişirilmez.

---

## AI üretimi ve onay kutusu (Faz 5)

İçerik takvimi (`sm_posts`) ile kütüphane (`sm_media`) arasına bir **üretim
kuyruğu** (`sm_uretim_isleri`) girdi:

```
sm_posts (takvim)  ──►  sm_uretim_isleri  ──►  sm_media (durum='onayda')
                              │                        │
                    ┌─────────┴─────────┐              ▼
              motor='mcp'          motor='api'    Onay sekmesi
          Claude + Higgsfield    pg_cron + REST   "Onayla ve yayınla"
              (tam Reels)        (görsel/klip)          │
                                                        ▼
                                          sm_yayinlar → sm-publish
```

### Neden iki motor?

Higgsfield'in genel REST API'si yalnızca `text2image`, `image2video` ve `speak`
sunuyor. Almanca seslendirmeli **ve** yanmış altyazılı tam Reels ancak MCP
tarafında üretilebiliyor (`generate_video` ×N + `generate_audio` ×N →
`explainer_video`). Bu yüzden işi kimin alacağını `motor` sütunu söyler; iki
motor da aynı satırları, aynı durumları ve aynı `ice-aktar` ucunu kullanır.
İkinci motor açıldığında şema **değişmez**.

### Neden üretim doğrudan yayınlanmıyor?

AI üretimi hatalı olabilir ve yayın geri alınamaz. `sm-uretim` her üretimi
`durum='onayda'` yazar; kart kullanıcıya **ne üretildi / nereye gidecek / ne
yazacak** üçlüsünü gösterir. Onaylanınca hedefler takvim satırından türetilir
(`onay/hedefler.ts`) ve **mevcut** `smPublishService.yayinla()` çağrılır — yeni
bir yayınlama yolu açılmadı.

> Türetme üç filtreden geçer: platformun adapter'ı hazır mı, o platformda
> doğrulanmış hesap var mı, medya tipi bir formata oturuyor mu. Elenen platform
> `atlanan` listesiyle kartta yazılır — sessizce kaybolmaz.

### `sm-uretim` fonksiyonunun iki kimliği

Claude'un tarayıcı oturumu, dolayısıyla JWT'si yok. Bu yüzden fonksiyon hem
`Authorization: Bearer <JWT>` (uygulama) hem de `x-ajan-secret` + `ownerId`
(ajan) kabul eder — `lead-inbound`'daki `INBOUND_SECRET` deseninin aynısı.

> ⚠️ Secret yolunda service_role kullanılır ve **RLS devrede değildir**. Bu
> yüzden fonksiyondaki her sorgu elle `user_id = ownerId` ile daraltılır
> (`sahip()` sarmalayıcısı). Bu filtreyi kaldırmak secret'ı bilen birine tüm
> kiracıların verisini açar.

### Tekrar koruması

`sm_uretim_isleri.harici_job_id` ve `sm_media.harici_job_id` üzerinde kısmi
unique index var. Aynı Higgsfield işi ikinci kez `ice-aktar`'a gelirse yeni
satır açılmaz, mevcut medya `{tekrar:true}` ile döner — yarıda kesilen bir
üretim turu tekrar çalıştırıldığında kütüphane kirlenmez. Bu yüzden "yeniden
üret" işlemi `harici_job_id`'yi **temizlemek zorundadır**
([smUretimService.isiSifirla](../../services/sosyal/smUretimService.ts)).

---

## Yayınlama (Faz 4)

Kütüphanedeki bir varlık, kartın üstündeki **Yayınla** düğmesiyle ya da
detay çekmecesinden yayın moduna girer. `YayinModal` iki yarımdır: solda
vitrin (önizleme + metin önizlemesi), sağda karar (hedef kartları + ortak
metin). Hedefler **tek tek, birkaçı ya da "Hepsini seç"** ile işaretlenir;
her hedefin kendi formatı (Gönderi / Reels / Hikâye) ve isterse **kendine
özel metni** olur.

### Neden satır başına hedef?

`sm_yayinlar` içinde **medya × hesap = bir satır**. Tek satırda platform
dizisi tutulsaydı, Instagram başarılı olup YouTube patladığında kayıt
"kısmen başarılı" gibi anlamsız bir duruma düşerdi. Satır modelinde
yalnızca patlayan hedef yeniden denenir.

### İki aşamalı yayın ve zaman aşımı

Instagram akışı: **taslak (container) → işlenmeyi bekle → yayınla**. Video
30-120 sn işlenebiliyor, Edge Function ise o kadar yaşamıyor. Bu yüzden
adapter zaman aşımında hata değil `{ bekliyor: true, taslakId }` döner;
satır `yayinlaniyor` kalır, `useSmYayin` 9 saniyede bir `kontrol` çağırıp
işi ilerletir ve **video ikinci kez yüklenmez** (aynı taslak id kullanılır).

### Private bucket ↔ public URL çelişkisi

Instagram medyayı kendi sunucusundan çeker ve **sorgu parametreli (imzalı)
URL'leri reddeder**; `sm-media` ise bilinçli olarak private. Çözüm:
`sm-yayin-gecici` adında **public** bir bucket'a, yayın anında, tahmin
edilemez rastgele bir yola kopya çıkarılır; iş biter bitmez silinir. Kopya
**medya başına bir kez** üretilir (üç platforma giden görsel üç kez
kopyalanmaz) ve fonksiyon ölürse bir sonraki çağrıdaki `geciciSupur()`
temizler. Asıl kreatif hiçbir zaman public olmaz.

> `sm-yayin-gecici` bucket'ında **yazma politikası yoktur** → yalnızca
> service_role yazar; `public = true` sadece okumayı açar.

### Composio tool adı tuzağı (doğrulandı)

REST ucu (`/api/v3/tools/execute/<TOOL>`) **kısa** adları kabul eder:
`INSTAGRAM_CREATE_MEDIA_CONTAINER` → `INSTAGRAM_GET_POST_STATUS` →
`INSTAGRAM_CREATE_POST`. MCP sunucusunun döndürdüğü uzun adlar
(`INSTAGRAM_POST_IG_USER_MEDIA…`) REST'te **404** verir.

### Şu an gerçekten yayınlayabilen platform

`YAYIN_PLATFORMLARI = ["instagram"]`. YouTube/Facebook hesabı
kaydedilebiliyor ama adapter'ları hâlâ taslak, bu yüzden hedef kartları
"Yakında" rozetiyle **seçilemez** gelir. Yeni platform açmak = adapter'ı
yaz + `registry.ts`'e satır + bu diziye ekle.

---

## Otomasyon — otomatik hashtag + ilk yorum

Amaç: kullanıcı videoyu yükleyip **Yayınla**'ya bassın; etiketler ve
gönderinin altına düşen ilk yorum kendiliğinden oluşsun. Kural marka başına
bir kez **Otomasyon** sekmesinde tanımlanır (`sm_otomasyon`).

| Ayar | Ne yapar |
|---|---|
| `hashtag_yeri` | `yorum` (metin temiz kalır) · `caption` (metnin altına) · `yok` |
| `sabit_hashtagler` | her gönderide mutlaka çıkan marka etiketleri |
| `hashtag_havuzu` + `hashtag_adet` | havuzdan gönderi başına N etiket |
| `yorum_sablonlari` | sırayla dönen ilk yorum metinleri (`{baslik} {handle} {hashtag}`) |

### Neden `Math.random` yok

Etiket seçimi ve şablon rotasyonu **tohumdan** (media id) türetilir
(`tohumSayisi` → FNV-1a). Yayın yeniden denendiğinde aynı metnin çıkması
şart: rastgelelik, `tekrar`da başka bir yorumun gitmesine yol açardı.
Havuz baştan değil **tohuma göre kaydırılarak** okunur, çünkü her gönderide
birebir aynı etiket bloğunu paylaşmak Instagram tarafında tekrar sinyali.

### Metin sunucuda üretilir, önizleme aynı fonksiyondan gelir

`services/sosyal/otomasyonMetin.ts` ↔ `supabase/functions/_shared/social/otomasyon.ts`
**ikiz dosyadır** (Deno ↔ Vite ayrımı; `services/moduller.ts` ile aynı desen).
Yayın modalinde gösterilen "otomatik eklenecek" bloğu ile sunucunun yazdığı
metin aynı fonksiyondan çıkar — biri değişirse **ikisi birden** güncellenmeli.
Nihai metin `sm_yayinlar.caption` / `yorum_metni` içine **yazılır**: yeniden
denemede etiketler ikinci kez eklenmez.

### Yorum, yayının başarısını belirlemez

Gönderi yayınlandıysa iş başarılıdır. Yorumun kendi durumu
(`yorum_durum`: `yok · bekliyor · yazildi · hata · desteklenmiyor`), kendi
hata alanı ve kendi deneme sayacı vardır. Aksi hâlde yorum hatası yüzünden
"tekrar dene"ye basan kullanıcı **videoyu ikinci kez yayınlardı**; şimdi
`tekrar` yayınlanmış bir satırda yalnızca yorumu yeniden dener (en fazla 3).

> ⚠️ Composio'nun Instagram REST setinde **"kendi gönderine yorum yaz" tool'u
> yok** — yalnızca `INSTAGRAM_REPLY_TO_COMMENT` var. Bu yüzden OAuth Composio'da
> kalır, yorum isteği `graph.instagram.com/{media-id}/comments`'e doğrudan gider
> (YouTube adapter'ındaki desenin aynısı). Bağlantı `instagram_business_manage_comments`
> kapsamıyla açılıyor; eski Facebook-login bağlantıları için `graph.facebook.com`'a düşülür.

Yorum ucu bağlı olmayan platformlarda (`YORUM_DESTEKLI` dışı) `hashtag_yeri:
"yorum"` tercihi otomatik olarak **metnin altına** düşer — etiketler hiç
yayınlanmadan kaybolmasın diye. Hikâyede (`story`) otomasyon hiç çalışmaz.

---

## Mobil & tablet

Proje inline-style kullanıyor ve `app-styles.css`'te pratikte media query
yok. CSS'e paralel bir sınıf sistemi açmak yerine kırılım JS'ten okunuyor
(`components/sosyal/ekran.ts` → `useEkran()`), çünkü stiller zaten JS'te
üretiliyor — tek kaynak kalsın diye.

| Kırılım | Davranış |
|---|---|
| `< 640px` mobil | Yayın modali alttan tam ekran sayfa, tek sütun hedef listesi, yapışkan aksiyon çubuğu (`env(safe-area-inset-bottom)`), sekmeler yatay kayar, galeri 132px sütun |
| `640-1023px` tablet | Modal %94 genişlik, önizleme yatay şeride iner, detay çekmecesi yan sütun değil örtü |
| `≥ 1024px` masaüstü | İki sütunlu modal, sabit yan çekmece |

`useEkran` `matchMedia` + `change` olayı kullanır (her pikselde değil,
yalnızca eşik geçilince tetiklenir).

---

## Çok kiracılılık (ajans modu)

Tüm `sm_*` tabloları `customer_id` taşır ve `public.companies`'e bağlanır:

| `customer_id` | Anlamı |
|---|---|
| `NULL` | **Kendi markam** — `/sosyal-medya` skill'inin ürettiği mevcut veri |
| dolu | Ajans müşterisinin markası (`companies.id`) |

Kolon nullable eklendiği için mevcut satırlar olduğu gibi çalışmaya devam
eder. Üst çubuktaki **marka seçici** aktif kapsamı belirler.

> **Unique kısıtları:** hepsine aynı şey uygulanmadı, her tablo tek tek
> düşünüldü. `sm_metrics` ve `sm_content_pillars` gerçekten çakışıyordu
> (iki müşterinin aynı günkü snapshot'ı / aynı adlı pillar'ı) → partial
> unique index çiftine dönüştüler. `sm_accounts.handle` ve
> `sm_post_metrics.medya_id` ise gerçek dünyada zaten tekil doğal
> anahtarlar; `customer_id` eklemek aynı kaydın iki kez yazılmasına kapı
> açacağı için **bilerek değiştirilmedi**.

---

## Klasör yapısı

```
components/sosyal/
  SosyalMedyaPanel.tsx      sekme yönlendirme + marka seçici (kabuk)
  MusteriSecici.tsx         companies → aktif marka
  ortak.ts                  paylaşılan stil parçaları, rozet/buton, formatlayıcılar
  ekran.ts                  useEkran() — mobil/tablet/masaüstü kırılımı
  medya/                    MedyaKutuphanesi · Yukleyici · Karti · DetayCekmecesi · Filtreler
  hesaplar/                 HesapListesi · HesapKarti · HesapBaglaModal
  yayin/                    YayinModal · HedefKarti · YayinOnizleme · YayinSatiri · YayinKuyrugu
  onay/                     OnayKutusu · OnayKarti · hedefler.ts (takvim → yayın hedefi türetme)
  otomasyon/                OtomasyonPaneli · EtiketGirdisi (hashtag + ilk yorum kuralı)

services/sosyal/
  types.ts                  ortak tipler (DB alan adlarıyla birebir)
  otomasyonMetin.ts         ★ saf metin kurgusu — _shared/social/otomasyon.ts ile İKİZ
  storage/                  StorageAdapter · supabaseStorage · sürücü seçimi
  smMediaService.ts         sm_media repository (React'tan bağımsız)
  smAccountService.ts       sm_accounts repository + Edge Function köprüsü
  smPublishService.ts       sm_yayinlar repository + sm-publish köprüsü
  useSmMedia.ts             kütüphane state'i
  useSmAccounts.ts          hesap state'i + useSmMusteriler
  useSmYayin.ts             yayın kuyruğu state'i + otomatik ilerletme döngüsü
  smOtomasyonService.ts     sm_otomasyon repository (upsert değil: oku-sonra-yaz)
  useSmOtomasyon.ts         kural state'i + kuralAl(platform)
  smUretimService.ts        sm_uretim_isleri + sm_posts okuma + sm-uretim köprüsü
  useSmOnay.ts              onay kutusu state'i + useSmOnaySayaci (sekme rozeti)

supabase/functions/
  _shared/composio.ts       ortak Composio istemcisi (ig-metrics-sync ile paylaşılır)
  _shared/social/           SocialAdapter sözleşmesi + instagram + taslak + registry
  _shared/social/staging.ts yayın için geçici public kopya (private↔public köprüsü)
  sm-account-connect/       kimlik saklama & doğrulama ucu
  sm-publish/               yayınla · kontrol · tekrar · iptal
  sm-uretim/                kuyruk · is-al · is-guncelle · ice-aktar · plan-uygula
```

**Kural:** hiçbir dosya 400 satırı geçmez.
[MusteriBulmaPanel.tsx](../MusteriBulmaPanel.tsx) 1965 satır — tekrarlanmayacak
bir anti-pattern, PRD de "büyük tek dosya üretme" diyor.

---

## Depolama soyutlaması

UI ve servisler yalnızca `StorageAdapter` arayüzünü görür:

```ts
import { medyaDepo, medyaYolu } from "services/sosyal/storage";
```

S3 / R2 / Cloudinary'ye geçiş = yeni bir adapter dosyası + `storage/index.ts`
switch'ine bir satır + `VITE_SM_STORAGE_DRIVER` env değeri. **Çağıran hiçbir
kod değişmez.** Satır bazında `sm_media.depo_surucu` saklandığı için geçiş
sırasında eski ve yeni dosyalar bir arada yaşayabilir.

### `sm-media` bucket'ı **private**

Mevcut `invoices` bucket'ı public ve `getPublicUrl` ile okunuyor. Müşteri
kreatifleri için bu yanlıştı: yolu bilen herkes indirebilirdi. `sm-media`
private açıldı, erişim `createSignedUrl` ile süreli veriliyor. Galeri
tek turda toplu imzalı URL alır (`imzaliUrlToplu`) — kart başına istek atılmaz.

Yol deseni ve RLS bağlantısı:

```
{ownerId}/{customerId | "kendi"}/{timestamp}_{dosyaadi}
 └─ ilk segment = ownerId → storage.objects politikaları buna bakar
```

İlk segment değişirse RLS kırılır; `medyaYolu()` dışında yol üretmeyin.

---

## Sosyal hesap adapter'ları

Adapter'lar **tarayıcıda değil, Edge Function içinde** yaşar — token'lar
yalnızca orada çözülür.

```
_shared/social/types.ts      SocialAdapter sözleşmesi
                             dogrula · profilGetir · yayinla · metrikler
_shared/social/instagram.ts  Composio üzerinden (hazir: true)
_shared/social/taslak.ts     uygulanmamış platformlar için iskelet (hazir: false)
_shared/social/registry.ts   ★ yeni platform eklemenin TEK dokunma noktası
```

Bu fazda `dogrula` + `profilGetir` çalışıyor. `yayinla` / `metrikler`
imzaları sabitlendi ama Faz 4-5'e bırakıldı — çağıran kod sonradan değişmesin diye.

Yeni platform eklemek: `_shared/social/` altına bir dosya yaz, `registry.ts`'e
bir satır ekle. Başka hiçbir yer değişmez.

### Token güvenliği

`sm_account_credentials` tablosunda **RLS açık ve bilerek 0 politika var**
→ `authenticated` için her şey reddedilir; yalnızca `service_role` erişir.
Client "bağlı mı?" bilgisini `sm_accounts.dogrulandi` üzerinden okur ve
token'ı asla görmez.

> ⚠️ Bu tabloya RLS politikası **eklemeyin**. Bir politika eklemek token'ları
> tarayıcıya açar.

`sm-account-connect` ayrıca yetkiyi **kullanıcı istemcisiyle** doğrular
(`userClient.from("sm_accounts").eq("id", accountId)`): hesap RLS altında
görünmüyorsa 404 döner, dolayısıyla service_role işlemleri başkasının
hesabına dokunamaz.

---

## Env değişkenleri

| Değişken | Yer | Not |
|---|---|---|
| `VITE_SM_STORAGE_DRIVER` | frontend | opsiyonel, varsayılan `supabase` |
| `COMPOSIO_API_KEY` | Edge Function | `ig-metrics-sync` ile ortak |
| `COMPOSIO_USER_ID` | Edge Function | varsayılan `cevikadem` |
| `SM_AJAN_SECRET` | Edge Function | `sm-uretim`'in ajan (Claude/MCP) yolu. Tanımlı değilse yalnızca JWT'li çağrılar kabul edilir |

---

## İlgili migration'lar

```
20260722_sm_multitenant.sql   customer_id + partial unique index'ler + sm_post_ranking
20260722_sm_media.sql         sm_media tablosu + RLS
20260722_sm_credentials.sql   sm_account_credentials (politikasız)
20260722_sm_storage.sql       sm-media bucket (private) + storage.objects RLS
20260722_sm_yayin.sql         sm_yayinlar + sm-yayin-gecici bucket (public, yazma kapalı)
20260723_sm_otomasyon.sql     sm_otomasyon + sm_yayinlar'a yorum_* / uygulanan_hashtagler
20260724_sm_uretim.sql        sm_uretim_isleri + sm_media'ya harici_job_id / kaynak_url
```

RLS deseni `effective_owner_ids()` — `leads`/`invoices` ile birebir aynı,
yani takım üyeleri (staff) sahibin verisini görür.

---

## Deploy

```bash
# 1) Migration'lar: `supabase db push` bu projede ÇALIŞMAZ.
#    Uzak schema_migrations tam zaman damgası tutuyor (20260722160144), yerel
#    dosyalar tarih-bazlı (20260722_sm_yayin.sql) → CLI eşleştiremiyor.
#    SQL'i migrations/ altına yaz, sonra Supabase MCP `apply_migration` ile uygula
#    ve `execute_sql` + `get_advisors(security)` ile doğrula.

# 2) Fonksiyonlar
supabase functions deploy sm-publish
supabase functions deploy sm-account-connect   # _shared/social/types.ts değişti
supabase functions deploy ig-metrics-sync      # _shared/composio.ts'i paylaşıyor
# ⚠ sm-uretim MUTLAKA --no-verify-jwt ile: ajan çağrısında Authorization
#   başlığı YOK (Claude'un oturumu yok), gateway JWT arasa kod hiç çalışmaz.
#   Kimlik doğrulama fonksiyonun İÇİNDE: JWT ya da x-ajan-secret.
#   (lead-inbound de aynı sebeple verify_jwt=false.)
supabase functions deploy sm-uretim --no-verify-jwt

# 3) Ajan yolu için secret (Claude/MCP üretim turu bunu kullanır)
supabase secrets set SM_AJAN_SECRET=$(openssl rand -hex 24)
```

`_shared/` altındaki bir dosya değiştiğinde onu import eden **tüm**
fonksiyonlar yeniden deploy edilmeli — Supabase ortak dosyayı deploy anında
bundle'a gömer, çalışma anında paylaşmaz.

`sm-publish` de `COMPOSIO_API_KEY` (ve opsiyonel `COMPOSIO_USER_ID`)
secret'ini ister — `sm-account-connect` ile aynı değerler.
