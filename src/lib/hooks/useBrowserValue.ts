"use client";

import { useSyncExternalStore } from "react";

const sinSuscripcion = () => () => {};

/* Lee un valor del navegador que no cambia después del arranque.
 *
 * Estas cosas —`navigator.share`, una preferencia guardada en localStorage—
 * no se pueden leer durante el render, porque en el servidor no existen y la
 * hidratación no coincidiría. La salida fácil era leerlas en un efecto y
 * guardarlas con `setState`, que es un render de más y lo que marca
 * `react-hooks/set-state-in-effect`.
 *
 * `useSyncExternalStore` es para exactamente esto: `enServidor` es lo que se
 * renderiza en el server y en la primera pasada del cliente, y `leer` lo que
 * queda apenas hidrata. Sin suscripción, porque el valor no cambia solo. */
export const useBrowserValue = <T,>(leer: () => T, enServidor: T): T => {
  /* `leer` puede cambiar de identidad entre renders sin problema:
   * useSyncExternalStore compara el valor devuelto, no la función. */
  return useSyncExternalStore(sinSuscripcion, leer, () => enServidor);
};
