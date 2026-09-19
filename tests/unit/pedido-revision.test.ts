import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const pantalla = leer("src/components/customer/table/TableGuestApp.tsx");
const barra = leer("src/components/customer/table/TableBottomBar.tsx");
const revision = leer("src/components/customer/table/OrderReview.tsx");
const enviados = leer("src/components/customer/table/SentOrders.tsx");

/* Revisar antes de mandar.
 *
 * El botón decía "Pedir 2 · $19.600" y con un toque el pedido estaba en la
 * cocina: sin ver qué llevaba, sin poder corregir, sin deshacer. Las
 * cantidades solo se veían al lado de cada plato, treinta tarjetas más arriba.
 *
 * Lo que sigue son las condiciones que hacen que eso no vuelva: que la barra
 * no mande, que la clave de idempotencia se comporte como se comportaba, y que
 * lo ya enviado no se parezca a lo que todavía se puede tocar. */

describe("la barra de abajo no manda el pedido", () => {
  it("abre la revisión en vez de enviar", () => {
    expect(barra).toContain("onVerPedido");
    /* Si la barra pudiera llamar al envío, volveríamos al problema de origen
       por otro camino. */
    expect(barra).not.toContain("sendOrder");
    expect(barra).not.toContain("fetch(");
    expect(barra).not.toContain("enviarPedido");
  });

  it("el pedido sin enviar se queda con la barra en cualquier pestaña", () => {
    /* Antes el botón del carrito salía solo en la pestaña Carta: si te ibas a
       Cuenta con tres cosas sin mandar, desaparecían de la vista. La condición
       de items va ANTES que la de pestaña, y eso es el orden del ternario. */
    const i = barra.indexOf("items > 0 ?");
    const j = barra.indexOf('tab === "cuenta" ?');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });

  it("dice cuántas cosas hay y cuánto suman", () => {
    expect(barra).toContain("{items}");
    expect(barra).toContain("formatMoney(total)");
  });
});

describe("el envío vive en la revisión", () => {
  it("el botón dice qué hace y a dónde va", () => {
    expect(revision).toContain('t("mesa.enviarPedido")');
    /* Un botón que diga "Enviar" sin decir a dónde deja la duda justo antes
       del único paso que no se puede deshacer solo. */
    expect(revision).toContain('t("mesa.enviarPedidoAyuda")');
  });

  it("no se puede tocar dos veces", () => {
    /* Tres cierres sobre lo mismo: el botón se apaga, la hoja se bloquea
       entera mientras trabaja, y el envío corta al entrar si ya está en curso. */
    expect(revision).toContain("disabled={enviando || !puedePedir}");
    expect(revision).toContain("busy={enviando}");
    expect(pantalla).toContain("if (sending || !cartLines.length) return;");
  });

  it("el error aparece al lado del botón que lo produjo", () => {
    /* No arriba de la pantalla, detrás de la hoja abierta. */
    const desdePie = revision.indexOf("const footer =");
    const pie = revision.slice(desdePie, revision.indexOf("return (", desdePie));
    expect(pie).toContain("CustomerNotice");
    expect(pie).toContain('tone="alerta"');
    expect(pie).toContain('t("mesa.enviarPedido")');
  });

  it("se puede corregir sin salir: sumar, restar y sacar", () => {
    expect(revision).toContain("onCantidad(l.producto.id, l.cantidad + 1)");
    expect(revision).toContain("onCantidad(l.producto.id, l.cantidad - 1)");
    /* En uno, el `−` borra el renglón: conviene que se vea como tal antes de
       tocarlo, no después. */
    expect(revision).toContain("mesa.quitarDelPedido");
  });

  it("tiene salida clara a la carta", () => {
    expect(revision).toContain('t("mesa.agregarMas")');
    expect(revision).toContain("onSeguirPidiendo");
  });
});

