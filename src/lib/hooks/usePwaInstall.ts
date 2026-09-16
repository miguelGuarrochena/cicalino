"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useBrowserValue } from "@/lib/hooks/useBrowserValue";
import { enIOSSafari, enStandalone } from "@/lib/pwaInstall";

/* Chrome lo dispara para ofrecer la instalación. No está en lib.dom. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallOutcome =
  /* Aceptó el diálogo nativo. */
  | "accepted"
  /* Lo rechazó. */
  | "dismissed"
  /* iOS: no hay diálogo, hay que mostrarle los pasos. */
  | "manual"
  /* El navegador no ofrece instalar (o el evento ya se consumió). */
  | "nada";

export interface PwaInstall {
  /** Corriendo como app instalada: no hay nada que ofrecer. */
  instalada: boolean;
  /** Tenemos el evento del navegador: `instalar()` abre el diálogo nativo. */
  promptDisponible: boolean;
  /** Safari iOS: se puede instalar, pero solo a mano. */
  iosManual: boolean;
  instalar: () => Promise<InstallOutcome>;
}

/* El evento vive en el módulo, no adentro de cada componente que lo use.
 *
 * Por dos motivos, y los dos se rompían con un listener por componente.
 *
 * El navegador emite `beforeinstallprompt` una sola vez y temprano. El botón
 * del menú se monta recién cuando alguien abre el menú, mucho después: para
 * cuando su listener existía, el evento ya había pasado y el botón no
 * aparecía nunca. Escuchando desde el módulo, el que se monte tarde igual
 * encuentra el evento esperándolo.
 *
 * Y `prompt()` consume el evento: llamarlo dos veces sobre la misma instancia
 * tira InvalidStateError. Con una copia por componente, instalar desde el
 * aviso de abajo dejaba al botón del menú con un evento ya gastado en la
 * mano. Acá hay uno solo, y cuando se usa se apaga para todos. */
let evento: BeforeInstallPromptEvent | null = null;
let seInstaló = false;
const oyentes = new Set<() => void>();
let enEscucha = false;

const avisar = () => oyentes.forEach((f) => f());

const escuchar = () => {
  if (enEscucha || typeof window === "undefined") return;
  enEscucha = true;
  /* Nunca se desuscribe, a propósito: es una señal que dura lo que dura la
   * página, y soltarla al desmontar el último componente la perdería para el
   * próximo que se monte. */
  window.addEventListener("beforeinstallprompt", (e) => {
    /* Sin esto Chrome muestra su propia barrita de instalación. */
    e.preventDefault();
    evento = e as BeforeInstallPromptEvent;
    avisar();
  });
  /* Puede llegar por afuera de nuestros botones: el ícono de la barra de
   * direcciones, el menú del navegador. */
  window.addEventListener("appinstalled", () => {
    evento = null;
    seInstaló = true;
    avisar();
  });
};

const suscribir = (cb: () => void) => {
  escuchar();
  oyentes.add(cb);
  return () => {
    oyentes.delete(cb);
  };
};

const hayEvento = () => evento !== null;
const yaSeInstaló = () => seInstaló;
/* En el servidor no hay nada que instalar; el valor real llega al hidratar. */
const enServidor = () => false;

/**
 * El estado de instalación de la PWA, en un solo lugar.
 *
 * Lo usan el botón del menú del panel y el aviso de abajo. Estaba escrito solo
 * en el botón y con la mitad de los casos: sin mirar si ya estaba instalada y
 * sin salida para iOS, donde `beforeinstallprompt` no existe.
 */
export const usePwaInstall = (): PwaInstall => {
  const standalone = useBrowserValue(enStandalone, false);
  const iosSafari = useBrowserValue(enIOSSafari, false);
  const promptListo = useSyncExternalStore(suscribir, hayEvento, enServidor);
  const instaladaRecién = useSyncExternalStore(
    suscribir,
    yaSeInstaló,
    enServidor,
  );

  const instalada = standalone || instaladaRecién;

  const instalar = useCallback(async (): Promise<InstallOutcome> => {
    const e = evento;
    if (!e) return enIOSSafari() ? "manual" : "nada";
    /* Se suelta ANTES de esperar la respuesta: mientras el diálogo nativo
     * está abierto, el otro botón no tiene que poder abrir un segundo. Si el
     * usuario dice que no, Chrome vuelve a emitir el evento más adelante y el
     * listener de arriba lo agarra. */
    evento = null;
    avisar();
    await e.prompt();
    const { outcome } = await e.userChoice;
    return outcome;
  }, []);

  return {
    instalada,
    promptDisponible: promptListo && !instalada,
    iosManual: iosSafari && !instalada && !promptListo,
    instalar,
  };
};
