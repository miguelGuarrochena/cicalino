# /como-funciona — la presentación para la primera visita

Herramienta de venta para usar en persona, con la notebook o la tablet abierta
frente al dueño o el encargado. No es la demo: es lo que hace que la demo tenga
sentido. Vive en `/como-funciona`, fuera del sitemap y con `noindex`.

---

## 1. Qué es Cicalino (según el código)

Una web app para locales gastronómicos chicos y medianos de Argentina que
conecta el celular del cliente con el local **a través de un QR**, sin apps y
sin registro. Nació como reemplazo del buzzer de mostrador y hoy son tres
módulos que se contratan por separado o combinados, por sucursal:

| Módulo (nombre real) | Qué resuelve | Dónde vive |
| --- | --- | --- |
| **Pedidos** | Avisar que el pedido está listo. Lo carga la caja, o el cliente lo pide desde un QR | `/panel/pedidos`, `/p/[token]`, `/m/[token]` |
| **Recepción** | Cola de espera con QR, aviso de "hay mesa", mapa de mesas y reservas del día | `/panel/espera`, `/e/[token]` |
| **Pagos** (pagos divididos) | La mesa ve la cuenta y cada uno paga lo suyo; el local ve cuánto falta | `/panel/pagos`, `/m/[token]` |

El título real del sitio lo resume: *"Avisá al cliente cuando el pedido está
listo, hay mesa o pide la cuenta"*. Esos son los tres momentos.

## 2. Funcionalidades reales encontradas

**Cliente (siempre desde el celular, sin instalar nada)**
- Escanea un QR y cae en una página liviana (`/p`, `/e`, `/m`).
- Pedidos de mostrador: espera con la pantalla abierta o con notificaciones
  (Web Push + polling de respaldo) y le llega "Pedido 42 listo para retirar".
- Pedidos desde el celular, en dos modalidades:
  - **Mostrador QR**: un QR para todo el local, carta, nombre opcional, paga
    con Mercado Pago o en caja. El pedido entra a preparación enseguida (salvo
    que el local exija pago previo).
  - **Mesa**: QR fijo por mesa, sin mozo. Pide, paga y retira en el
    mostrador. El pedido entra a preparación **recién cuando está pago**
    (lo garantiza la base, no la pantalla).
- Recepción: queda en la lista y le llega "García, ¡tu mesa está lista!".
- Pagos divididos: pone su nombre, ve la carta, pide, **llama al mozo**, ve la
  cuenta y paga lo suyo, partes iguales, un monto o un porcentaje, con propina
  propia. Mercado Pago, transferencia, efectivo, débito o crédito, según lo
  que el local active.

**Local (panel)**
- Pedidos: "Creás el pedido → Marcar listo · avisar → Retirado". Bandeja
  "Por cobrar" para lo que se paga en caja.
- Avisos globales en cualquier pantalla: *Mesa 4 hizo un pedido*, *Mesa 12 te
  llama*, *Mesa 12 pidió la cuenta*, *Mesa 12 pagó con Mercado Pago*,
  *García entró a la lista*.
- Recepción: Esperando → Avisado → Sentado, mapa de mesas libres/ocupadas,
  agenda de reservas del día.
- Pagos: total, pagado y falta por mesa en vivo; quién pagó y con qué; la mesa
  se cierra cuando está toda paga; historial.
- Mercado Pago conectado por OAuth: el pago se confirma solo por webhook.
- Métricas (preparación, retiro, volumen), carta, empleados con PIN, QR para
  imprimir, roles dueño/supervisor/empleado.

## 3. Modos reales

Tres módulos comerciales (`ModuleId = "pedidos" | "espera" | "pagos"`).
Dentro de Pedidos hay modalidades: mostrador tradicional, Mostrador QR y Mesa.

## 4. Qué vale la pena mostrar

Cuatro temas, que es como un dueño piensa su local (por lugar, no por módulo):

1. **Pedidos** — el mostrador: chau buzzer, chau gritar números.
2. **Pedidos desde el celular** — Mostrador QR + Mesa: el cliente pide solo.
3. **Recepción** — la puerta: lista de espera con aviso, mesas y reservas.
4. **Pagos divididos** — la mesa: cada uno paga lo suyo, el local ve lo que falta.

La diferencia que hay que dejar clara: **solo con Pedidos no hay carta**. La
caja carga el pedido a mano y lo identifica con un número, el nombre o la mesa
(`modo_identificacion`). La carta en el celular aparece en **Pedidos desde el
celular** (mostrador QR o mesa) y en **Pagos divididos**, donde la mesa pide y
después paga.

