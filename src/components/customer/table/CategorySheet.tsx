"use client";

import { useApp } from "@/components/providers/Providers";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import type { MenuCategory } from "@/lib/menuBrowse";

/* El índice de la carta.
 *
 * Es una hoja y no una fila de fichas que se desliza al costado, a propósito.
 * Con diez categorías en 375 px entran dos y media: el resto vive fuera de la
 * pantalla, y descubrir que eso se arrastra hacia el lado es justo lo que no
 * hace alguien grande, apurado o que no ve bien de cerca. Acá están todas, una
 * abajo de la otra, cada una de 56 px, y la lista sube desde abajo — que es
 * donde llega el pulgar.
 *
 * La que estás mirando se marca por tres vías a la vez: la barra de la
 * izquierda, la negrita y el tilde. Ninguna depende de distinguir un color. */
export const CategorySheet = ({
  categorias,
  activa,
  onElegir,
  onClose,
}: {
  categorias: MenuCategory[];
  /* Índice de la que se está mirando. */
  activa: number;
  onElegir: (c: MenuCategory) => void;
  onClose: () => void;
}) => {
  const { t } = useApp();
  return (
    <ModalShell onClose={onClose} labelledBy="cats-title">
      <div className="flex items-start justify-between gap-3">
        <h2 id="cats-title" className="font-display text-2xl uppercase text-marca">
          {t("mesa.categorias")}
        </h2>
        <ModalCloseBtn onClick={onClose} label={t("mesa.cerrar")} />
      </div>
      <ul className="mt-4 flex flex-col gap-1.5">
        {categorias.map((c, i) => {
          const esta = i === activa;
          return (
            <li key={c.id}>
              <button
                type="button"
                aria-current={esta ? "true" : undefined}
                onClick={() => onElegir(c)}
                className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 px-4 text-left transition ${
                  esta ? "border-marca bg-marca/10" : "border-linea bg-surface"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-8 w-1.5 shrink-0 rounded-full ${esta ? "bg-marca" : "bg-transparent"}`}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-lg ${esta ? "font-bold text-carbon" : "font-semibold text-carbon"}`}
                  >
                    {c.nombre}
                  </span>
                  <span className="block text-sm text-suave">
                    {t("mesa.platosN", { n: c.items.length })}
                  </span>
                </span>
                {esta ? (
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="shrink-0 text-marca"
                  >
                    <path d="m4.5 12.5 5 5 10-11" />
                  </svg>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </ModalShell>
  );
};
