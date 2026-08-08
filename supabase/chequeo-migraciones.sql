-- ===========================================================================
-- Cicalino — ¿Están aplicadas todas las migraciones?
-- Correr en: Supabase Dashboard → SQL Editor. SOLO LECTURA, no cambia nada.
--
-- Los scripts de esta carpeta se corren a mano, así que desde afuera no hay
-- forma de saber cuáles se aplicaron. Esto lo resuelve al revés: lista los
-- 169 objetos que deberían existir —funciones, tablas, columnas, índices,
-- constraints, triggers y policies— y pregunta cuáles están.
--
-- Generado a partir de los propios scripts, respetando el orden y la última
-- acción sobre cada objeto: lo que un script crea y otro posterior borra (las
-- policies viejas, el trigger de cupo que sacó sin-cupo.sql) no se espera acá.
--
-- Es UNA sola consulta a propósito: el editor de Supabase muestra solo el
-- resultado de la última sentencia, así que partirlo en bloques esconde la
-- respuesta.
--
-- Una fila por script. `estado` en OK = ese script está aplicado.
-- ===========================================================================

with esperado (archivo, tipo, nombre) as (
  values
    ('security-fixes-03.sql', 'column', 'empleados.pin_hash'),
    ('security-fixes-03.sql', 'column', 'empleados.tiene_pin'),
    ('security-fixes-04.sql', 'column', 'empleados.usuario_id'),
    ('sucursales-activa.sql', 'column', 'locales.activa'),
    ('sucursales-activa.sql', 'column', 'locales.baja_en'),
    ('suscripciones.sql', 'column', 'locales.cobro_desde'),
    ('setup.sql', 'column', 'locales.hora_corte'),
    ('modulo-espera.sql', 'column', 'locales.modulo_espera'),
    ('modulo-espera.sql', 'column', 'locales.modulo_pedidos'),
    ('usuarios-sucursales.sql', 'column', 'locales.responsable_id'),
    ('mesas-capacidad.sql', 'column', 'mesas.capacidad'),
    ('reservas-mesa.sql', 'column', 'mesas.reserva_id'),
    ('proximo-cobro.sql', 'column', 'organizaciones.aviso_cobro_en'),
    ('aviso-interno.sql', 'column', 'organizaciones.aviso_interno_en'),
    ('suscripciones.sql', 'column', 'organizaciones.aviso_prueba_5d_en'),
    ('suscripciones.sql', 'column', 'organizaciones.aviso_prueba_fin_en'),
    ('suscripciones.sql', 'column', 'organizaciones.bienvenida_en'),
    ('contrato-aceptacion.sql', 'column', 'organizaciones.contrato_aceptado_en'),
    ('contrato-aceptacion.sql', 'column', 'organizaciones.contrato_token'),
    ('suscripciones.sql', 'column', 'organizaciones.dia_ciclo'),
    ('suscripciones.sql', 'column', 'organizaciones.estado_suscripcion'),
    ('setup.sql', 'column', 'organizaciones.mes_gratis_hasta'),
    ('modulo-espera.sql', 'column', 'organizaciones.modulo_espera'),
    ('modulo-espera.sql', 'column', 'organizaciones.modulo_pedidos'),
    ('setup.sql', 'column', 'organizaciones.plan'),
    ('suscripciones.sql', 'column', 'organizaciones.proxima_factura'),
    ('proximo-cobro.sql', 'column', 'organizaciones.proximo_cobro_en'),
    ('suscripciones.sql', 'column', 'organizaciones.prueba_fin'),
    ('suscripciones.sql', 'column', 'organizaciones.prueba_inicio'),
    ('suscripciones.sql', 'column', 'organizaciones.suspendida_en'),
    ('setup.sql', 'column', 'organizaciones.telefono'),
    ('contrato-aceptacion.sql', 'column', 'organizaciones.terminos_version'),
    ('suscripciones.sql', 'column', 'organizaciones.ultimo_pago_en'),
    ('pagos-detalle.sql', 'column', 'pagos.detalle'),
    ('avisado-en.sql', 'column', 'pedidos.avisado_en'),
    ('setup.sql', 'column', 'pedidos.visto_en'),
    ('modulo-espera.sql', 'column', 'push_subscriptions.espera_id'),
    ('reservas-aviso.sql', 'column', 'reservas.mesas_numeros'),
    ('solicitudes-tipo.sql', 'column', 'solicitudes.cuil'),
    ('solicitudes-tipo.sql', 'column', 'solicitudes.direccion'),
    ('solicitudes-pack.sql', 'column', 'solicitudes.pack'),
    ('solicitudes-tipo.sql', 'column', 'solicitudes.plan'),
    ('solicitudes-tipo.sql', 'column', 'solicitudes.telefono'),
    ('solicitudes-tipo.sql', 'column', 'solicitudes.tipo'),
    ('security-fixes-02.sql', 'constraint', 'empleados.empleados_nombre_len'),
    ('security-fixes-02.sql', 'constraint', 'empleados.empleados_pin_formato'),
    ('security-fixes-02.sql', 'constraint', 'empleados.empleados_rol_len'),
    ('espera-constraints.sql', 'constraint', 'esperas.esperas_expira_razonable'),
    ('espera-constraints.sql', 'constraint', 'esperas.esperas_mesa_numero_rango'),
    ('espera-constraints.sql', 'constraint', 'esperas.esperas_nombre_len'),
    ('espera-constraints.sql', 'constraint', 'esperas.esperas_personas_rango'),
    ('espera-constraints.sql', 'constraint', 'esperas.esperas_qr_token_uuid'),
    ('security-fixes-02.sql', 'constraint', 'locales.locales_direccion_len'),
    ('security-fixes-02.sql', 'constraint', 'locales.locales_hora_corte_rango'),
    ('security-fixes-02.sql', 'constraint', 'locales.locales_mesas_rango'),
    ('security-fixes-02.sql', 'constraint', 'locales.locales_nombre_len'),
    ('security-fixes-02.sql', 'constraint', 'locales.locales_whatsapp_len'),
    ('espera-constraints.sql', 'constraint', 'mesas.mesas_capacidad_rango'),
    ('reservas-mesa.sql', 'constraint', 'mesas.mesas_estado_check'),
    ('espera-constraints.sql', 'constraint', 'mesas.mesas_estado_valido'),
    ('espera-constraints.sql', 'constraint', 'mesas.mesas_numero_rango'),
    ('security-fixes-02.sql', 'constraint', 'organizaciones.org_cuil_formato'),
    ('security-fixes-02.sql', 'constraint', 'organizaciones.org_cupo_rango'),
    ('security-fixes-02.sql', 'constraint', 'organizaciones.org_email_formato'),
    ('security-fixes-02.sql', 'constraint', 'organizaciones.org_nombre_len'),
    ('security-fixes-02.sql', 'constraint', 'organizaciones.org_plan_valido'),
    ('security-fixes-02.sql', 'constraint', 'pedidos.pedidos_expira_razonable'),
    ('security-fixes-02.sql', 'constraint', 'pedidos.pedidos_qr_token_uuid'),
    ('security-fixes-02.sql', 'constraint', 'pedidos.pedidos_referencia_len'),
    ('security-fixes-02.sql', 'constraint', 'push_subscriptions.push_endpoint_https'),
    ('security-fixes-02.sql', 'constraint', 'push_subscriptions.push_keys_len'),
    ('push-indices.sql', 'constraint', 'push_subscriptions.push_subscriptions_espera_fk'),
    ('reservas-sin-solape.sql', 'constraint', 'reserva_mesas.reserva_mesas_sin_solape'),
    ('espera-constraints.sql', 'constraint', 'reservas.reservas_gracia_valida'),
    ('espera-constraints.sql', 'constraint', 'reservas.reservas_mesa_numero_rango'),
    ('espera-constraints.sql', 'constraint', 'reservas.reservas_nombre_len'),
    ('espera-constraints.sql', 'constraint', 'reservas.reservas_personas_rango'),
    ('security-fixes-02.sql', 'constraint', 'solicitudes.solicitudes_ciudad_len'),
    ('security-fixes-02.sql', 'constraint', 'solicitudes.solicitudes_email_len'),
    ('security-fixes-02.sql', 'constraint', 'solicitudes.solicitudes_estado_valido'),
    ('security-fixes-02.sql', 'constraint', 'solicitudes.solicitudes_local_len'),
    ('security-fixes-02.sql', 'constraint', 'solicitudes.solicitudes_nombre_len'),
    ('solicitudes-pack.sql', 'constraint', 'solicitudes.solicitudes_pack_valido'),
    ('solicitudes-tipo.sql', 'constraint', 'solicitudes.solicitudes_plan_valido'),
    ('solicitudes-tipo.sql', 'constraint', 'solicitudes.solicitudes_tipo_valido'),
    ('setup.sql', 'constraint', 'usuarios.usuarios_id_auth_fk'),
    ('security-fixes-01.sql', 'function', 'auth_local'),
    ('security-fixes-04.sql', 'function', 'auth_locales'),
    ('setup.sql', 'function', 'auth_org'),
    ('setup.sql', 'function', 'auth_rol'),
    ('metricas.sql', 'function', 'bucket_metrica'),
    ('espera-constraints.sql', 'function', 'chequear_transicion_espera'),
    ('security-fixes-02.sql', 'function', 'chequear_transicion_pedido'),
    ('espera-constraints.sql', 'function', 'chequear_transicion_reserva'),
    ('cola-espera.sql', 'function', 'cola_de_espera'),
    ('reservas-sin-solape.sql', 'function', 'crear_reserva'),
    ('reservas-expirar.sql', 'function', 'expirar_reservas_local'),
    ('reservas-expirar.sql', 'function', 'expirar_reservas_vencidas'),
    ('security-fixes-01.sql', 'function', 'handle_new_user'),
    ('corte-por-impago.sql', 'function', 'local_operativo'),
    ('sentar-walkin.sql', 'function', 'mesa_en_ventana_de_reserva'),
    ('metricas.sql', 'function', 'metricas_espera'),
    ('metricas.sql', 'function', 'metricas_pedidos'),
    ('pedidos-paginado.sql', 'function', 'pedidos_pagina'),
    ('security-fixes-01.sql', 'function', 'proteger_rol_usuario'),
    ('security-fixes-04.sql', 'function', 'puede_ver_local'),
    ('push-indices.sql', 'function', 'purgar_push_viejas'),
    ('reservas-atomicas.sql', 'function', 'reservas_gap_minutos'),
    ('sentar-walkin.sql', 'function', 'sentar_walkin'),
    ('security-fixes-03.sql', 'function', 'set_empleado_pin'),
    ('reservas-atomicas.sql', 'function', 'sincronizar_mesas'),
    ('cron-lock.sql', 'function', 'soltar_cron_lock'),
    ('reservas-sin-solape.sql', 'function', 'sync_reserva_mesas'),
    ('cron-lock.sql', 'function', 'tomar_cron_lock'),
    ('security-fixes-03.sql', 'function', 'verificar_pin_empleado'),
    ('emails-enviados.sql', 'index', 'idx_emails_org_fecha'),
    ('security-fixes-04.sql', 'index', 'idx_empleados_usuario'),
    ('modulo-espera.sql', 'index', 'idx_esperas_local_creado'),
    ('modulo-espera.sql', 'index', 'idx_esperas_local_estado'),
    ('modulo-espera.sql', 'index', 'idx_mesas_local'),
    ('suscripciones.sql', 'index', 'idx_pagos_org_fecha'),
    ('pedidos-sucursal.sql', 'index', 'idx_pedidos_sucursal_estado'),
    ('pedidos-sucursal.sql', 'index', 'idx_pedidos_sucursal_org'),
    ('push-indices.sql', 'index', 'idx_push_espera'),
    ('reservas-expirar.sql', 'index', 'idx_reservas_activas_horario'),
    ('reservas-mesa.sql', 'index', 'idx_reservas_local_estado'),
    ('reservas-aviso.sql', 'index', 'idx_reservas_local_estado_horario'),
    ('reservas-mesa.sql', 'index', 'idx_reservas_local_horario'),
    ('usuarios-sucursales.sql', 'index', 'idx_usuario_sucursal_local'),
    ('empleados-nombre-unico.sql', 'index', 'uq_empleados_local_nombre'),
    ('modulo-espera.sql', 'index', 'uq_esperas_qr_token'),
    ('contrato-aceptacion.sql', 'index', 'uq_organizaciones_contrato_token'),
    ('pedidos-sucursal.sql', 'index', 'uq_pedidos_sucursal_nueva_por_org'),
    ('push-indices.sql', 'index', 'uq_push_endpoint'),
    ('usuarios-sucursales.sql', 'policy', 'acceso de mi org'),
    ('emails-enviados.sql', 'policy', 'emails solo superadmin'),
    ('security-fixes-01.sql', 'policy', 'empleados de mi scope'),
    ('modulo-espera.sql', 'policy', 'esperas de mi org'),
    ('corte-por-impago.sql', 'policy', 'esperas de mi scope'),
    ('setup.sql', 'policy', 'locales delete SA'),
    ('setup.sql', 'policy', 'locales insert SA'),
    ('security-fixes-01.sql', 'policy', 'locales select org/SA'),
    ('security-fixes-01.sql', 'policy', 'locales update org/SA'),
    ('modulo-espera.sql', 'policy', 'mesas de mi org'),
    ('corte-por-impago.sql', 'policy', 'mesas de mi scope'),
    ('setup.sql', 'policy', 'org de mi empresa'),
    ('setup.sql', 'policy', 'org update SA'),
    ('suscripciones.sql', 'policy', 'pagos solo superadmin'),
    ('corte-por-impago.sql', 'policy', 'pedidos de mi scope'),
    ('pedidos-sucursal.sql', 'policy', 'pedidos_sucursal_select'),
    ('empleados-acceso.sql', 'policy', 'perfil propio'),
    ('reservas-mesa.sql', 'policy', 'reservas de mi org'),
    ('corte-por-impago.sql', 'policy', 'reservas de mi scope'),
    ('cron-lock.sql', 'table', 'cron_locks'),
    ('emails-enviados.sql', 'table', 'emails_enviados'),
    ('modulo-espera.sql', 'table', 'esperas'),
    ('modulo-espera.sql', 'table', 'mesas'),
    ('suscripciones.sql', 'table', 'pagos'),
    ('pedidos-sucursal.sql', 'table', 'pedidos_sucursal'),
    ('reservas-sin-solape.sql', 'table', 'reserva_mesas'),
    ('reservas-mesa.sql', 'table', 'reservas'),
    ('setup.sql', 'table', 'solicitudes'),
    ('usuarios-sucursales.sql', 'table', 'usuario_sucursal'),
    ('espera-constraints.sql', 'trigger', 'esperas_transicion'),
    ('security-fixes-01.sql', 'trigger', 'on_auth_user_created'),
    ('security-fixes-02.sql', 'trigger', 'pedidos_transicion'),
    ('reservas-sin-solape.sql', 'trigger', 'reservas_sync_mesas'),
    ('espera-constraints.sql', 'trigger', 'reservas_transicion'),
    ('security-fixes-01.sql', 'trigger', 'usuarios_proteger_rol')
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
  e.archivo                                   as script,
  count(*)                                    as objetos,
  count(*) - count(x.nombre)                  as faltan,
  case when count(*) = count(x.nombre)
       then 'OK'
       else 'FALTA CORRER' end                as estado,
  string_agg(
    case when x.nombre is null then e.tipo || ' ' || e.nombre end,
    ', ' order by e.tipo, e.nombre
  )                                           as que_falta
from esperado e
left join existentes x on x.tipo = e.tipo and x.nombre = e.nombre
group by e.archivo
order by faltan desc, e.archivo;


-- ---------------------------------------------------------------------------
-- Lo que esto NO cubre, para que no dé una falsa tranquilidad:
--
--  · Los tipos enum (estado_suscripcion, espera_estado, reserva_estado…) y las
--    extensiones (pgcrypto, btree_gist). Si falta alguno, los scripts que los
--    usan fallan al correr, así que se nota igual.
--  · Que el contenido de una función sea el último: `create or replace` no
--    cambia el nombre. Si corriste una versión vieja de un script, el objeto
--    figura presente. Para eso está el git de esta carpeta.
--  · Los datos: backfills, limpiezas y los bloques de reparación que dejé
--    comentados en varios scripts.
-- ---------------------------------------------------------------------------