"Pedidos desde el celular" es parte del módulo Pedidos, pero es otra
conversación (la fila en la caja, no el aviso), así que tiene su propio tema.

## 5. Qué no mostrar en la primera visita

Configuración, carta y su importador, empleados y PIN, métricas en detalle,
historial, superadmin, impresión de QR, roles, precios. Eso es la segunda
instancia.

Y no prometer lo que no existe: integración con POS o facturación, delivery,
reservas que haga el cliente solo (las carga el local), app nativa, propina o
recargo en Mesa (ahí el cliente paga el total), impresión física.

## 6. Presentación completa (9 escenas, ~3 min)

| # | Objetivo | Texto | Visual / animación |
| --- | --- | --- | --- |
| 1 | Impacto | **Avisamos el momento justo.** · "Cicalino conecta el celular de tu cliente con tu local. Con un QR." | Cicalino saludando, entra y se balancea; logo arriba |
| 2 | El problema | **Pasa en todos los locales.** · "¿Ya está mi pedido?" · "¿Falta mucho para la mesa?" · "¿Me traés la cuenta?" · "Son minutos que el cliente siente. Y que tu equipo puede usar mejor." | Tres bloques con un dibujo de objetos cada uno (el pedido y el reloj, la puerta, la cuenta); aparecen de a uno |
| 3 | El cambio | **¿Y si el aviso llegara solo?** · Hoy / Con Cicalino | Una línea enredada (cliente → espera → pregunta → mozo → caja) y debajo una recta (cliente → QR → tu local) con un punto que viaja |
| 4 | El cliente | **El cliente no instala nada.** · Escanea el QR → Pide, espera o paga → Le llega el aviso | Mesa con QR, celular escaneando, notificación "Pedido 42 listo para retirar" |
| 5 | El local | **Y tu local lo ve al toque.** · "Un toque y el cliente se entera." | Celular → tablet; entran avisos reales del panel; "Marcar listo · avisar" late y el aviso vuelve al celular |
| 6 | Los momentos | **Tres momentos. Un solo Cicalino.** · Cuando el pedido está listo / Cuando hay mesa / Cuando piden la cuenta | Tres mini-historias cliente → local, con el color de cada módulo |
| 7 | Todo conectado | **Todo en un solo lugar.** · "Arrancás con lo que necesitás y sumás el resto cuando quieras." | Tres QR (mostrador, espera, mesa) que se conectan a Cicalino y de ahí a un panel con Pedidos · Recepción · Pagos |
| 8 | Beneficios | **Lo que cambia.** · El aviso llega solo · Sin buzzers ni apps · Pagar es más simple · Menos idas y vueltas | Cuatro bloques con su dibujo, aparecen de a uno |
| 9 | Cierre | **Esto es Cicalino.** → "¿Lo vemos funcionando en tu local?" | Cicalino haciendo "ok"; botón "Ver el producto real" |

Transición entre escenas: fundido con un deslizamiento corto en la dirección
en la que se avanza.

## 7. Temas individuales (6 escenas, 30–90 s)

Todos siguen el mismo esqueleto: problema → cómo lo resuelve → el cliente →
el local → qué gana → cierre.

**Pedidos** — *Esperar el pedido* ("¿Ya está el 42?", llamar en voz alta,
los buzzers) → *Chau buzzer. Hola QR.* → Escanea · Deja
la pantalla abierta · Le llega el aviso → *Tres toques en el mostrador*:
Creás el pedido · Listo · avisar · Retirado → El aviso llega solo · Sin
aparatos · Tiempos en tus métricas.

**Pedidos desde el celular** — *Esperar para pedir* (la fila, dictar el
pedido, esperar en la mesa) → *El cliente pide solo.
Vos preparás.* → Escanea el QR del mostrador o de su mesa · Elige de la carta ·
Paga como prefiera · Le avisamos → El pedido entra al tablero
(en mostrador, al toque; en mesa, cuando está pago) → Menos fila · Pedidos
escritos por el cliente · En mesa no se prepara nada sin cobrar.

**Recepción** — *Esperar la mesa* (¿cuánto falta?, la lista de palabra, ¿a
quién le toca?) → *Esperan donde quieran. Vos avisás.*
→ Escanea el QR · Queda en la lista · "García, ¡tu mesa está lista!" →
Esperando · Avisado · Sentado, con mapa de mesas y reservas → Nadie se
agolpa en la puerta · Mesas de un vistazo · Reservas en el mismo panel.

