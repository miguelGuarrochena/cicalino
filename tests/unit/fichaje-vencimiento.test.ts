import { describe, it, expect } from "vitest";
import { fichajeVigente, useSessionStore } from "@/lib/store/session-store";
import { businessDayStart } from "@/lib/businessDay";

/* El fichaje vivía en localStorage sin vencimiento: el desbloqueo de admin
 * caducaba a los 15 minutos, el fichaje no. La tablet del mostrador seguía
 * atribuyendo pedidos a quien fichó tres días atrás. */

const CORTE = 6;
/* Un martes al mediodía, hora argentina. */
const MEDIODIA = new Date("2026-09-01T15:00:00Z");

const enJornada = (offsetMs: number) =>
  businessDayStart(CORTE, MEDIODIA).getTime() + offsetMs;

describe("fichajeVigente", () => {
  it("un fichaje de esta jornada sigue activo", () => {
    const emp = { id: "e1", name: "Lucía", fichadoEn: enJornada(60_000) };
    expect(fichajeVigente(emp, CORTE, MEDIODIA)).toBe(true);
  });

  it("uno de antes del corte ya no cuenta", () => {
    const emp = { id: "e1", name: "Lucía", fichadoEn: enJornada(-1) };
    expect(fichajeVigente(emp, CORTE, MEDIODIA)).toBe(false);
  });

  it("uno de hace tres días tampoco", () => {
    const emp = {
      id: "e1",
      name: "Lucía",
      fichadoEn: enJornada(-3 * 24 * 3600_000),
    };
    expect(fichajeVigente(emp, CORTE, MEDIODIA)).toBe(false);
  });

  it("justo en el corte cuenta como de esta jornada", () => {
    const emp = { id: "e1", name: "Lucía", fichadoEn: enJornada(0) };
    expect(fichajeVigente(emp, CORTE, MEDIODIA)).toBe(true);
  });

  it("el turno de la noche sigue vigente a las 3 de la mañana", () => {
    /* Con corte a las 6, a las 3 AM seguís en la jornada de ayer: el que
     * fichó a las 21 tiene que seguir fichado. */
    const tresAm = new Date("2026-09-02T06:00:00Z"); // 03:00 en Argentina
    const anoche = new Date("2026-09-02T00:00:00Z"); // 21:00 del día anterior
    const emp = { id: "e1", name: "Marcos", fichadoEn: anoche.getTime() };
    expect(fichajeVigente(emp, CORTE, tresAm)).toBe(true);
  });

  it("pasado el corte de la mañana, ese mismo turno ya venció", () => {
    const sieteAm = new Date("2026-09-02T10:00:00Z"); // 07:00 en Argentina
    const anoche = new Date("2026-09-02T00:00:00Z"); // 21:00 del día anterior
    const emp = { id: "e1", name: "Marcos", fichadoEn: anoche.getTime() };
    expect(fichajeVigente(emp, CORTE, sieteAm)).toBe(false);
  });

  it("sin nadie fichado es false, no revienta", () => {
    expect(fichajeVigente(null, CORTE, MEDIODIA)).toBe(false);
  });

  it("un fichaje viejo sin sello se considera vencido", () => {
    /* Los que ya están guardados en localStorage no tienen `fichadoEn`. Se
     * los trata como vencidos: esa persona ficha una vez más y queda. */
    const emp = { id: "e1", name: "Lucía" };
    expect(fichajeVigente(emp, CORTE, MEDIODIA)).toBe(false);
    expect(fichajeVigente({ ...emp, fichadoEn: NaN }, CORTE, MEDIODIA)).toBe(
      false,
    );
  });

  it("respeta la hora de corte configurada por el local", () => {
    /* Un bar con corte a las 10: a las 12 del mediodía, el que fichó a las 8
     * de la mañana pertenece a la jornada anterior. */
    const emp = { id: "e1", name: "Ana", fichadoEn: enJornada(0) };
    expect(fichajeVigente(emp, 6, MEDIODIA)).toBe(true);
    expect(fichajeVigente(emp, 10, MEDIODIA)).toBe(false);
  });
});

describe("fichar sella la hora", () => {
  it("guarda fichadoEn aunque el llamador no lo mande", () => {
    const antes = Date.now();
    useSessionStore.getState().fichar({ id: "e9", name: "Sofía" });
    const emp = useSessionStore.getState().empleadoActivo;
    expect(emp?.name).toBe("Sofía");
    expect(emp?.fichadoEn).toBeGreaterThanOrEqual(antes);
  });

  it("salir lo limpia", () => {
    useSessionStore.getState().fichar({ id: "e9", name: "Sofía" });
    useSessionStore.getState().salir();
    expect(useSessionStore.getState().empleadoActivo).toBeNull();
  });
});
