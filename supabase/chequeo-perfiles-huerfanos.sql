-- ===========================================================================
-- Cicalino — Chequeo previo al fix "getCurrentProfile falla cerrado"
-- Correr en: Supabase Dashboard → SQL Editor. Es solo lectura.
--
-- CONTEXTO
-- `getCurrentProfile()` devolvía rol 'admin' por defecto cuando no encontraba
-- la fila de `public.usuarios`. Ahora devuelve null (sin perfil, sin permisos).
--
-- En operación normal la fila siempre existe: la crea el trigger
-- `handle_new_user` en cada alta de Auth. Pero las cuentas creadas ANTES de
-- que corriera `setup.sql` pueden no tenerla, y esas quedarían afuera.
--
-- Este script las lista. Si devuelve 0 filas, el fix se puede deployar sin
-- riesgo. Si devuelve alguna, arreglala con el bloque 3 antes de deployar.
--
-- ⚠️ El editor de Supabase muestra SOLO el resultado de la última sentencia
--    cuando corrés varias juntas. Corré el bloque 0 solo, o cada bloque por
--    separado seleccionándolo con el mouse antes de darle Run.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0) RESUMEN — corré este bloque solo. Responde todo de una.
--    La primera fila es la que decide si se puede deployar.
-- ---------------------------------------------------------------------------
select 'cuentas de Auth sin perfil' as chequeo,
       count(*) as filas,
       'si es > 0, ver bloque 1 antes de mergear' as nota
from auth.users au
left join public.usuarios u on u.id = au.id
where u.id is null
union all
select 'perfiles sin cuenta de Auth', count(*), 'basura, no bloquea el deploy'
from public.usuarios u
left join auth.users au on au.id = u.id
where au.id is null
union all
select 'trigger on_auth_user_created habilitado', count(*), 'tiene que dar 1'
from pg_trigger
where tgrelid = 'auth.users'::regclass
  and tgname = 'on_auth_user_created'
  and tgenabled = 'O';


-- ---------------------------------------------------------------------------
-- 1) El detalle: cuentas de Auth sin fila de perfil.
--    Estas son las que perderían el acceso con el fix.
-- ---------------------------------------------------------------------------
select
  au.id,
  au.email,
  au.created_at,
  au.invited_at,
  au.last_sign_in_at
from auth.users au
left join public.usuarios u on u.id = au.id
where u.id is null
order by au.created_at;


-- ---------------------------------------------------------------------------
-- 2) Al revés: perfiles sin cuenta de Auth (huérfanos del otro lado).
--    No afectan a este fix, pero si aparecen hay basura para limpiar.
-- ---------------------------------------------------------------------------
select u.id, u.email, u.rol, u.organizacion_id
from public.usuarios u
left join auth.users au on au.id = u.id
where au.id is null
order by u.created_at;


-- ---------------------------------------------------------------------------
-- 3) REPARACIÓN — solo si el bloque 1 devolvió filas.
--
-- Revisá esa lista primero: si son cuentas de prueba que ya no usás, borralas
-- desde Authentication → Users en vez de darles perfil.
--
-- Para las que sí correspondan, esto les crea el perfil con el rol mínimo
-- ('admin' sin organización = no ve datos de nadie). Después hay que
-- asignarles la organización a mano desde el panel de Superadmin.
--
-- Descomentá para ejecutar.
-- ---------------------------------------------------------------------------
-- insert into public.usuarios (id, email, nombre, rol)
-- select au.id, au.email, coalesce(au.raw_user_meta_data ->> 'nombre', ''), 'admin'
-- from auth.users au
-- left join public.usuarios u on u.id = au.id
-- where u.id is null
-- on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- 4) Salud del trigger que evita que esto vuelva a pasar.
--    Tiene que devolver on_auth_user_created con estado 'habilitado'.
--
--    Nota: tgenabled es de tipo "char" y sus valores son O (origin =
--    habilitado), D (deshabilitado), R y A. La 'O' es la letra, no un cero:
--    en la fuente del editor de Supabase se confunden.
-- ---------------------------------------------------------------------------
select
  tgname,
  tgenabled,
  case tgenabled
    when 'O' then 'habilitado'
    when 'D' then 'DESHABILITADO'
    when 'R' then 'solo replica'
    when 'A' then 'siempre'
  end as estado
from pg_trigger
where tgrelid = 'auth.users'::regclass
  and not tgisinternal;
