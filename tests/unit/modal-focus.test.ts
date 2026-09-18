import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { globSync } from "node:fs";
import { SELECTOR_ENFOCABLE, siguienteFoco } from "@/lib/ui/focusTrap";

const root = process.cwd();

/* ModalShell ya hacía lo difícil —role=dialog, aria-modal, Escape, bloqueo del
 * scroll— pero no atrapaba el Tab: con un teclado bluetooth en la tablet del
 * mostrador el foco se escapaba al panel de atrás, y al cerrar no volvía al
 * botón que lo había abierto. */

const shell = readFileSync(
  join(process.cwd(), "src/components/ui/ModalShell.tsx"),
  "utf8",
);

describe("siguienteFoco", () => {
  const lista = ["a", "b", "c"];

  it("en el medio no interviene: lo mueve el navegador", () => {
    /* Reimplementar el recorrido entero sería reemplazar algo que ya anda por
     * una versión peor. Solo se toma el control en los bordes. */
    expect(siguienteFoco(lista, "a", false)).toBeNull();
    expect(siguienteFoco(lista, "b", false)).toBeNull();
    expect(siguienteFoco(lista, "b", true)).toBeNull();
    expect(siguienteFoco(lista, "c", true)).toBeNull();
  });

  it("del último con Tab vuelve al primero", () => {
    expect(siguienteFoco(lista, "c", false)).toBe("a");
  });

  it("del primero con Shift+Tab va al último", () => {
    expect(siguienteFoco(lista, "a", true)).toBe("c");
  });

  it("si el foco se escapó lo trae de vuelta por el extremo correcto", () => {
    expect(siguienteFoco(lista, "afuera", false)).toBe("a");
    expect(siguienteFoco(lista, "afuera", true)).toBe("c");
    expect(siguienteFoco(lista, null, false)).toBe("a");
  });

  it("un modal sin nada enfocable no rompe", () => {
    expect(siguienteFoco([], null, false)).toBeNull();
    expect(siguienteFoco([], "x", true)).toBeNull();
  });

  it("con un solo elemento el foco se queda ahí", () => {
    expect(siguienteFoco(["solo"], "solo", false)).toBe("solo");
    expect(siguienteFoco(["solo"], "solo", true)).toBe("solo");
  });
});

describe("SELECTOR_ENFOCABLE", () => {
  it("excluye lo deshabilitado y lo sacado del tab order", () => {
    expect(SELECTOR_ENFOCABLE).toContain("button:not([disabled])");
    expect(SELECTOR_ENFOCABLE).toContain("input:not([disabled])");
    expect(SELECTOR_ENFOCABLE).toContain('[tabindex]:not([tabindex="-1"])');
  });

  it("incluye los controles que usan los modales del panel", () => {
    for (const t of ["a[href]", "button", "input", "select", "textarea"]) {
      expect(SELECTOR_ENFOCABLE).toContain(t);
    }
  });
});

describe("ModalShell: cableado", () => {
  it("atrapa el Tab con las funciones del trap", () => {
    expect(shell).toContain("enfocablesDe");
    expect(shell).toContain("siguienteFoco");
    expect(shell).toMatch(/if \(e\.key !== "Tab"\) return;/);
    expect(shell).toContain("e.preventDefault()");
  });

  it("guarda el disparador y le devuelve el foco al cerrar", () => {
    expect(shell).toContain("volverA.current");
    expect(shell).toMatch(/document\.contains\(destino\)/);
  });

  it("captura el disparador en el primer render, no en el efecto", () => {
    /* Para cuando corre el efecto de montaje, React ya aplicó el autoFocus de
     * los modales que traen un input: ahí document.activeElement es un
     * elemento de adentro del modal y al cerrar no habría a dónde volver.
     * Lo detectó el chequeo manual del panel. */
    expect(shell).toMatch(/if \(volverA\.current === undefined\)/);
    const efecto = shell.indexOf("useEffect(() =>");
    const captura = shell.indexOf("volverA.current === undefined");
    expect(captura, "la captura va antes del primer useEffect").toBeLessThan(
      efecto,
    );
  });

  it("no pisa el autoFocus de los modales que ya lo traen", () => {
    /* Seis modales abren con un input enfocado. El foco inicial solo se pone
     * si React no lo puso antes. */
    expect(shell).toMatch(/!capa\.contains\(document\.activeElement\)/);
  });

  it("el foco inicial y la devolución no dependen de busy ni de onClose", () => {
    /* Si estuvieran en el mismo efecto que el teclado, cada cambio de `busy`
     * devolvería el foco al disparador con el modal todavía abierto. */
    const i = shell.indexOf("volverA.current =");
    const cierre = shell.indexOf("}, []);", i);
    expect(cierre, "el efecto de montaje tiene que tener deps vacías").toBeGreaterThan(i);
  });

  it("Escape sigue respetando busy, como antes", () => {
    expect(shell).toMatch(/e\.key === "Escape" && !busy/);
  });

  it("el diálogo puede recibir foco si no hay controles adentro", () => {
    expect(shell).toContain("tabIndex={-1}");
  });
});

