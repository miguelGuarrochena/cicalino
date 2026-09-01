import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

const page = read("src/app/(app)/panel/espera/page.tsx");
const mapa = read("src/components/panel/espera/MapaMesas.tsx");
const cola = read("src/components/panel/espera/ColaEspera.tsx");
const cancelados = read("src/components/panel/espera/CanceladosHoy.tsx");

/* espera/page.tsx tenía 1506 líneas con todo mezclado: el mapa, la cola, las
 * reservas, los cancelados y ocho modales. Los tres bloques de JSX que no
 * toman ninguna decisión de negocio salieron a componentes propios; el estado
 * y las reglas se quedaron en la pantalla, que es donde tienen que estar. */

describe("El orden de la pantalla no cambió", () => {
  it("las secciones siguen en la misma secuencia", () => {
    const orden = [
      "<ModuleSwitcher />",
      "<SyncErrorBanner",
      "<MapaMesas",
      "<ColaEspera",
      "<CanceladosHoy",
    ];
    let desde = page.indexOf("return (");
    for (const marca of orden) {
      const i = page.indexOf(marca, desde);
      expect(i, `${marca} fuera de orden`).toBeGreaterThan(desde);
      desde = i;
    }
  });

  it("los modales siguen montados desde la pantalla", () => {
    for (const m of [
      "CrearEsperaModal",
      "CrearReservaModal",
      "SentarEsperaModal",
      "OcuparMesasModal",
      "LiberarMesaModal",
      "HoldReservaModal",
      "CapacidadMesaModal",
      "ConfirmacionModal",
      "QrModal",
    ]) {
      expect(page, m).toContain(`<${m}`);
    }
  });
});

describe("MapaMesas", () => {
  it("no decide nada: avisa qué se tocó", () => {
    /* Los cinco setState que había en el onClick de una mesa libre volvieron a
     * la pantalla. El mapa no sabe que existe un modal de ocupar. */
    expect(mapa).toContain("onOcupar(m)");
    expect(mapa).toContain("onLiberar(m.number)");
    expect(mapa).toContain("onHold(reservaProx.id)");
    expect(mapa).not.toContain("setOcuparOpen");
    expect(mapa).not.toContain("useState");
  });

  it("conserva las tres ramas del toque sobre una mesa", () => {
    /* libre + reserva reteniendo → gestionar la reserva
     * libre                      → ocupar
     * ocupada                    → liberar */
    expect(mapa).toMatch(/if \(libre && holding && reservaProx\)/);
    expect(mapa).toMatch(/if \(libre\) \{[\s\S]*?onOcupar\(m\)/);
  });

  it("mantiene los estados vacíos y el skeleton de la primera carga", () => {
    expect(mapa).toContain("!ready &&");
    expect(mapa).toContain("Definí la cantidad de mesas en Configuración.");
    expect(mapa).toContain("Ninguna mesa con este filtro.");
    expect(mapa).toContain("ready && !mesas.length");
  });

  it("la pantalla le pasa el prefill de ocupar, como antes", () => {
    const wiring = page.slice(page.indexOf("<MapaMesas"), page.indexOf("<ColaEspera"));
    expect(wiring).toContain("setOcuparPrimaria(m.number)");
    expect(wiring).toContain("setOcuparMesasSel([m.number])");
    expect(wiring).toContain("Math.min(m.capacity ?? 4, 4)");
    expect(wiring).toContain("setOcuparOpen(true)");
  });
});

describe("ColaEspera", () => {
  it("las cuatro acciones del grupo siguen estando", () => {
    expect(cola).toContain("onAvisar(e.id)");
    expect(cola).toContain("onReavisar(e.id)");
    expect(cola).toContain("onSentar(e.id)");
    expect(cola).toContain("onCancelar(e.id)");
    expect(cola).toContain("onVerQr(e)");
  });

  it("respeta las transiciones: avisar solo si espera, reavisar solo si avisado", () => {
    expect(cola).toMatch(/e\.status === "esperando" &&[\s\S]{0,400}?onAvisar/);
    expect(cola).toMatch(/e\.status === "avisado" &&[\s\S]{0,400}?onReavisar/);
    /* Sentar sigue disponible desde los dos estados abiertos. */
    expect(cola).toMatch(
      /\(e\.status === "esperando" \|\| e\.status === "avisado"\)/,
    );
  });

  it("sigue deshabilitando Sentar cuando no hay mesa que alcance", () => {
    expect(cola).toContain("puedeSentar(e.partySize)");
    expect(cola).toContain("disabled={!sentable}");
  });

  it("la pantalla es la que sabe si hay mesa: le pasa hayMesaPara", () => {
    expect(page).toContain("puedeSentar={hayMesaPara}");
    expect(page).toContain("const hayMesaPara =");
  });

  it("al sentar, la pantalla limpia la selección de mesas antes de abrir", () => {
    const wiring = page.slice(page.indexOf("<ColaEspera"), page.indexOf("<CanceladosHoy"));
    expect(wiring).toMatch(/setSentarMesas\(\[\]\);\s*\n\s*setSentarId\(id\);/);
  });

  it("mantiene el skeleton, el vacío y el paginador", () => {
    expect(cola).toContain("!ready &&");
    expect(cola).toContain("No one waiting");
    expect(cola).toContain("<Pagination");
  });
});

describe("CanceladosHoy", () => {
  it("no se muestra si no hay cancelados, igual que antes", () => {
    expect(cancelados).toContain("if (canceladas.length === 0) return null;");
  });

  it("el borrado y su aviso quedaron en la pantalla", () => {
    expect(cancelados).toContain("onBorrar(e.id)");
    expect(cancelados).not.toContain("borrarEspera");
    expect(page).toMatch(/onBorrar=\{\(id\) => \{[\s\S]*?borrarEspera\(id\)/);
  });
});

describe("Lo que NO se movió", () => {
  it("las reglas de reserva siguen en la pantalla y en lib/reservations", () => {
    /* Mover esto a un componente de presentación habría sido esconder reglas
     * de negocio detrás de una prop. */
    for (const regla of [
      "conflictingReservation",
      "occupiedBlocksSoonBooking",
      "tablesInFloorHold",
      "nextReservationByTable",
    ]) {
      expect(page, regla).toContain(regla);
    }
  });

  it("el estado de los modales sigue en un solo lugar", () => {
    for (const s of [
      "setOcuparOpen",
      "setSentarId",
      "setLiberarNumero",
      "setHoldReservaId",
      "setConfirmCancelEsperaId",
    ]) {
      expect(page, s).toContain(s);
    }
  });
});
