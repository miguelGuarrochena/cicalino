-- ===========================================================================
-- Menu categories as first-class rows, plus cost and image on products.
--
-- productos.categoria stays the category name: guest orders, Pedidos and the
-- existing RLS keep reading that column. categorias holds order, visibility
-- and empty categories. Renames update both.
-- ===========================================================================

create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locales (id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 40),
  activa boolean not null default true,
  orden integer not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create unique index if not exists uq_categorias_local_nombre
  on public.categorias (local_id, lower(btrim(nombre)));

create index if not exists idx_categorias_local
  on public.categorias (local_id, activa, orden);

create or replace function public.categorias_touch()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists categorias_touch on public.categorias;
create trigger categorias_touch
  before update on public.categorias
  for each row execute function public.categorias_touch();

insert into public.categorias (local_id, nombre, orden)
select s.local_id, s.nombre, s.orden
from (
  select p.local_id, btrim(p.categoria) as nombre, min(p.orden) as orden
    from public.productos p
   where nullif(btrim(p.categoria), '') is not null
   group by p.local_id, btrim(p.categoria)
) s
where not exists (
  select 1 from public.categorias c
   where c.local_id = s.local_id
     and lower(btrim(c.nombre)) = lower(s.nombre)
);

alter table public.productos
  add column if not exists costo integer
    check (costo is null or (costo >= 0 and costo <= 10000000));

alter table public.productos
  add column if not exists imagen_url text
    check (
      imagen_url is null
      or (
        char_length(imagen_url) between 8 and 200000
        and (
          imagen_url like 'https://%'
          or imagen_url like 'http://%'
          or imagen_url like 'data:image/%'
        )
      )
    );

alter table public.categorias enable row level security;

revoke all on table public.categorias from anon, authenticated;
grant all on table public.categorias to service_role;
grant select, insert, update, delete on public.categorias to authenticated;

drop policy if exists "categorias de mi scope" on public.categorias;
create policy "categorias de mi scope" on public.categorias
  for select using (public.puede_ver_local(local_id));

drop policy if exists "categorias alta" on public.categorias;
create policy "categorias alta" on public.categorias
  for insert with check (
    public.auth_gestiona_local(local_id)
    and public.local_tiene_modulo(local_id, 'pagos')
    and public.local_operativo(local_id)
  );

drop policy if exists "categorias editar" on public.categorias;
create policy "categorias editar" on public.categorias
  for update using (public.auth_gestiona_local(local_id))
  with check (
    public.auth_gestiona_local(local_id)
    and public.local_tiene_modulo(local_id, 'pagos')
    and public.local_operativo(local_id)
  );

drop policy if exists "categorias baja" on public.categorias;
create policy "categorias baja" on public.categorias
  for delete using (public.auth_gestiona_local(local_id));

-- PostgREST keeps its own schema cache. Without this, /panel/menu 404s the
-- new table and columns until the API restarts.
notify pgrst, 'reload schema';
