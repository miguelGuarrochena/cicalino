import { describe, it, expect } from "vitest";
import { DICT, LOCALES, translate } from "@/lib/i18n";

/* Las claves las agregaba cada uno a mano en los dos bloques del diccionario.
 * Cuando una quedaba solo en castellano, el panel en inglés mostraba esa
 * frase en castellano sin que nada fallara. */
const claves = (nodo: unknown, prefijo = ""): string[] => {
  if (typeof nodo === "string") return [prefijo];
  if (!nodo || typeof nodo !== "object") return [];
  return Object.entries(nodo as Record<string, unknown>).flatMap(([k, v]) =>
    claves(v, prefijo ? `${prefijo}.${k}` : k),
  );
};

const es = claves(DICT.es).sort();
const en = claves(DICT.en).sort();

describe("Diccionario ES/EN", () => {
  it("tiene exactamente las mismas claves en los dos idiomas", () => {
    expect(en.filter((k) => !es.includes(k)), "sobran en EN").toEqual([]);
    expect(es.filter((k) => !en.includes(k)), "faltan en EN").toEqual([]);
  });

  it("ninguna clave quedó vacía", () => {
    for (const locale of LOCALES) {
      for (const k of es) {
        expect(translate(locale, k).trim(), `${locale}:${k}`).not.toBe("");
      }
    }
  });

  it("la traducción inglesa no pierde ningún dato del castellano", () => {
    /* La regla va en una dirección sola a propósito. El inglés puede sumar
     * placeholders de gramática que el castellano no necesita —
     * clienteMesa.colaDelante usa {be} para concordar is/are — pero no puede
     * perder uno: ahí el número o el nombre desaparecerían de la frase. */
    const ph = /\{(\w+)\}/g;
    const usados = (s: string) => [...s.matchAll(ph)].map((m) => m[1]);
    for (const k of es) {
      const enTxt = usados(translate("en", k));
      for (const v of usados(translate("es", k))) {
        expect(enTxt, `${k} pierde {${v}} en inglés`).toContain(v);
      }
    }
  });

  it("el inglés no quedó en castellano por copiar y pegar", () => {
    /* Heurística barata: si la traducción inglesa es idéntica a la española y
     * tiene acentos o eñes, es un copiado. Los nombres propios y las
     * abreviaturas iguales en los dos idiomas no tienen esos caracteres. */
    const sospechosas = es.filter((k) => {
      const a = translate("es", k);
      const b = translate("en", k);
      return a === b && /[áéíóúñ¿¡]/i.test(a);
    });
    expect(sospechosas).toEqual([]);
  });
});
