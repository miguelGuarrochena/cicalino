-- Cicalino — realtime en organizaciones (Superadmin se actualiza al aceptar contrato)
-- Corré en el SQL Editor de Supabase (una vez).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'organizaciones'
  ) then
    alter publication supabase_realtime add table public.organizaciones;
  end if;
end $$;
