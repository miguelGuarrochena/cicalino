-- ===========================================================================
-- Cicalino — Qué le falta a la base
-- Correr en: Supabase Dashboard → SQL Editor
-- Solo lee. No modifica nada.
--
-- La app pide todas estas columnas en una sola consulta. Si falta una,
-- Postgres rechaza la consulta entera y el listado de empresas se ve vacío,
-- aunque los datos estén ahí.
-- ===========================================================================

with esperado (tabla, columna, migracion) as (
  values
    ('organizaciones', 'estado_suscripcion', 'suscripciones.sql'),
    ('organizaciones', 'prueba_inicio',      'suscripciones.sql'),
    ('organizaciones', 'prueba_fin',         'suscripciones.sql'),
    ('organizaciones', 'proxima_factura',    'suscripciones.sql'),
    ('organizaciones', 'dia_ciclo',          'suscripciones.sql'),
    ('organizaciones', 'ultimo_pago_en',     'suscripciones.sql'),
    ('organizaciones', 'suspendida_en',      'suscripciones.sql'),
    ('organizaciones', 'bienvenida_en',      'suscripciones.sql'),
    ('organizaciones', 'proximo_cobro_en',   'proximo-cobro.sql'),
    ('organizaciones', 'contrato_aceptado_en','contrato-aceptacion.sql'),
    ('organizaciones', 'contrato_token',     'contrato-aceptacion.sql'),
    ('locales',        'cobro_desde',        'suscripciones.sql'),
    ('locales',        'activa',             'sucursales-activa.sql'),
    ('locales',        'baja_en',            'sucursales-activa.sql'),
    ('locales',        'responsable_id',     'usuarios-sucursales.sql'),
    ('empleados',      'usuario_id',         'empleados-acceso.sql'),
    ('pagos',          'detalle',            'pagos-detalle.sql')
)
select
  e.migracion  as correr_esta_migracion,
  e.tabla,
  e.columna
from esperado e
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name   = e.tabla
 and c.column_name  = e.columna
where c.column_name is null
order by e.migracion, e.tabla, e.columna;

-- Tablas que también tienen que existir.
select t.nombre as tabla_faltante, t.migracion
from (values
  ('pagos',            'suscripciones.sql'),
  ('emails_enviados',  'emails-enviados.sql'),
  ('usuario_sucursal', 'usuarios-sucursales.sql'),
  ('esperas',          'modulo-espera.sql'),
  ('mesas',            'modulo-espera.sql'),
  ('reservas',         'reservas-mesa.sql')
) as t(nombre, migracion)
where to_regclass('public.' || t.nombre) is null;
