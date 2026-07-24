-- ============================================================
-- lead_emails → realtime yayını
-- Müşteri Bulma panelinde "kaçıncı mail" sayacı ve gelen yanıt
-- önizlemesi lead_emails'ten okunur; yanıt düştüğü an ekranda
-- görünsün diye tablo supabase_realtime publication'ına eklenir.
-- (leads zaten yayında.)
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lead_emails'
  ) then
    alter publication supabase_realtime add table public.lead_emails;
  end if;
end $$;
