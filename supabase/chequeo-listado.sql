-- ===========================================================================
-- Cicalino — Por qué no aparecen las empresas
-- Correr en: Supabase Dashboard → SQL Editor
-- Solo lee. No modifica nada.
--
-- Una sola consulta a propósito: el editor muestra únicamente el resultado
-- de la última, así que todo tiene que venir en la misma fila.
-- ===========================================================================

select
  (select count(*) from public.organizaciones)                       as empresas,
  (select count(*) from public.locales)                              as sucursales,
  (select count(*) from public.usuarios where rol = 'superadmin')    as superadmins,
  (select string_agg(email || ' = ' || rol, '  |  ' order by email)
     from public.usuarios)                                           as usuarios,
  (select string_agg(nombre, '  |  ' order by creado_en desc)
     from (select nombre, creado_en from public.organizaciones
           order by creado_en desc limit 5) u)                       as ultimas_empresas;
