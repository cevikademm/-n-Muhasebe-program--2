-- ============================================================
-- `sm-media` storage bucket (PRD Faz 2)
-- ============================================================
-- Mevcut `invoices` bucket'ı PUBLIC ve `getPublicUrl` ile okunuyor. Ajans
-- müşterilerinin henüz yayınlanmamış kreatifleri için bu yanlış: yolu bilen
-- herkes indirebilirdi. Bu bucket PRIVATE açılır, erişim `createSignedUrl`
-- ile süreli verilir.
--
-- Yol deseni (useInvoices'taki desenden türetilmiş, müşteri segmenti eklendi):
--   {ownerId}/{customerId | "kendi"}/{timestamp}_{dosyaadi}
--   └─ foldername(name)[1] = ownerId → RLS bu segmente dayanır.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sm-media', 'sm-media', false,
  524288000,                                    -- 500 MB (video için)
  array[
    'image/jpeg','image/png','image/webp','image/gif','image/avif',
    'video/mp4','video/quicktime','video/webm'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── storage.objects politikaları ───────────────────────────────────
-- Sahiplik ilk klasör segmentinden okunur ve effective_owner_ids() ile
-- karşılaştırılır → takım üyeleri (staff) sahibin medyasını görebilir,
-- diğer kiracılar göremez. Tablo RLS'i ile birebir aynı kapsam.

drop policy if exists sm_media_objects_select on storage.objects;
drop policy if exists sm_media_objects_insert on storage.objects;
drop policy if exists sm_media_objects_update on storage.objects;
drop policy if exists sm_media_objects_delete on storage.objects;

create policy sm_media_objects_select on storage.objects for select to authenticated
  using (
    bucket_id = 'sm-media'
    and (storage.foldername(name))[1] in (select public.effective_owner_ids()::text)
  );

create policy sm_media_objects_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sm-media'
    and (storage.foldername(name))[1] in (select public.effective_owner_ids()::text)
  );

create policy sm_media_objects_update on storage.objects for update to authenticated
  using (
    bucket_id = 'sm-media'
    and (storage.foldername(name))[1] in (select public.effective_owner_ids()::text)
  )
  with check (
    bucket_id = 'sm-media'
    and (storage.foldername(name))[1] in (select public.effective_owner_ids()::text)
  );

-- Silme yalnızca sahibin kendisine: staff yanlışlıkla kreatif silemesin.
create policy sm_media_objects_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'sm-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
