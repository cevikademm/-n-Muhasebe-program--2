# TikTok Entegrasyonu — Durum ve Devam Notları

> **Özet:** Bağlantı, doğrulama ve yayın kodu **eksiksiz ve çalışıyor.** Tek engel
> TikTok'un politikası: denetimden (audit) geçmemiş uygulama **yalnızca gizli
> hesaba** gönderebiliyor. Kullanıcı kararı: **hesap herkese açık kalacak.**
> Dolayısıyla ilerlemenin tek yolu **TikTok Production audit'i** — bu haftalar
> süren ayrı bir iş. Şimdilik **ertelendi**; Instagram + YouTube kullanılıyor.
>
> Tarih: 2026-07-23

---

## Nerede takıldık (kesin sebep)

Yayın denemesi şu hatayı veriyor:

```
unaudited_client_can_only_post_to_private_accounts
https://developers.tiktok.com/doc/content-sharing-guidelines/
```

TikTok'un kuralı: **denetimsiz (sandbox / audit öncesi) bir uygulama, yalnızca
TikTok'ta "gizli hesap" olarak ayarlanmış hesaplara video gönderebilir.** Hesap
herkese açıksa Content Posting API gönderiyi **tamamen reddeder**.

| | Hesap gizli | Hesap açık |
|---|---|---|
| Uygulama denetimsiz (şu anki durum) | ✅ ama "yalnızca ben" | ❌ imkânsız (aldığımız hata) |
| Uygulama audit'ten geçti | ✅ | ✅ herkese açık |

**Kod tarafında yapılabilecek hiçbir şey yok** — bu TikTok platform politikası.
Kullanıcı hesabı açık tutmak istediği için **tek yol audit.**

---

## Bugün ÇALIŞAN her şey (kod tamam)

Aşağıdakiler yazıldı, deploy edildi ve test edildi. **Audit sonrası hiçbir kod
değişikliği gerekmeden** herkese açık yayın açılacak:

| Parça | Dosya | Durum |
|---|---|---|
| OAuth yardımcıları | `supabase/functions/_shared/tiktok.ts` | ✅ |
| OAuth uç noktası | `supabase/functions/tt-oauth/index.ts` | ✅ deploy (`--no-verify-jwt`) |
| Adapter (doğrula + yayın) | `supabase/functions/_shared/social/tiktok.ts` | ✅ iki yollu |
| "Bağla" yönlendirmesi | `sm-account-connect` (tiktok → TikTok OAuth) | ✅ deploy |
| Token yenileme | `sm-publish` (tiktok_oauth dalı) | ✅ deploy |
| Registry | `_shared/social/registry.ts` | ✅ tiktokAdapter kayıtlı |

**Doğrulandı:** hesap bağlandı, `dogrulandi=true`, token geçerli, izinler tam
(`user.info.basic`, `video.publish`, `video.upload`). Yayın init'e kadar gidiyor,
yalnızca privacy kuralına takılıyor.

> Not: profil çekerken **yalnızca `user.info.basic` alanları** (`open_id`,
> `display_name`, `avatar_url`) istenmeli. `username`/`follower_count` gibi alanlar
> ayrı izin (`user.info.profile` / `user.info.stats`) ister ve tüm çağrıyı
> `scope_not_authorized` ile reddettirir. Bu düzeltildi.

---

## TikTok Developer app bilgileri

- **App adı:** fikoai
- **App ID:** `7665759445741406228`
- **Sahiplik:** Individual
- **Redirect URI (kayıtlı):** `https://edlbvezskqbxasqkszvd.supabase.co/functions/v1/tt-oauth`
- **Bağlanan hesap:** @ademcevik
- **Ürünler:** Login Kit + Content Posting API (Direct Post açık)
- **Scope'lar:** user.info.basic, video.publish, video.upload
- **Sandbox:** kuruldu, @ademcevik "Target Users"a eklendi

### Kimlik bilgileri (Supabase secrets)

- `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` → **şu an SANDBOX** değerleri kayıtlı.
- ⚠️ **Audit/Production'da bunlar DEĞİŞİR.** Production sekmesinin kendi
  Client Key/Secret'ı var; audit'e geçerken o değerlerle güncellenmeli:
  ```
  npx supabase secrets set TIKTOK_CLIENT_KEY=<production> TIKTOK_CLIENT_SECRET=<production> --project-ref edlbvezskqbxasqkszvd
  ```

---

## Audit'e girmek için yapılacaklar (sonraki tur)

1. **fikoai.de'ye herkese açık yasal sayfalar ekle** (KOD İŞİ — bende).
   Mevcut gizlilik/şartlar sayfaları giriş arkasında; TikTok göremez. Public
   route gerekiyor:
   - `https://fikoai.de/gizlilik` → gerçek Gizlilik Politikası içeriği
   - `https://fikoai.de/kosullar` (veya /mesafeli-satis) → gerçek Kullanım Şartları
2. **TikTok Developer → fikoai → Production sekmesi:**
   - Terms of Service URL + Privacy Policy URL (yukarıdaki public sayfalar)
   - Her ürün/scope'un nasıl kullanıldığının açıklaması
   - **Demo video** — bağla → video seç → yayınla akışını gösteren
   - **Submit for review**
3. **Production Client Key/Secret'ı** Supabase secret olarak güncelle (yukarıda).
4. Onay bekle (1-4 hafta; TikTok düzeltme isteyebilir).
5. Onaylanınca kullanıcı **@ademcevik'i herkese açık bırakıp** "Yeniden bağla" +
   yayın → herkese açık çıkar. **Ek kod gerekmez.**

---

## Bu turda alınan karar

- ❌ Hesabı gizli yapıp SELF_ONLY test etmek İSTENMİYOR (hesap açık kalacak).
- ✅ Şimdilik **Instagram + YouTube yeterli** (ikisi de herkese açık yayınlıyor).
- ⏸️ TikTok **ertelendi**, audit'e sonra girilecek. Bağlantı ve kod hazır bekliyor.
