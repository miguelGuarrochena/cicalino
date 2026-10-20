-- El panel escucha postgres_changes de pedidos filtrado por local_id.
-- Con replica identity DEFAULT un UPDATE solo publica la clave, el filtro
-- tira el evento y el mostrador se entera en el próximo poll: el pedido que
-- pasa de pendiente de pago a creado, y el que cocina marca hecho.
--
-- Requiere: setup.sql

alter table public.pedidos replica identity full;
