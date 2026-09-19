"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { MenuItemCard } from "@/components/customer/table/MenuItemCard";
import { CategorySheet } from "@/components/customer/table/CategorySheet";
import { CustomerEmpty } from "@/components/customer/CustomerEmpty";
import {
  agruparPorCategoria,
  buscarPlatos,
  categoriaActiva,
  CARTA_CON_INDICE,
  MENU_CON_BUSCADOR,
  type MenuCategory,
} from "@/lib/menuBrowse";
import type { GuestMenuProduct } from "@/components/customer/table/TableGuestApp";

/* La carta, con forma de carta.
 *
 * Diez categorías de quince platos son ciento cincuenta tarjetas en una sola
 * columna: para llegar a los postres había que pasar por todo, y el único
 * cartel que decía dónde estabas era el título de la sección, que se iba con
 * el scroll.
 *
 * La barra de acá abajo queda fija y resuelve las dos preguntas con una sola
 * fila de 56 px: dice en qué categoría estás —con todas las letras, no con un
 * punto— y al tocarla abre el índice para saltar a cualquier otra. Y, cuando
 * la carta es grande, al lado aparece el buscador. */
export const MenuBrowser = ({
  menu,
  cart,
  puedePedir,
  onCantidad,
  /* Alto de lo que ya está pegado arriba (las pestañas). Lo mide la pantalla,
   * que es la dueña de esa barra, y sirve para dos cosas: dónde se pega esta
   * barra y a qué altura tiene que frenar el salto. */
  stickyTop,
}: {
  menu: GuestMenuProduct[];
  cart: Record<string, number>;
  puedePedir: boolean;
  onCantidad: (id: string, q: number) => void;
  stickyTop: number;
}) => {
  const { t } = useApp();

  const categorias = useMemo(
    () => agruparPorCategoria(menu, t("mesa.sinCategoria")),
    [menu, t],
  );

  const conIndice = categorias.length >= CARTA_CON_INDICE;
  const conBuscador = menu.length >= MENU_CON_BUSCADOR;

  const [activa, setActiva] = useState(0);
  const [indiceAbierto, setIndiceAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [q, setQ] = useState("");
  const [barraAlto, setBarraAlto] = useState(0);

  const barraRef = useRef<HTMLDivElement>(null);
  const titulosRef = useRef<(HTMLHeadingElement | null)[]>([]);
  /* Índice al que acabamos de saltar. Mientras el scroll suave está en camino,
   * la activa se queda ahí: si no, el indicador va marcando cada categoría que
   * pasa de largo y parece que la pantalla temblara. */
  const fijada = useRef<number | null>(null);

  useEffect(() => {
    const el = barraRef.current;
    if (!el) return;
    const medir = () => setBarraAlto(el.offsetHeight);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [conIndice, buscando]);

  /* Dónde termina lo que está pegado arriba. Todo salto tiene que frenar acá
   * abajo, si no el título queda tapado por la propia barra que lo anuncia. */
  const corte = stickyTop + barraAlto;

  useEffect(() => {
    if (!conIndice || buscando) return;
    let pedido = 0;
    const revisar = () => {
      pedido = 0;
      const tops = titulosRef.current
        .slice(0, categorias.length)
        .map((el) => el?.getBoundingClientRect().top ?? Infinity);
      const i = categoriaActiva(tops, corte);
      if (fijada.current !== null) {
        if (i === fijada.current) fijada.current = null;
        return;
      }
      setActiva(i);
    };
    const onScroll = () => {
      if (pedido) return;
      pedido = requestAnimationFrame(revisar);
    };
    revisar();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (pedido) cancelAnimationFrame(pedido);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [conIndice, buscando, categorias.length, corte]);

  const saltar = useCallback(
    (c: MenuCategory) => {
      const i = categorias.findIndex((x) => x.id === c.id);
      const el = titulosRef.current[i];
      setIndiceAbierto(false);
      if (!el) return;
      fijada.current = i;
      setActiva(i);
      /* Si la persona pidió menos movimiento, el salto es seco. Y por las
       * dudas, la marca se suelta sola: un scroll suave que nunca llega
       * dejaría el indicador congelado para siempre. */
      const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" });
      window.setTimeout(() => {
        fijada.current = null;
      }, 900);
    },
    [categorias],
  );

  const cerrarBusqueda = () => {
    setBuscando(false);
    setQ("");
  };

  const hallazgos = useMemo(
    () => (buscando ? buscarPlatos(categorias, q) : []),
    [buscando, categorias, q],
  );

  if (!menu.length) {
    return (
      <section className="mt-5">
        <CustomerEmpty
          conMascota
          titulo={t("mesa.cartaVacia")}
          cuerpo={t("mesa.cartaVaciaAyuda")}
        />
      </section>
    );
  }

  return (
    <section className="mt-5">
      {(conIndice || conBuscador) && (
        <div
          ref={barraRef}
          style={{ top: stickyTop }}
          className="sticky z-10 -mx-4 flex items-center gap-2 border-b border-linea bg-crema/95 px-4 py-2 backdrop-blur"
        >
          {buscando ? (
            <>
              <label className="min-w-0 flex-1">
                <span className="sr-only">{t("mesa.buscarPlato")}</span>
                <input
                  type="search"
                  value={q}
                  autoFocus
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("mesa.buscarPlato")}
                  className="min-h-12 w-full rounded-full border-2 border-marca bg-surface px-4 text-base text-carbon outline-none placeholder:text-suave"
                />
              </label>
              <button
                type="button"
                onClick={cerrarBusqueda}
                className="inline-flex min-h-12 shrink-0 items-center rounded-full border-2 border-linea px-4 text-base font-semibold text-carbon"
              >
                {t("mesa.cerrarBusqueda")}
              </button>
            </>
          ) : (
            <>
              {/* La barra no lleva etiqueta delante del nombre. Con un "ESTÁS
                  EN" a la izquierda y "Buscar" a la derecha, a la categoría le
                  quedaban 100 px y "Para compartir" se leía "Para co…" — justo
                  la palabra que esta barra existe para mostrar. El lector de
                  pantalla sí recibe la frase entera, en el aria-label. */}
              {conIndice ? (
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={t("mesa.enCategoriaN", {
                    n: categorias[activa]?.nombre ?? "",
                  })}
                  onClick={() => setIndiceAbierto(true)}
                  className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-full border-2 border-linea bg-surface px-4 text-left"
                >
                  <span className="min-w-0 flex-1 truncate text-base font-bold text-carbon">
                    {categorias[activa]?.nombre}
                  </span>
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="shrink-0 text-marca"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              ) : (
                <span className="flex-1" />
              )}
              {/* Con la palabra "Buscar" al lado, a la categoría le quedaban
                  126 px: entraba "Guarniciones" y se cortaba "Bebidas sin
                  alcohol". Solo la lupa libera 73 px y el nombre pasa a tener
                  sitio para casi cualquier categoría real. La lupa es de los
                  pocos íconos que no hace falta explicar, y para quien no la
                  ve está el `aria-label`. Cuando la carta no tiene índice, el
                  buscador se queda con la fila y recupera su palabra. */}
              {conBuscador && (
                <button
                  type="button"
                  aria-label={t("mesa.buscarPlato")}
                  onClick={() => setBuscando(true)}
                  className={`inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full border-2 border-marca text-base font-semibold text-marca ${
                    conIndice ? "w-12" : "px-5"
                  }`}
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  {!conIndice && t("mesa.buscar")}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {buscando ? (
        <div className="mt-5">
          {!q.trim() ? (
            <p className="py-10 text-center text-base text-suave">{t("mesa.buscarAyuda")}</p>
          ) : hallazgos.length ? (
            <>
              <p className="mb-3 text-base text-suave" role="status">
                {hallazgos.length === 1
                  ? t("mesa.resultadoUno")
                  : t("mesa.resultadosN", { n: hallazgos.length })}
              </p>
              <ul className="flex flex-col gap-2.5">
                {hallazgos.map((h) => (
                  <MenuItemCard
                    key={h.producto.id}
                    producto={h.producto}
                    categoria={h.categoria}
                    cantidad={cart[h.producto.id] ?? 0}
                    puedePedir={puedePedir}
                    onCantidad={(n) => onCantidad(h.producto.id, n)}
                  />
                ))}
              </ul>
            </>
          ) : (
            <CustomerEmpty
              titulo={t("mesa.sinResultados")}
              cuerpo={t("mesa.sinResultadosAyuda", { q: q.trim() })}
              accion={
                <button
                  type="button"
                  onClick={cerrarBusqueda}
                  className="inline-flex min-h-12 items-center rounded-full border-2 border-marca px-5 text-base font-semibold text-marca"
                >
                  {t("mesa.verTodaLaCarta")}
                </button>
              }
            />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-7 pt-5">
          {categorias.map((c, i) => (
            <div key={c.id}>
              <h2
                id={`cat-${c.id}`}
                ref={(el) => {
                  titulosRef.current[i] = el;
                }}
                style={{ scrollMarginTop: corte + 12 }}
                className="mb-3 font-display text-xl uppercase tracking-tight text-carbon"
              >
                {c.nombre}
              </h2>
              <ul className="flex flex-col gap-2.5">
                {c.items.map((p) => (
                  <MenuItemCard
                    key={p.id}
                    producto={p}
                    cantidad={cart[p.id] ?? 0}
                    puedePedir={puedePedir}
                    onCantidad={(n) => onCantidad(p.id, n)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {indiceAbierto && (
        <CategorySheet
          categorias={categorias}
          activa={activa}
          onElegir={saltar}
          onClose={() => setIndiceAbierto(false)}
        />
      )}
    </section>
  );
};
