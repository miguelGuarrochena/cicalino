"use client";

import { useEffect, useRef, useState } from "react";
import { seenAtNewer } from "@/lib/qrSeen";

/* Cierra el modal del QR cuando el cliente lo escanea.
 *
 * Estaba escrito dos veces, idéntico salvo el nombre de la entidad y la
 * función que lee `visto_en`: una copia en el panel de pedidos y otra en el de
 * sala. Son unas cuarenta líneas con dos refs y un intervalo, y el porqué de
 * cada una es sutil, así que tenerlo en un solo lugar es la diferencia entre
 * arreglar un caso borde una vez o acordarse de arreglarlo dos.
 *
 * Hay dos formas de abrir el QR y se comportan distinto:
 *
 *  · `abrirNuevo` (alta recién hecha): arranca "primed". El pedido no puede
 *    haber sido visto todavía, así que el primer `visto_en` que aparezca es el
 *    escaneo y cierra el modal.
 *
 *  · `abrirVerQr` (botón "Ver QR" sobre algo que ya existe): arranca sin
 *    primar. El cliente pudo haberlo abierto hace rato y `visto_en` ya tener
 *    valor; la primera lectura sirve para fijar la referencia, y recién un
 *    valor MÁS NUEVO que ese cuenta como un escaneo nuevo.
 */
interface ConSeen {
  id: string;
  seenAt?: string | null;
}

export interface QrSeenClose<T extends ConSeen> {
  /* El snapshot de cuando se abrió el modal. */
  item: T | null;
  /* El mismo item pero tomado de la lista viva, para lo que puede cambiar
   * mientras el QR sigue en pantalla (el alias que carga el cliente). */
  itemVivo: T | null;
  abrirNuevo: (item: T) => void;
  abrirVerQr: (item: T) => void;
  cerrar: () => void;
}

export const useQrSeenClose = <T extends ConSeen>(
  fetchSeenAt: (id: string) => Promise<string | null>,
  /* La lista viva de la pantalla. Solo se usa para sacar el `visto_en` del
   * item abierto: el realtime a veces llega antes que el intervalo, y así el
   * modal cierra sin esperar al próximo tick. */
  lista: readonly T[],
): QrSeenClose<T> => {
  const [item, setItem] = useState<T | null>(null);
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null);
  const abiertoEnRef = useRef<string | null>(null);
  const primedRef = useRef(true);

  const enLista = item ? (lista.find((x) => x.id === item.id) ?? null) : null;
  /* La lista cambia de identidad en cada refresco, pero al efecto solo entra
   * este string: se re-ejecuta cuando el visto cambió de verdad. */
  const liveSeenAt = enLista?.seenAt ?? null;

  useEffect(() => {
    if (!item) return;
    if (primedRef.current && seenAtNewer(liveSeenAt, abiertoEnRef.current)) {
      setItem(null);
      return;
    }
    let vivo = true;
    const consider = (seenAt: string | null) => {
      if (!vivo || !seenAt) return;
      if (!primedRef.current) {
        primedRef.current = true;
        abiertoEnRef.current = seenAt;
        setAbiertoEn(seenAt);
        return;
      }
      if (seenAtNewer(seenAt, abiertoEnRef.current)) setItem(null);
    };
    const check = () => {
      void fetchSeenAt(item.id).then(consider);
    };
    check();
    const iv = window.setInterval(check, 1_200);
    return () => {
      vivo = false;
      window.clearInterval(iv);
    };
  }, [item, abiertoEn, liveSeenAt, fetchSeenAt]);

  const abrir = (it: T, primed: boolean) => {
    primedRef.current = primed;
    abiertoEnRef.current = it.seenAt ?? null;
    setAbiertoEn(it.seenAt ?? null);
    setItem(it);
  };

  return {
    item,
    itemVivo: item ? (enLista ?? item) : null,
    abrirNuevo: (it) => abrir(it, true),
    abrirVerQr: (it) => abrir(it, false),
    cerrar: () => setItem(null),
  };
};
