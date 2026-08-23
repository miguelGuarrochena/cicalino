-- ===========================================================================
-- Cicalino — Qué le falta a la base
-- Correr en: Supabase Dashboard → SQL Editor
-- Solo lee. No modifica nada.
--
-- Una sola consulta a propósito: el editor muestra únicamente el resultado
-- de la última, así que si esto fueran dos, la mitad se perdería.
--
-- Cada fila que devuelva es una migración que te falta correr. Si no
-- devuelve nada, la base está al día.
-- ===========================================================================

with esperado (tabla, columna, migracion) as (
  values
    ('organizaciones', 'estado_suscripcion',  'suscripciones.sql'),
    ('organizaciones', 'prueba_inicio',       'suscripciones.sql'),
    ('organizaciones', 'prueba_fin',          'suscripciones.sql'),
    ('organizaciones', 'proxima_factura',     'suscripciones.sql'),
    ('organizaciones', 'dia_ciclo',           'suscripciones.sql'),
    ('organizaciones', 'ultimo_pago_en',      'suscripciones.sql'),
    ('organizaciones', 'suspendida_en',       'suscripciones.sql'),
    ('organizaciones', 'bienvenida_en',       'suscripciones.sql'),
    ('organizaciones', 'proximo_cobro_en',    'proximo-cobro.sql'),
    ('organizaciones', 'contrato_token',      'contrato-aceptacion.sql'),
    ('organizaciones', 'contrato_aceptado_en','contrato-aceptacion.sql'),
    ('locales',        'cobro_desde',         'suscripciones.sql'),
    ('locales',        'activa',              'sucursales-activa.sql'),
    ('locales',        'baja_en',             'sucursales-activa.sql'),
    ('locales',        'responsable_id',      'usuarios-sucursales.sql'),
    ('locales',        'reserva_abre_min',     'reservas-horario-local.sql'),
    ('locales',        'reserva_cierra_min',   'reservas-horario-local.sql'),
    ('locales',        'dias_cerrados',        'reservas-horario-local.sql'),
    ('empleados',      'usuario_id',          'empleados-acceso.sql'),
    ('pagos',          'detalle',             'pagos-detalle.sql'),
    ('pedidos',        'alias_cliente',       'alias-cliente.sql')
),
tablas (nombre, migracion) as (
  values
    ('pagos',            'suscripciones.sql'),
    ('emails_enviados',  'emails-enviados.sql'),
    ('usuario_sucursal', 'usuarios-sucursales.sql'),
    ('esperas',          'modulo-espera.sql'),
    ('mesas',            'modulo-espera.sql'),
    ('reservas',         'reservas-mesa.sql'),
    ('pedidos_sucursal', 'pedidos-sucursal.sql')
)
select migracion, falta, detalle
from (
  select
    t.migracion,
    'tabla entera' as falta,
    t.nombre       as detalle
  from tablas t
  where to_regclass('public.' || t.nombre) is null

  union all

  select
    e.migracion,
    'columna' as falta,
    e.tabla || '.' || e.columna as detalle
  from esperado e
  where to_regclass('public.' || e.tabla) is not null
    and not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name   = e.tabla
        and c.column_name  = e.columna
    )
) x
order by migracion, falta desc, detalle;