describe("la clave de idempotencia se comporta igual que antes", () => {
  it("cambiar el pedido es un pedido distinto", () => {
    const setQty = pantalla.slice(
      pantalla.indexOf("const setQty ="),
      pantalla.indexOf("const sendOrder ="),
    );
    expect(setQty).toContain("setOrderKey(newKey())");
  });

  it("un error NO renueva la clave", () => {
    /* Reintentar después de un corte de red tiene que reusar la misma clave:
       si el servidor ya lo había tomado, el reintento no duplica el pedido.
       Esta es la línea que no se puede mover de lugar. */
    const envio = pantalla.slice(
      pantalla.indexOf("const sendOrder ="),
      pantalla.indexOf("const cancelOrder ="),
    );
    const falla = envio.slice(
      envio.indexOf("if (!data?.ok)"),
      envio.indexOf("applyBill(data.bill"),
    );
    /* El error del envío tiene su propio estado, separado del de la pantalla:
       un fallo al llamar al mozo no tiene por qué aparecer en el pie de la
       revisión, ni un error de envío dibujarse dos veces. */
    expect(falla).toContain("setOrderError(");
    expect(falla).not.toContain("setOrderKey");
  });

  it("el éxito sí la renueva, y recién después de vaciar", () => {
    const envio = pantalla.slice(
      pantalla.indexOf("const sendOrder ="),
      pantalla.indexOf("const cancelOrder ="),
    );
    const ok = envio.slice(envio.indexOf("applyBill(data.bill"));
    expect(ok.indexOf("setCart({})")).toBeLessThan(ok.indexOf("setOrderKey(newKey())"));
    /* La copia de lo enviado se guarda ANTES de vaciar, o la hoja de
       confirmación queda en blanco. */
    expect(ok.indexOf("setEnviado(cartLines)")).toBeLessThan(ok.indexOf("setCart({})"));
  });
});

describe("los avisos pertenecen a lo que los produjo", () => {
  it("el error del envío no se mezcla con el de la pantalla", () => {
    expect(pantalla).toContain("error={orderError}");
    /* Y al cerrar la revisión se va: si no, reabrirla mostraría el cartel de
       un intento que ya no existe. */
    const revisor = pantalla.slice(pantalla.indexOf("<OrderReview"));
    expect(revisor).toContain("setOrderError(null)");
  });

  it("cambiar de sección limpia lo que quedó de la anterior", () => {
    const tabs = pantalla.slice(pantalla.indexOf('role="tablist"'));
    expect(tabs).toContain("setNotice(null)");
    expect(tabs).toContain("setError(null)");
  });

  it("los avisos que son un estado no se pueden cerrar", () => {
    /* La mesa cerrada y el pago en verificación no son un mensaje: son la
       situación. Si se pudieran sacar, la pantalla mentiría. */
    const cerrada = pantalla.slice(pantalla.indexOf("{!open && ("), pantalla.indexOf("{notice && ("));
    expect(cerrada).not.toContain("onClose=");
    const verificando = pantalla.slice(
      pantalla.indexOf("{checkingPayment && ("),
      pantalla.indexOf("{error && ("),
    );
    expect(verificando).not.toContain("onClose=");
  });
});

describe("lo enviado y lo que falta enviar no se mezclan", () => {
  it("la lista de enviados no ofrece editar", () => {
    expect(enviados).not.toContain("onCantidad");
    expect(enviados).not.toContain("mesa.agregarUno");
  });

  it("con algo sin enviar, eso es lo primero que se ve en Pedidos", () => {
    /* Dos listas parecidas en la misma pantalla: lo peor que puede pasar es
       creer que lo de abajo ya se mandó. */
    const i = enviados.indexOf("itemsSinEnviar > 0");
    const j = enviados.indexOf('t("mesa.yaEnviados")');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    expect(enviados).toContain("mesa.sinEnviarAyuda");
  });

  it("la cancelación mantiene la regla que ya estaba", () => {
    expect(enviados).toContain('o.status === "creado" && mesaAbierta');
  });
});
