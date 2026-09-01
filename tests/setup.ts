// Shim de localStorage para poder importar stores (zustand/persist) en Node.
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  } as Storage;
}

/* zustand 5 resuelve su storage como `window.localStorage`, no como el global
 * suelto, y lo hace al importar el store. Sin un `window` los tests que
 * escriben en un store persistido igual pasan, pero cada set() imprime
 * "storage is currently unavailable" y ensucia la salida de la suite. */
if (typeof globalThis.window === "undefined") {
  (globalThis as { window?: unknown }).window = globalThis;
}
