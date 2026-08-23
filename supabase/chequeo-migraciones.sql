-- ===========================================================================
-- Cicalino — ¿Están aplicadas todas las migraciones, y en qué orden correr las que faltan?
-- Correr en: Supabase Dashboard → SQL Editor. SOLO LECTURA, no cambia nada.
--
-- Los scripts de esta carpeta se corren a mano, así que desde afuera no hay
-- forma de saber cuáles se aplicaron. Esto lo resuelve al revés: lista los
-- objetos que deberían existir y pregunta cuáles están.
--
-- La columna `orden` importa tanto como `estado`: varios scripts dependen de
-- otros. reservas-sin-solape.sql usa reservas_gap_minutos(), que crea
-- reservas-atomicas.sql, y corriéndolo antes falla con "function does not
-- exist". Ordená por esa columna y andá de arriba hacia abajo.
--
-- Una sola consulta a propósito: el editor de Supabase muestra solo el
-- resultado de la última sentencia.
-- ===========================================================================

with esperado (archivo, tipo, nombre, orden) as (
  values
    ('security-fixes-03.sql', 'column', 'empleados.pin_hash', 4),
    ('security-fixes-03.sql', 'column', 'empleados.tiene_pin', 4),
    ('security-fixes-04.sql', 'column', 'empleados.usuario_id', 9),
    ('sucursales-activa.sql', 'column', 'locales.activa', 37),
    ('sucursales-activa.sql', 'column', 'locales.baja_en', 37),
    ('suscripciones.sql', 'column', 'locales.cobro_desde', 24),
    ('setup.sql', 'column', 'locales.hora_corte', 1),
    ('modulo-espera.sql', 'column', 'locales.modulo_espera', 7),
    ('modulo-espera.sql', 'column', 'locales.modulo_pedidos', 7),
    ('usuarios-sucursales.sql', 'column', 'locales.responsable_id', 5),
    ('reservas-horario-local.sql', 'column', 'locales.reserva_abre_min', 53),
    ('reservas-horario-local.sql', 'column', 'locales.reserva_cierra_min', 53),
    ('reservas-horario-local.sql', 'column', 'locales.dias_cerrados', 53),
    ('mesas-capacidad.sql', 'column', 'mesas.capacidad', 21),
    ('reservas-mesa.sql', 'column', 'mesas.reserva_id', 8),
    ('proximo-cobro.sql', 'column', 'organizaciones.aviso_cobro_en', 28),
    ('aviso-interno.sql', 'column', 'organizaciones.aviso_interno_en', 11),
    ('suscripciones.sql', 'column', 'organizaciones.aviso_prueba_5d_en', 24),
    ('suscripciones.sql', 'column', 'organizaciones.aviso_prueba_fin_en', 24),
    ('suscripciones.sql', 'column', 'organizaciones.bienvenida_en', 24),
    ('contrato-aceptacion.sql', 'column', 'organizaciones.contrato_aceptado_en', 13),
    ('contrato-aceptacion.sql', 'column', 'organizaciones.contrato_token', 13),
    ('security-fixes-11.sql', 'column', 'organizaciones.contrato_token_creado_en', 46),
    ('security-fixes-12.sql', 'column', 'cron_locks.token', 47),
    ('security-fixes-13.sql', 'table', 'cicalino_schema_migrations', 48),
    ('security-fixes-15.sql', 'table', 'pin_intentos', 50),
    ('suscripciones.sql', 'column', 'organizaciones.dia_ciclo', 24),
    ('suscripciones.sql', 'column', 'organizaciones.estado_suscripcion', 24),
    ('setup.sql', 'column', 'organizaciones.mes_gratis_hasta', 1),
    ('modulo-espera.sql', 'column', 'organizaciones.modulo_espera', 7),
    ('modulo-espera.sql', 'column', 'organizaciones.modulo_pedidos', 7),
    ('setup.sql', 'column', 'organizaciones.plan', 1),
    ('suscripciones.sql', 'column', 'organizaciones.proxima_factura', 24),
    ('proximo-cobro.sql', 'column', 'organizaciones.proximo_cobro_en', 28),
    ('suscripciones.sql', 'column', 'organizaciones.prueba_fin', 24),
    ('suscripciones.sql', 'column', 'organizaciones.prueba_inicio', 24),
    ('suscripciones.sql', 'column', 'organizaciones.suspendida_en', 24),
    ('setup.sql', 'column', 'organizaciones.telefono', 1),
    ('contrato-aceptacion.sql', 'column', 'organizaciones.terminos_version', 13),
    ('suscripciones.sql', 'column', 'organizaciones.ultimo_pago_en', 24),
    ('pagos-detalle.sql', 'column', 'pagos.detalle', 25),
    ('avisado-en.sql', 'column', 'pedidos.avisado_en', 10),
    ('alias-cliente.sql', 'column', 'pedidos.alias_cliente', 56),
    ('setup.sql', 'column', 'pedidos.visto_en', 1),
    ('modulo-espera.sql', 'column', 'push_subscriptions.espera_id', 7),
    ('reservas-aviso.sql', 'column', 'reservas.mesas_numeros', 31),
    ('solicitudes-tipo.sql', 'column', 'solicitudes.cuil', 36),
    ('solicitudes-tipo.sql', 'column', 'solicitudes.direccion', 36),
    ('solicitudes-pack.sql', 'column', 'solicitudes.pack', 35),
    ('solicitudes-tipo.sql', 'column', 'solicitudes.plan', 36),
    ('solicitudes-tipo.sql', 'column', 'solicitudes.telefono', 36),
    ('solicitudes-tipo.sql', 'column', 'solicitudes.tipo', 36),
    ('security-fixes-02.sql', 'constraint', 'empleados.empleados_nombre_len', 3),
    ('security-fixes-02.sql', 'constraint', 'empleados.empleados_pin_formato', 3),
    ('security-fixes-02.sql', 'constraint', 'empleados.empleados_rol_len', 3),
    ('espera-constraints.sql', 'constraint', 'esperas.esperas_expira_razonable', 20),
    ('espera-constraints.sql', 'constraint', 'esperas.esperas_mesa_numero_rango', 20),
    ('espera-constraints.sql', 'constraint', 'esperas.esperas_nombre_len', 20),
    ('espera-constraints.sql', 'constraint', 'esperas.esperas_personas_rango', 20),
    ('espera-constraints.sql', 'constraint', 'esperas.esperas_qr_token_uuid', 20),
    ('security-fixes-02.sql', 'constraint', 'locales.locales_direccion_len', 3),
    ('security-fixes-02.sql', 'constraint', 'locales.locales_hora_corte_rango', 3),
    ('security-fixes-02.sql', 'constraint', 'locales.locales_mesas_rango', 3),
    ('security-fixes-02.sql', 'constraint', 'locales.locales_nombre_len', 3),
    ('security-fixes-02.sql', 'constraint', 'locales.locales_whatsapp_len', 3),
    ('reservas-horario-local.sql', 'constraint', 'locales.locales_reserva_abre_rango', 53),
    ('reservas-horario-local.sql', 'constraint', 'locales.locales_reserva_cierra_rango', 53),
    ('reservas-horario-local.sql', 'constraint', 'locales.locales_reserva_ventana', 53),
    ('reservas-horario-local.sql', 'constraint', 'locales.locales_dias_cerrados_rango', 53),
    ('espera-constraints.sql', 'constraint', 'mesas.mesas_capacidad_rango', 20),
    ('reservas-mesa.sql', 'constraint', 'mesas.mesas_estado_check', 8),
    ('espera-constraints.sql', 'constraint', 'mesas.mesas_estado_valido', 20),
    ('espera-constraints.sql', 'constraint', 'mesas.mesas_numero_rango', 20),
    ('security-fixes-02.sql', 'constraint', 'organizaciones.org_cuil_formato', 3),
    ('security-fixes-02.sql', 'constraint', 'organizaciones.org_cupo_rango', 3),
    ('security-fixes-02.sql', 'constraint', 'organizaciones.org_email_formato', 3),
    ('security-fixes-02.sql', 'constraint', 'organizaciones.org_nombre_len', 3),
    ('security-fixes-02.sql', 'constraint', 'organizaciones.org_plan_valido', 3),
    ('security-fixes-02.sql', 'constraint', 'pedidos.pedidos_expira_razonable', 3),
    ('security-fixes-02.sql', 'constraint', 'pedidos.pedidos_qr_token_uuid', 3),
    ('security-fixes-02.sql', 'constraint', 'pedidos.pedidos_referencia_len', 3),
    ('security-fixes-02.sql', 'constraint', 'push_subscriptions.push_endpoint_https', 3),
    ('security-fixes-02.sql', 'constraint', 'push_subscriptions.push_keys_len', 3),
    ('push-indices.sql', 'constraint', 'push_subscriptions.push_subscriptions_espera_fk', 29),
    ('reservas-sin-solape.sql', 'constraint', 'reserva_mesas.reserva_mesas_sin_solape', 33),
    ('espera-constraints.sql', 'constraint', 'reservas.reservas_gracia_valida', 20),
    ('espera-constraints.sql', 'constraint', 'reservas.reservas_mesa_numero_rango', 20),
    ('espera-constraints.sql', 'constraint', 'reservas.reservas_nombre_len', 20),
    ('espera-constraints.sql', 'constraint', 'reservas.reservas_personas_rango', 20),
    ('security-fixes-02.sql', 'constraint', 'solicitudes.solicitudes_ciudad_len', 3),
    ('security-fixes-02.sql', 'constraint', 'solicitudes.solicitudes_email_len', 3),
    ('security-fixes-02.sql', 'constraint', 'solicitudes.solicitudes_estado_valido', 3),
    ('security-fixes-02.sql', 'constraint', 'solicitudes.solicitudes_local_len', 3),
    ('security-fixes-02.sql', 'constraint', 'solicitudes.solicitudes_nombre_len', 3),
    ('solicitudes-pack.sql', 'constraint', 'solicitudes.solicitudes_pack_valido', 35),
    ('solicitudes-tipo.sql', 'constraint', 'solicitudes.solicitudes_plan_valido', 36),
    ('solicitudes-tipo.sql', 'constraint', 'solicitudes.solicitudes_tipo_valido', 36),
    ('setup.sql', 'constraint', 'usuarios.usuarios_id_auth_fk', 1),
    ('security-fixes-01.sql', 'function', 'auth_local', 2),
    ('security-fixes-04.sql', 'function', 'auth_locales', 9),
    ('setup.sql', 'function', 'auth_org', 1),
    ('setup.sql', 'function', 'auth_rol', 1),
    ('metricas.sql', 'function', 'bucket_metrica', 22),
    ('espera-constraints.sql', 'function', 'chequear_transicion_espera', 20),
    ('security-fixes-02.sql', 'function', 'chequear_transicion_pedido', 3),
    ('espera-constraints.sql', 'function', 'chequear_transicion_reserva', 20),
    ('cola-espera.sql', 'function', 'cola_de_espera', 12),
    ('reservas-sin-solape.sql', 'function', 'crear_reserva', 33),
    ('reservas-expirar.sql', 'function', 'expirar_reservas_local', 32),
    ('reservas-expirar.sql', 'function', 'expirar_reservas_vencidas', 32),
    ('security-fixes-01.sql', 'function', 'handle_new_user', 2),
    ('corte-por-impago.sql', 'function', 'local_operativo', 16),
    ('sentar-walkin.sql', 'function', 'mesa_en_ventana_de_reserva', 15),
    ('metricas.sql', 'function', 'metricas_espera', 22),
    ('metricas.sql', 'function', 'metricas_pedidos', 22),
    ('pedidos-paginado.sql', 'function', 'pedidos_pagina', 26),
    ('security-fixes-10.sql', 'function', 'crear_pedido', 45),
    ('security-fixes-01.sql', 'function', 'proteger_rol_usuario', 2),
    ('security-fixes-04.sql', 'function', 'puede_ver_local', 9),
    ('push-indices.sql', 'function', 'purgar_push_viejas', 29),
    ('reservas-atomicas.sql', 'function', 'reservas_gap_minutos', 14),
    ('sentar-walkin.sql', 'function', 'sentar_walkin', 15),
    ('sentar-espera-reserva.sql', 'function', 'sentar_espera', 54),
    ('sentar-espera-reserva.sql', 'function', 'sentar_reserva', 54),
    ('pedidos-pagina-jornada.sql', 'function', 'pedidos_pagina', 55),
    ('alias-cliente.sql', 'function', 'pedidos_pagina', 56),
    ('security-fixes-03.sql', 'function', 'set_empleado_pin', 4),
    ('reservas-atomicas.sql', 'function', 'sincronizar_mesas', 14),
    ('cron-lock.sql', 'function', 'soltar_cron_lock', 17),
    ('reservas-sin-solape.sql', 'function', 'sync_reserva_mesas', 33),
    ('cron-lock.sql', 'function', 'tomar_cron_lock', 17),
    ('security-fixes-03.sql', 'function', 'verificar_pin_empleado', 4),
    ('emails-enviados.sql', 'index', 'idx_emails_org_fecha', 18),
    ('security-fixes-04.sql', 'index', 'idx_empleados_usuario', 9),
    ('modulo-espera.sql', 'index', 'idx_esperas_local_creado', 7),
    ('modulo-espera.sql', 'index', 'idx_esperas_local_estado', 7),
    ('modulo-espera.sql', 'index', 'idx_mesas_local', 7),
    ('suscripciones.sql', 'index', 'idx_pagos_org_fecha', 24),
    ('pedidos-sucursal.sql', 'index', 'idx_pedidos_sucursal_estado', 27),
    ('pedidos-sucursal.sql', 'index', 'idx_pedidos_sucursal_org', 27),
    ('push-indices.sql', 'index', 'idx_push_espera', 29),
    ('reservas-expirar.sql', 'index', 'idx_reservas_activas_horario', 32),
    ('reservas-mesa.sql', 'index', 'idx_reservas_local_estado', 8),
    ('reservas-aviso.sql', 'index', 'idx_reservas_local_estado_horario', 31),
    ('reservas-mesa.sql', 'index', 'idx_reservas_local_horario', 8),
    ('usuarios-sucursales.sql', 'index', 'idx_usuario_sucursal_local', 5),
    ('empleados-nombre-unico.sql', 'index', 'uq_empleados_local_nombre', 19),
    ('modulo-espera.sql', 'index', 'uq_esperas_qr_token', 7),
    ('contrato-aceptacion.sql', 'index', 'uq_organizaciones_contrato_token', 13),
    ('pedidos-sucursal.sql', 'index', 'uq_pedidos_sucursal_nueva_por_org', 27),
    ('push-indices.sql', 'index', 'uq_push_endpoint', 29),
    ('security-fixes-07.sql', 'policy', 'usuario_sucursal select', 42),
    ('security-fixes-07.sql', 'policy', 'usuario_sucursal insert admin', 42),
    ('security-fixes-07.sql', 'policy', 'usuario_sucursal update admin', 42),
    ('security-fixes-07.sql', 'policy', 'usuario_sucursal delete admin', 42),
    ('emails-enviados.sql', 'policy', 'emails solo superadmin', 18),
    ('security-fixes-01.sql', 'policy', 'empleados de mi scope', 2),
    ('modulo-espera.sql', 'policy', 'esperas de mi org', 7),
    ('corte-por-impago.sql', 'policy', 'esperas de mi scope', 16),
    ('setup.sql', 'policy', 'locales delete SA', 1),
    ('setup.sql', 'policy', 'locales insert SA', 1),
    ('security-fixes-01.sql', 'policy', 'locales select org/SA', 2),
    ('security-fixes-01.sql', 'policy', 'locales update org/SA', 2),
    ('modulo-espera.sql', 'policy', 'mesas de mi org', 7),
    ('corte-por-impago.sql', 'policy', 'mesas de mi scope', 16),
    ('setup.sql', 'policy', 'org de mi empresa', 1),
    ('setup.sql', 'policy', 'org update SA', 1),
    ('suscripciones.sql', 'policy', 'pagos solo superadmin', 24),
    ('corte-por-impago.sql', 'policy', 'pedidos de mi scope', 16),
    ('pedidos-sucursal.sql', 'policy', 'pedidos_sucursal_select', 27),
    ('empleados-acceso.sql', 'policy', 'perfil propio', 6),
    ('reservas-mesa.sql', 'policy', 'reservas de mi org', 8),
    ('corte-por-impago.sql', 'policy', 'reservas de mi scope', 16),
    ('cron-lock.sql', 'table', 'cron_locks', 17),
    ('emails-enviados.sql', 'table', 'emails_enviados', 18),
    ('modulo-espera.sql', 'table', 'esperas', 7),
    ('modulo-espera.sql', 'table', 'mesas', 7),
    ('suscripciones.sql', 'table', 'pagos', 24),
    ('pedidos-sucursal.sql', 'table', 'pedidos_sucursal', 27),
    ('reservas-sin-solape.sql', 'table', 'reserva_mesas', 33),
    ('reservas-mesa.sql', 'table', 'reservas', 8),
    ('setup.sql', 'table', 'solicitudes', 1),
    ('usuarios-sucursales.sql', 'table', 'usuario_sucursal', 5),
    ('espera-constraints.sql', 'trigger', 'esperas_transicion', 20),
    ('security-fixes-01.sql', 'trigger', 'on_auth_user_created', 2),
    ('security-fixes-02.sql', 'trigger', 'pedidos_transicion', 3),
    ('reservas-sin-solape.sql', 'trigger', 'reservas_sync_mesas', 33),
    ('espera-constraints.sql', 'trigger', 'reservas_transicion', 20),
    ('security-fixes-01.sql', 'trigger', 'usuarios_proteger_rol', 2)
),
requisitos (archivo, necesita) as (
  values
    ('setup.sql', '—'),
    ('security-fixes-01.sql', 'setup.sql'),
    ('security-fixes-02.sql', '—'),
    ('security-fixes-03.sql', 'security-fixes-01.sql'),
    ('usuarios-sucursales.sql', 'setup.sql'),
    ('empleados-acceso.sql', 'setup.sql'),
    ('modulo-espera.sql', 'setup.sql'),
    ('reservas-mesa.sql', 'setup.sql, modulo-espera.sql'),
    ('security-fixes-04.sql', 'setup.sql, usuarios-sucursales.sql, modulo-espera.sql, reservas-mesa.sql'),
    ('avisado-en.sql', '—'),
    ('aviso-interno.sql', '—'),
    ('cola-espera.sql', 'modulo-espera.sql'),
    ('contrato-aceptacion.sql', '—'),
    ('reservas-atomicas.sql', 'security-fixes-01.sql, modulo-espera.sql, reservas-mesa.sql'),
    ('sentar-walkin.sql', 'security-fixes-01.sql, modulo-espera.sql, reservas-mesa.sql'),
    ('corte-por-impago.sql', 'setup.sql, security-fixes-01.sql, modulo-espera.sql, reservas-mesa.sql, reservas-atomicas.sql, sentar-walkin.sql'),
    ('cron-lock.sql', '—'),
    ('emails-enviados.sql', 'setup.sql'),
    ('empleados-nombre-unico.sql', '—'),
    ('espera-constraints.sql', 'modulo-espera.sql, reservas-mesa.sql'),
    ('mesas-capacidad.sql', 'modulo-espera.sql'),
    ('metricas.sql', 'security-fixes-01.sql, modulo-espera.sql'),
    ('modulos-por-sucursal.sql', '—'),
    ('suscripciones.sql', 'setup.sql'),
    ('pagos-detalle.sql', 'suscripciones.sql'),
    ('pedidos-paginado.sql', 'security-fixes-01.sql'),
    ('pedidos-sucursal.sql', 'setup.sql'),
    ('proximo-cobro.sql', '—'),
    ('push-indices.sql', 'modulo-espera.sql'),
    ('security-fixes-05.sql', 'push-indices.sql'),
    ('security-fixes-06.sql', 'cron-lock.sql'),
    ('security-fixes-07.sql', 'usuarios-sucursales.sql, setup.sql'),
    ('security-fixes-08.sql', 'cola-espera.sql'),
    ('security-fixes-09.sql', 'reservas-atomicas.sql, corte-por-impago.sql'),
    ('security-fixes-10.sql', 'security-fixes-01.sql, security-fixes-04.sql, corte-por-impago.sql, pedidos-paginado.sql'),
    ('security-fixes-11.sql', 'contrato-aceptacion.sql'),
    ('security-fixes-12.sql', 'cron-lock.sql, security-fixes-06.sql'),
    ('security-fixes-13.sql', '—'),
    ('security-fixes-14.sql', 'reservas-expirar.sql'),
    ('security-fixes-15.sql', 'security-fixes-03.sql, security-fixes-10.sql'),
    ('security-fixes-16.sql', 'security-fixes-15.sql'),
    ('security-fixes-17.sql', 'security-fixes-03.sql'),
    ('espera-constraints-validate.sql', 'espera-constraints.sql'),
    ('sentar-espera-reserva.sql', 'sentar-walkin.sql, corte-por-impago.sql, espera-constraints.sql'),
    ('pedidos-pagina-jornada.sql', 'pedidos-paginado.sql, security-fixes-15.sql'),
    ('alias-cliente.sql', 'pedidos-pagina-jornada.sql'),
    ('reservas-horario-local.sql', 'setup.sql, modulo-espera.sql'),
    ('realtime-organizaciones.sql', '—'),
    ('reservas-aviso.sql', 'modulo-espera.sql, reservas-mesa.sql'),
    ('reservas-expirar.sql', 'security-fixes-01.sql, reservas-mesa.sql'),
    ('reservas-sin-solape.sql', 'security-fixes-01.sql, modulo-espera.sql, reservas-mesa.sql, reservas-atomicas.sql, corte-por-impago.sql'),
    ('sin-cupo.sql', 'security-fixes-02.sql'),
    ('solicitudes-pack.sql', '—'),
    ('solicitudes-tipo.sql', '—'),
    ('sucursales-activa.sql', '—'),
    ('tipos-negocio.sql', '—'),
    ('un-solo-modelo-cobro.sql', '—')
),
  existentes as (
    select 'function' as tipo, p.proname as nombre
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
    union all
    select 'table', c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
    union all
    select 'trigger', t.tgname from pg_trigger t where not t.tgisinternal
    union all
    select 'index', i.indexname from pg_indexes i where i.schemaname = 'public'
    union all
    select 'policy', p.policyname from pg_policies p where p.schemaname = 'public'
    union all
    select 'constraint', rel.relname || '.' || con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace n on n.oid = rel.relnamespace
     where n.nspname = 'public'
    union all
    select 'column', c.table_name || '.' || c.column_name
      from information_schema.columns c where c.table_schema = 'public'
  )
select
  min(e.orden)                                as orden,
  e.archivo                                   as script,
  case when count(*) = count(x.nombre)
       then 'OK' else 'FALTA CORRER' end      as estado,
  count(*) - count(x.nombre)                  as faltan,
  max(r.necesita)                             as correr_antes,
  string_agg(
    case when x.nombre is null then e.tipo || ' ' || e.nombre end,
    ', ' order by e.tipo, e.nombre
  )                                           as que_falta
from esperado e
left join existentes x on x.tipo = e.tipo and x.nombre = e.nombre
left join requisitos r on r.archivo = e.archivo
group by e.archivo
order by min(e.orden);


-- ---------------------------------------------------------------------------
-- Lo que esto NO cubre, para que no dé una falsa tranquilidad:
--
--  · Los tipos enum (estado_suscripcion, espera_estado…) y las extensiones
--    (pgcrypto, btree_gist). Si falta alguno, el script que lo usa falla al
--    correr, así que se nota igual.
--  · Que el cuerpo de una función sea el último: `create or replace` no cambia
--    el nombre, así que una versión vieja figura presente. Para eso está git.
--  · Los datos: backfills, limpiezas y los bloques de reparación comentados.
-- ---------------------------------------------------------------------------
