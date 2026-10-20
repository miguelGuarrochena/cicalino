/* Una pregunta por plato, con dos o tres respuestas. El precio lo pone el
 * local en cada respuesta. La aclaración libre ("sin cebolla") no se configura:
 * está en todos los platos y viaja aparte, en la nota del renglón. */

export const NOTA_MAX = 80;
export const OPCION_MAX = 24;
export const PREGUNTA_MAX = 24;

export interface DishOption {
  name: string;
  price: number;
}

export interface DishChoice {
  question: string;
  options: DishOption[];
}

export interface ChoiceDraft {
  question: string;
  options: { name: string; price: string }[];
}

const espacios = (v: string) => v.replace(/\s+/g, " ").trim();

const texto = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = espacios(v);
  if (s.length < 1 || s.length > max) return null;
  return s;
};

const precioEntero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 10_000_000) return null;
  return n;
};

/* null si el JSON no es una pregunta usable. Un plato sin opciones se pide
 * como siempre: un toque en el más. */
export const parseDishChoice = (raw: unknown): DishChoice | null => {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as { pregunta?: unknown; items?: unknown };
  const question = texto(row.pregunta, PREGUNTA_MAX);
  if (!question || !Array.isArray(row.items)) return null;
  if (row.items.length < 2 || row.items.length > 3) return null;
  const options: DishOption[] = [];
  for (const it of row.items) {
    if (!it || typeof it !== "object") return null;
    const item = it as { nombre?: unknown; precio?: unknown };
    const name = texto(item.nombre, OPCION_MAX);
    const price = precioEntero(item.precio);
    if (!name || price == null) return null;
    options.push({ name, price });
  }
  const names = options.map((o) => o.name.toLowerCase());
  if (new Set(names).size !== names.length) return null;
  return { question, options };
};

export const choiceJson = (choice: DishChoice | null | undefined) =>
  choice
    ? {
        pregunta: choice.question,
        items: choice.options.map((o) => ({ nombre: o.name, precio: o.price })),
      }
    : null;

/* Lo que se puede guardar desde el formulario. Vacío es válido: el plato no
 * tiene opciones. A medias, no. */
export const choiceDraftValida = (choice: ChoiceDraft | null): boolean => {
  if (!choice) return true;
  const question = espacios(choice.question);
  if (question.length < 1 || question.length > PREGUNTA_MAX) return false;
  if (choice.options.length < 2 || choice.options.length > 3) return false;
  const names: string[] = [];
  for (const o of choice.options) {
    const name = espacios(o.name);
    const price = Number(o.price.replace(/\D/g, ""));
    if (name.length < 1 || name.length > OPCION_MAX) return false;
    if (!Number.isInteger(price) || price < 1 || price > 10_000_000) return false;
    names.push(name.toLowerCase());
  }
  return new Set(names).size === names.length;
};

export const choiceFromDraft = (choice: ChoiceDraft): DishChoice => ({
  question: espacios(choice.question),
  options: choice.options.map((o) => ({
    name: espacios(o.name),
    price: Number(o.price.replace(/\D/g, "")),
  })),
});

/* Precio de la carta. Si las opciones no cuestan lo mismo, se muestra el
 * menor y "desde": el precio de verdad es el de la opción elegida. */
export const precioDesde = (price: number, choice: DishChoice | null | undefined) => {
  if (!choice?.options.length) return { amount: price, desde: false };
  const prices = choice.options.map((o) => o.price);
  const min = Math.min(...prices);
  return { amount: min, desde: min !== Math.max(...prices) };
};

/* El precio que se cobra. null si la opción no existe en este plato: esa
 * línea no se manda. */
export const precioDeLinea = (
  price: number,
  choice: DishChoice | null | undefined,
  option: string | null,
): number | null => {
  if (!choice) return option ? null : price;
  if (!option) return null;
  return choice.options.find((o) => o.name === option)?.price ?? null;
};

/* Mientras se escribe no se recorta el espacio del medio: si no, "sin "
 * nunca llega a "sin cebolla". Se limpia al mandar. */
export const notaAlEscribir = (raw: string): string =>
  raw.replace(/[\u0000-\u001f]/g, "").slice(0, NOTA_MAX);

export const notaLimpia = (raw: string): string =>
  raw.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, NOTA_MAX);

/* Cómo se lee en una comanda copiada o en un renglón corto. */
export const lineLabel = (name: string, option?: string | null, note?: string | null): string => {
  const head = option ? `${name} · ${option}` : name;
  return note ? `${head} — ${note}` : head;
};
