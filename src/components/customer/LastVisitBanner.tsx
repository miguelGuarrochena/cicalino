"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/providers/Providers";
import {
  clearLastVisit,
  readLastVisit,
  type LastVisit,
} from "@/lib/customerLastVisit";

const HIDE_KEY = "cicalino-ocultar-seguimiento";

export const LastVisitBanner = () => {
  const { t } = useApp();
  const [visit, setVisit] = useState<LastVisit | null>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(HIDE_KEY) === "1") return;
    } catch {
      /* ignore */
    }
    const actual = readLastVisit();
    if (!actual) return;
    const path = window.location.pathname;
    if (path === `/p/${actual.token}` || path === `/e/${actual.token}`) return;
    setVisit(actual);
  }, []);

  if (!visit) return null;

  const href = visit.kind === "p" ? `/p/${visit.token}` : `/e/${visit.token}`;
  const label = visit.alias
    ? `${visit.label} · ${visit.alias}`
    : visit.label;
  const cta =
    visit.kind === "p"
      ? t("seguimiento.pedido", { n: label })
      : t("seguimiento.mesa", { n: label });

  const ocultar = () => {
    setVisit(null);
    try {
      sessionStorage.setItem(HIDE_KEY, "1");
    } catch {
      clearLastVisit();
    }
  };

  return (
    <div className="relative z-40 border-b border-marca/20 bg-marca text-crema">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <Link
          href={href}
          className="min-w-0 flex-1 text-sm font-semibold leading-snug hover:underline"
        >
          {cta}
          <span className="mt-0.5 block text-xs font-medium text-crema/75">
            {t("seguimiento.sub")}
          </span>
        </Link>
        <button
          type="button"
          onClick={ocultar}
          className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-crema/80 hover:bg-white/10"
        >
          {t("seguimiento.cerrar")}
        </button>
      </div>
    </div>
  );
};