**Pagos divididos** — *Esperar para pagar* (pedir la cuenta, uno paga todo con un
solo medio, después "¿cuánto te debo?") → *Cada uno paga lo
suyo.* → Escanea y pone su nombre · Pide de la carta · Divide y elige cómo
pagar → "Mesa 12 hizo un pedido",
"pidió la cuenta" · Total, pagado y falta en vivo · Quién pagó y cómo →
Pagar sin esperar · Sabés si la mesa está cubierta · Menos idas y vueltas.

En la presentación no se menciona Mercado Pago como diferencial (que se
confirma solo es un detalle para la demo): el cliente elige cómo paga. Qué medios
activa el local se explica en otro momento.

Cierre de cada tema: *¿Lo vemos en tu local?* con "Ver el producto real",
"Elegir otro tema" y "Ver la presentación completa".

## 8. Assets que se reutilizan

- La mascota: `bell`, `chef`, `ok`, `espera` (con el celular y el QR) vía
  `ThemedImg`, y el logo con `Logo`.
- Colores y tipografía del sistema: crema `--bg`, `--surface`, cobalto
  `--brand`, teal de Recepción, frambuesa de Pagos, Archivo Black en
  mayúsculas para los títulos, Archivo para el resto.
- Botones con la forma del sitio: `rounded-full bg-marca text-crema`.
- Copy real: "Sin gritar números", "Tres toques en el mostrador", "Se acabó la
  servilleta", "El cliente pide solo, vos preparás", los avisos del panel.

## 9. Componentes nuevos (`src/components/showroom/`)

- `Showroom` — estado: selector o tema + escena; teclado, gestos y `#hash`.
- `Stage` — el marco a pantalla completa: barra discreta, progreso, anterior /
  siguiente, volver al inicio, reiniciar, pantalla completa.
- `Selector` — la portada: Cicalino presenta, botón "Conocé Cicalino" y los
  cuatro temas en bloques, con el ícono y el color de cada módulo en el panel.
- `scenes` — plantillas de escena reutilizables: `Statement`, `Problem`,
  `Flow`, `Benefits`, `Closing`, más piezas (`SceneTitle`, `Connector`,
  `Bubble`, `Phone`, `Tablet`).
- `art` — dibujos en SVG con el trazo de la marca, solo objetos (celular,
  reloj, puerta, mesa, QR, cuenta, tarjeta, taza). No hay personas: el único
  personaje es la mascota.
- `tours` — los cinco recorridos como datos. Sumar un tema es agregar una
  entrada acá y una estación en el selector.

## 10. Navegación

- **→ / Espacio / clic en "Siguiente"**: avanza (en la portada, arranca la
  presentación completa). **←**: vuelve.
- **Esc** o **Inicio**: vuelve al selector sin perder nada. **R**: reinicia el
  recorrido. **F**: pantalla completa.
- En tablet: deslizar a los costados.
- La URL guarda el tema (`/como-funciona#pagos`), así que se puede abrir un
  tema directo o recargar sin perder el lugar.

## 11. Sin conexión

La presentación no le pide nada a la red: no usa Supabase, APIs, sesión ni
datos dinámicos. Las imágenes son los PNG del repo servidos como archivos
estáticos (sin el optimizador `/_next/image`, que necesita servidor), las
fuentes son las de `next/font` (se bajan en el build) y los dibujos son SVG en
el código. La ruta sale estática del build (○).

Hay dos formas de usarla sin internet:

**Desde el sitio.** Abrila una vez con conexión, en el navegador en el que vas
a presentar. La página le pasa al service worker (`public/sw.js`) la lista de
lo que cargó —ella misma, JS, CSS, imágenes y fuentes— y él la guarda en su
propia caché (`cicalino-presentacion-v1`). Después anda sin red. Cada vez que
la abrís con conexión se actualiza; abrirla sin conexión no borra la copia.

**Copia local en la Mac** (lo más seguro para una visita):

```bash
pnpm build
pnpm presentacion:exportar
pnpm presentacion
```

`presentacion:exportar` toma la página prerenderizada y los archivos del build y
arma `presentacion-offline/` (no se versiona) con un servidor de Node sin
dependencias. `pnpm presentacion` la abre en `http://localhost:4321`. La
carpeta se puede copiar a cualquier lado: con doble clic en
`Abrir presentación.command` se abre sola.

"Ver el producto real" lleva al Cicalino de verdad (`NEXT_PUBLIC_APP_URL` si es
https, si no `https://www.cicalino.net`): la demo sí necesita internet.

Hay que volver a exportar después de cambiar la presentación.
