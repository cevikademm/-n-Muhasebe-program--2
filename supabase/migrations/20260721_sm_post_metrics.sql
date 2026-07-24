-- ============================================================
-- sm_post_metrics + sm_post_ranking
-- Post seviyesi Instagram metrikleri ve "kaydetme oranı" sıralaması.
-- sm_metrics günlük HESAP snapshot'ı tutar; bu tablo tek tek GÖNDERİ tutar.
-- Sıralama mantığı: beğeni değil, (kaydetme + paylaşım) / erişim.
-- ============================================================

create table if not exists public.sm_post_metrics (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  platform       text not null default 'instagram',
  medya_id       text not null,                    -- IG media id
  post_id        uuid references public.sm_posts(id) on delete set null,
  permalink      text,
  medya_tipi     text,                             -- IMAGE | VIDEO | CAROUSEL_ALBUM
  urun_tipi      text,                             -- FEED | REELS | AD
  caption        text,
  yayin_tarihi   timestamptz,
  olcum_tarihi   date not null default current_date,
  erisim         integer,
  gosterim       integer,
  begeni         integer,
  yorum          integer,
  kaydetme       integer,
  paylasim       integer,
  video_izlenme  integer,
  raw            jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, medya_id, olcum_tarihi)
);

create index if not exists sm_post_metrics_user_idx
  on public.sm_post_metrics(user_id, platform, yayin_tarihi desc);
create index if not exists sm_post_metrics_medya_idx
  on public.sm_post_metrics(user_id, medya_id, olcum_tarihi desc);

drop trigger if exists sm_post_metrics_set_updated_at on public.sm_post_metrics;
create trigger sm_post_metrics_set_updated_at before update on public.sm_post_metrics
  for each row execute function public.update_updated_at_column();

-- RLS — diğer sm_* tablolarıyla aynı effective_owner_ids() deseni
alter table public.sm_post_metrics enable row level security;

drop policy if exists sm_post_metrics_select on public.sm_post_metrics;
drop policy if exists sm_post_metrics_insert on public.sm_post_metrics;
drop policy if exists sm_post_metrics_update on public.sm_post_metrics;
drop policy if exists sm_post_metrics_delete on public.sm_post_metrics;

create policy sm_post_metrics_select on public.sm_post_metrics for select
  using (user_id in (select effective_owner_ids()) or is_admin());
create policy sm_post_metrics_insert on public.sm_post_metrics for insert
  with check (user_id in (select effective_owner_ids()));
create policy sm_post_metrics_update on public.sm_post_metrics for update
  using (user_id in (select effective_owner_ids()) or is_admin())
  with check (user_id in (select effective_owner_ids()) or is_admin());
create policy sm_post_metrics_delete on public.sm_post_metrics for delete
  using (user_id = auth.uid() or is_admin());

-- ------------------------------------------------------------
-- sm_post_ranking — her gönderinin EN SON ölçümü + karar etiketi
-- ------------------------------------------------------------
-- yayilma_skoru = 100 * (kaydetme + paylaşım) / erişim
--   Instagram dağıtımı beğeniden çok "kaydettim / arkadaşıma yolladım"
--   sinyaline tepki verir. Sıralamanın omurgası bu.
-- karar, skoru hesabın MEDYANINA göre kıyaslar — mutlak eşik değil,
--   çünkü medyan hesap büyüdükçe kayar.
-- ------------------------------------------------------------
drop view if exists public.sm_post_ranking;
create view public.sm_post_ranking
with (security_invoker = on) as
with son as (
  select distinct on (user_id, medya_id) *
    from public.sm_post_metrics
   order by user_id, medya_id, olcum_tarihi desc
),
hesapli as (
  select s.*,
         round(100.0 * (coalesce(s.kaydetme,0) + coalesce(s.paylasim,0))
               / nullif(s.erisim,0), 2)                          as yayilma_skoru,
         round(100.0 * coalesce(s.kaydetme,0) / nullif(s.erisim,0), 2) as kaydetme_orani,
         round(100.0 * coalesce(s.paylasim,0) / nullif(s.erisim,0), 2) as paylasim_orani,
         round(100.0 * (coalesce(s.begeni,0) + coalesce(s.yorum,0)
                      + coalesce(s.kaydetme,0) + coalesce(s.paylasim,0))
               / nullif(s.erisim,0), 2)                          as etkilesim_orani,
         (s.erisim >= 50)                                        as yeterli_veri,
         extract(day from now() - s.yayin_tarihi)::int           as yas_gun
    from son s
)
select h.*,
       med.medyan_yayilma,
       case
         when not h.yeterli_veri                                    then 'veri-az'
         when med.medyan_yayilma is null or med.medyan_yayilma = 0  then 'izle'
         when h.yayilma_skoru >= 2 * med.medyan_yayilma             then 'çoğalt'
         when h.yayilma_skoru >= med.medyan_yayilma                 then 'koru'
         when h.yayilma_skoru <  0.5 * med.medyan_yayilma           then 'bırak'
         else 'izle'
       end                                                          as karar
  from hesapli h
  left join lateral (
    select round(percentile_cont(0.5) within group (order by x.yayilma_skoru)::numeric, 2)
             as medyan_yayilma
      from hesapli x
     where x.user_id = h.user_id
       and x.platform = h.platform
       and x.yeterli_veri
  ) med on true;

comment on view public.sm_post_ranking is
  'Gönderi başına en son ölçüm + yayilma_skoru ((kaydetme+paylaşım)/erişim) ve medyana göre karar etiketi.';
