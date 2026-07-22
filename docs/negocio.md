# Cicalino — Contexto de negocio

## Qué es

Una web app que reemplaza los **avisadores / buzzers físicos** que usan los
locales gastronómicos para avisar al cliente que su pedido está listo para
retirar. En lugar de entregar un aparato físico, el local le da al cliente un
**QR**. El cliente lo escanea con la cámara del celular (sin instalar nada,
sin registrarse), cae en una página web liviana que espera el aviso, y recibe
una **notificación en el navegador** cuando el pedido está listo.

## Problema que resuelve

Los buzzers físicos tienen costo de compra, se rompen, se los llevan, hay que
cargarlos y tienen alcance limitado. Cicalino los reemplaza sin hardware: usa
el celular que el cliente ya tiene.

## Mercado

- **Principal: Argentina.** Cafeterías, panaderías, rotiserías, heladerías y
  en general cualquier local con retiro en mostrador.
- **Expansión futura posible: España.**

## Modelo de cobro

- **Suscripción mensual chica en pesos**, cobrada **al local** vía
  **Mercado Pago**.
- **Gratis para el cliente final** (nunca paga ni se registra).
- La integración de Mercado Pago es de una etapa posterior; no es prioridad en
  esta primera fase.

## Competencia (ya investigado)

No hay competencia directa que ofrezca esto como **herramienta standalone** en
Argentina:

- **TurnoYa / TurnoQR**: resuelven **fila / turnos**, que es un problema
  distinto (ordenar la espera, no avisar que un pedido puntual está listo).
- **Comandar / Whapido**: incluyen un aviso al cliente como **función menor**
  dentro de sistemas de gestión gastronómica completos y pesados. Cicalino, en
  cambio, es liviano, enfocado y sin fricción de instalación.

El diferencial de Cicalino: **una sola cosa, muy bien hecha**, sin apps, sin
hardware y sin obligar al local a migrar todo su sistema de gestión.

## Dominio

- **cicalino.ar** (ya registrado).

## Roadmap (alto nivel)

1. **Fase actual:** setup, arquitectura, prototipos de las dos pantallas.
2. Conexión real a Neon + API (crear pedidos, cambiar estado, vista del cliente).
3. Web Push real (VAPID + service worker) con fallback a polling.
4. Métricas del local (tiempos, volumen por hora, historial).
5. Onboarding de locales (alta, slug, generación de QR).
6. Suscripción mensual con Mercado Pago.
7. Evaluar expansión a España.
