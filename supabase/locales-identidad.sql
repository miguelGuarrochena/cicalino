-- ===========================================================================
-- Cicalino — Identidad visual del local (logo + color de marca)
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: setup.sql
--
-- El nombre sigue en locales.nombre. Estos dos campos son opcionales y solo
-- afectan la experiencia del comensal (/m, /p, /e). null = crema Cicalino.
-- blanco y azul son fondos explícitos (panadería / noche Cicalino).
-- ===========================================================================

alter table public.locales
  add column if not exists logo_url text;

alter table public.locales
  add column if not exists color_marca text;

alter table public.locales
  drop constraint if exists locales_color_marca_valido;

alter table public.locales
  add constraint locales_color_marca_valido
  check (
    color_marca is null
    or color_marca in ('blanco', 'azul', 'negro', 'bordo', 'verde', 'terracota')
  );

comment on column public.locales.logo_url is
  'Logo opcional del local para la experiencia del comensal. null = solo el nombre.';

comment on column public.locales.color_marca is
  'Fondo del comensal: blanco, azul (noche Cicalino), negro, bordo, verde o terracota. null = crema Cicalino. No es el Light/Dark del panel.';
