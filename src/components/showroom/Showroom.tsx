"use client";

/* La presentación de /como-funciona.
 *
 * Una sola pantalla que cambia de escena: la portada (Selector) o un
 * recorrido (tours.tsx) en la escena N. El lugar se guarda en el #hash
 * (`#pagos/3`), así se puede abrir un tema directo, recargar sin perderse o
 * volver a la portada y entrar a otro tema sin empezar de cero.
 *
 * No hace ninguna llamada de red: todo lo que muestra está en el bundle (ver
 * docs/como-funciona.md, "offline"). */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import "./showroom.css";
import { ALL_IMAGES, LogoImg } from "./art";
import { ShowNavContext, type ShowNav } from "./scenes";
import { Selector } from "./Selector";
import { isTourId, TOURS, type TourId } from "./tours";

type Place = { tour: TourId | null; index: number };

const SWIPE_MIN = 56;

const readHash = (): Place => {
  const [id, n] = window.location.hash.replace(/^#/, "").split("/");
  if (!id || !isTourId(id)) return { tour: null, index: 0 };
  const max = TOURS[id].scenes.length - 1;
  const index = Math.min(Math.max((Number(n) || 1) - 1, 0), max);
  return { tour: id, index };
};

const writeHash = (p: Place) => {
  const hash = p.tour ? `#${p.tour}/${p.index + 1}` : "";
  const url = window.location.pathname + window.location.search + hash;
  window.history.replaceState(null, "", url);
};

export const Showroom = () => {
  const [place, setPlace] = useState<Place>({ tour: null, index: 0 });
  const [dir, setDir] = useState<"next" | "prev">("next");
  /* Cambia en cada reinicio, para volver a montar la escena aunque sea la
   * misma y que las animaciones arranquen de nuevo. */
  const [run, setRun] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- el hash solo existe en el navegador. */
    setPlace(readHash());
    const onHash = () => setPlace(readHash());
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener("hashchange", onHash);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, []);

  /* Para que ande sin conexión: le pasa al service worker todo lo que cargó
   * esta página (ella misma, JS, CSS, imágenes, fuentes) y él lo guarda.
   * Abrirla una vez con internet alcanza. El SW se registra solo en
   * producción; sin él, `ready` nunca resuelve y esto no hace nada. */
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const t = window.setTimeout(() => {
      const urls = [
        window.location.origin + window.location.pathname,
        ...ALL_IMAGES.map((src) => new URL(src, window.location.origin).href),
        ...performance.getEntriesByType("resource").map((e) => e.name),
      ];
      void navigator.serviceWorker.ready.then((reg) =>
        reg.active?.postMessage({ type: "cicalino-guardar-presentacion", urls }),
      );
    }, 2500);
    return () => window.clearTimeout(t);
  }, []);

  const go = useCallback((p: Place, direction: "next" | "prev" = "next") => {
    setDir(direction);
    setPlace(p);
    writeHash(p);
  }, []);

  const tour = place.tour ? TOURS[place.tour] : null;
  const total = tour?.scenes.length ?? 0;

  const next = useCallback(() => {
    /* En la portada, avanzar es arrancar la presentación completa. */
    if (!tour) return go({ tour: "completa", index: 0 }, "next");
    if (place.index < total - 1) go({ tour: tour.id, index: place.index + 1 }, "next");
  }, [go, place.index, total, tour]);

  const prev = useCallback(() => {
    if (!tour) return;
    if (place.index > 0) go({ tour: tour.id, index: place.index - 1 }, "prev");
    else go({ tour: null, index: 0 }, "prev");
  }, [go, place.index, tour]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const nav: ShowNav = useMemo(
    () => ({
      toSelector: () => go({ tour: null, index: 0 }, "prev"),
      startTour: (id: string) => {
        if (isTourId(id)) go({ tour: id, index: 0 }, "next");
      },
      restart: () => {
        if (!tour) return;
        setRun((r) => r + 1);
        go({ tour: tour.id, index: 0 }, "prev");
      },
      tourId: place.tour ?? "",
    }),
    [go, place.tour, tour],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      /* Espacio y Enter sobre un botón tienen que tocar el botón. */
      const onButton = target?.closest("button, a");
      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
          e.preventDefault();
          next();
          break;
        case " ":
          if (onButton) return;
          e.preventDefault();
          next();
          break;
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          prev();
          break;
        case "Escape":
        case "Home":
          if (document.fullscreenElement && e.key === "Escape") return;
          nav.toSelector();
          break;
        case "r":
        case "R":
          nav.restart();
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav, next, prev, toggleFullscreen]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.changedTouches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < SWIPE_MIN) return;
    if (dx < 0) next();
    else prev();
  };

  const scene = tour?.scenes[place.index];

  return (
    <ShowNavContext.Provider value={nav}>
      <div
        className="cic-show fixed inset-0 z-50 flex flex-col overflow-hidden"
        /* Imágenes con variante clara/oscura del resto del sitio: acá siempre
         * la clara (ver globals.css, data-scheme). */
        data-scheme="light"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Arriba: la marca y, dentro de un recorrido, dónde estamos. */}
        <header className="flex h-[clamp(3.25rem,8vh,4.5rem)] shrink-0 items-center justify-between px-5 sm:px-8">
          {/* El logo y "Volver" salen de la presentación al sitio. Dentro de
           * un recorrido, "Temas" (abajo) vuelve a la portada. Sin prefetch:
           * la presentación no hace llamadas de red mientras se muestra. */}
          <Link href="/" prefetch={false} className="flex items-center gap-3 rounded-full" aria-label="Volver a la web">
            <LogoImg className="h-[clamp(1.75rem,4.5vh,2.5rem)]" />
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href="/"
              prefetch={false}
              className="mr-1 flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-marca/75 transition hover:bg-marca/8 hover:text-marca"
            >
              <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
                <path d="M12 4 L6 10 L12 16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Volver
            </Link>
            {tour && (
              <span className="mr-2 hidden text-sm font-semibold text-suave sm:inline">{tour.label}</span>
            )}
            {tour && (
              <IconButton label="Reiniciar (R)" onClick={nav.restart}>
                <path d="M4 10 a6 6 0 1 0 2 -4.5" />
                <path d="M4 3 v4 h4" />
              </IconButton>
            )}
            <IconButton label={fullscreen ? "Salir de pantalla completa (F)" : "Pantalla completa (F)"} onClick={toggleFullscreen}>
              {fullscreen ? (
                <path d="M7 3 v4 h-4 M13 3 v4 h4 M7 17 v-4 h-4 M13 17 v-4 h4" />
              ) : (
                <path d="M3 7 v-4 h4 M17 7 v-4 h-4 M3 13 v4 h4 M17 13 v4 h-4" />
              )}
            </IconButton>
          </div>
        </header>

        <main className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-2">
          {tour && scene ? (
            <div key={`${tour.id}-${place.index}-${run}`} className={`h-full min-h-fit ${dir === "next" ? "show-scene-next" : "show-scene-prev"}`}>
              {scene.render()}
            </div>
          ) : (
            <Selector key={`selector-${run}`} onStart={nav.startTour} />
          )}
        </main>

        {/* Abajo: volver a los temas, el progreso y avanzar. Discreto. */}
        {tour && (
          <nav
            className="show-controls flex h-[clamp(3.5rem,9vh,4.75rem)] shrink-0 items-center justify-between gap-3 px-4 sm:px-8"
            aria-label="Navegación de la presentación"
          >
            <button
              type="button"
              onClick={nav.toSelector}
              className="flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-marca/75 transition hover:bg-marca/8 hover:text-marca"
            >
              <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
                <path d="M12 4 L6 10 L12 16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">Temas</span>
            </button>

            <ol className="flex items-center gap-1.5" aria-label={`Escena ${place.index + 1} de ${total}`}>
              {tour.scenes.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => go({ tour: tour.id, index: i }, i < place.index ? "prev" : "next")}
                    aria-label={`Ir a la escena ${i + 1}`}
                    aria-current={i === place.index ? "step" : undefined}
                    className="grid h-8 place-items-center px-0.5"
                  >
                    <span
                      className={`block h-2 rounded-full transition-all duration-300 ${
                        i === place.index ? "w-7 bg-marca" : i < place.index ? "w-2 bg-marca/55" : "w-2 bg-marca/20"
                      }`}
                    />
                  </button>
                </li>
              ))}
            </ol>

            <div className="flex items-center gap-2">
              <RoundButton label="Anterior (←)" onClick={prev}>
                <path d="M12 4 L6 10 L12 16" />
              </RoundButton>
              <RoundButton label="Siguiente (→)" onClick={next} primary disabled={place.index >= total - 1}>
                <path d="M8 4 L14 10 L8 16" />
              </RoundButton>
            </div>
          </nav>
        )}
      </div>
    </ShowNavContext.Provider>
  );
};

const IconButton = ({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    aria-label={label}
    className="grid size-10 place-items-center rounded-full text-marca/60 transition hover:bg-marca/8 hover:text-marca"
  >
    <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  </button>
);

const RoundButton = ({
  label,
  onClick,
  children,
  primary = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  primary?: boolean;
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={label}
    aria-label={label}
    className={`grid size-12 place-items-center rounded-full transition active:scale-95 disabled:opacity-30 ${
      primary ? "bg-marca text-crema hover:bg-marca-fuerte" : "border-2 border-marca/30 text-marca hover:border-marca"
    }`}
  >
    <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  </button>
);