/* Confirmaciones con la cara de la app, no con la del navegador.
 *
 * `window.confirm` y `window.prompt` andaban, pero son del sistema: otra
 * tipografía, otro idioma en los botones, ignoran el tema oscuro, avisan
 * "localhost dice" y no distinguen "Aceptar" de "Cancelar este pedido". En una
 * tablet de salón eso rompe el hilo de lo que el mozo está haciendo. */
describe("Confirmaciones: componentes propios, no diálogos del navegador", () => {
  const src = (rel: string) => readFileSync(join(root, rel), "utf8");

  it("no queda ningún diálogo nativo usado como UI de la app", () => {
    const archivos = globSync("src/**/*.{ts,tsx}", { cwd: root });
    const ofensores = archivos.filter((f) => {
      const txt = src(f);
      if (f.endsWith("ui/Confirm.tsx")) return false; /* lo nombra en su comentario */
      return /window\.(confirm|alert|prompt)\s*\(/.test(txt);
    });
    expect(ofensores, `usan diálogos nativos: ${ofensores.join(", ")}`).toEqual([]);
  });

  it("el cartel propio hereda el foco atrapado y el Escape de ModalShell", () => {
    const confirm = src("src/components/ui/Confirm.tsx");
    expect(confirm).toContain("ModalShell");
    expect(confirm).toContain("labelledBy");
    /* Promesa: el que llama conserva el `if (!await …) return` del nativo. */
    expect(confirm).toContain("Promise<boolean | string | null>");
  });

  it("fuera del provider responde que no, nunca que sí", () => {
    const confirm = src("src/components/ui/Confirm.tsx");
    const fallback = confirm.slice(confirm.indexOf("const sinProvider"));
    expect(fallback).toContain("opts.input ? null : false");
  });

  it("está montado para toda la app, panel y comensal", () => {
    const layout = src("src/app/layout.tsx");
    expect(layout).toContain("ConfirmProvider");
    /* Adentro de Providers: usa `t` para los botones por defecto. */
    expect(layout.indexOf("<Providers>")).toBeLessThan(layout.indexOf("<ConfirmProvider>"));
  });

  it("salir por cualquier puerta es «no»; solo el botón confirma", () => {
    const confirm = src("src/components/ui/Confirm.tsx");
    /* Escape, fondo, ✕ y Cancelar pasan por el mismo cierre negativo. Un
     * cartel que confirmara al apretar Escape borraría un pedido por un
     * teclazo. */
    const negativos = confirm.split("cerrar(esperaTexto ? null : false)").length - 1;
    expect(negativos).toBe(3); /* botón Cancelar, ✕ y onClose (Escape + fondo) */
    expect(confirm.split("cerrar(esperaTexto ? texto.trim() : true)").length - 1).toBe(1);
  });

  it("el campo obligatorio bloquea el botón en vez de que lo rebote el servidor", () => {
    const confirm = src("src/components/ui/Confirm.tsx");
    expect(confirm).toContain("faltaTexto");
    expect(confirm).toContain("disabled={faltaTexto}");
    /* El motivo de anulación es el caso: `cancelar_pago_mesa` lo exige. */
    expect(src("src/components/panel/mesas/TableDetail.tsx")).toContain("requerido: true");
  });

  it("los dos botones se distinguen y entran en un dedo", () => {
    const confirm = src("src/components/ui/Confirm.tsx");
    /* Confirmar va lleno, cancelar va con borde. */
    expect(confirm).toContain("border border-linea");
    expect(confirm).toContain("text-crema");
    /* 48px de alto y, en mobile, el que confirma arriba. */
    expect(confirm).toContain("min-h-12");
    expect(confirm).toContain("flex-col-reverse");
  });

  it("lo destructivo se ve destructivo", () => {
    const confirm = src("src/components/ui/Confirm.tsx");
    expect(confirm).toContain('tone === "peligro"');
    expect(confirm).toContain("bg-alerta");
    /* Y los que borran o cancelan lo piden. */
    for (const f of [
      "src/components/panel/mesas/TableDetail.tsx",
      "src/components/panel/menu/MenuWorkspace.tsx",
      "src/components/customer/table/TableGuestApp.tsx",
    ]) {
      expect(src(f), f).toContain('tone: "peligro"');
    }
  });
});
