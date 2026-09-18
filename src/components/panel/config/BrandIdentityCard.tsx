"use client";

import { useRef, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useConfigStore } from "@/lib/store/config-store";
import { useSessionStore } from "@/lib/store/session-store";
import { useToast } from "@/components/ui/Toast";
import { saveBranchBrand } from "@/lib/data/branch";
import { branchBrandSchema, parseInput } from "@/lib/schemas";
import { supabaseConfigured } from "@/lib/supabase/config";
import { isRealBranchId } from "@/lib/data/orders";
import {
  BRAND_PRESETS,
  CICALINO_SWATCH,
  compressBrandLogo,
  type BrandColorId,
} from "@/lib/customerBrand";

const CARD =
  "rounded-[24px] border border-linea bg-surface p-4 shadow-sm sm:p-6";

const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-4 py-3 text-carbon outline-none focus:border-marca focus:ring-2 focus:ring-marca/20";

const SWATCHES: { id: BrandColorId | null; key: string; hex: string }[] = [
  { id: null, key: "config.colorCobalto", hex: CICALINO_SWATCH },
  { id: "blanco", key: "config.colorBlanco", hex: BRAND_PRESETS.blanco.bg },
  { id: "azul", key: "config.colorAzul", hex: BRAND_PRESETS.azul.bg },
  { id: "negro", key: "config.colorNegro", hex: BRAND_PRESETS.negro.bg },
  { id: "bordo", key: "config.colorBordo", hex: BRAND_PRESETS.bordo.bg },
  { id: "verde", key: "config.colorVerde", hex: BRAND_PRESETS.verde.bg },
  { id: "terracota", key: "config.colorTerracota", hex: BRAND_PRESETS.terracota.bg },
];

export const BrandIdentityCard = () => {
  const { t } = useApp();
  const toast = useToast();
  const branchId = useSessionStore((s) => s.sucursalId);
  const storedName = useConfigStore((s) => s.name);
  const storedLogo = useConfigStore((s) => s.logoUrl);
  const storedColor = useConfigStore((s) => s.colorMarca);
  const hydrate = useConfigStore((s) => s.hydrate);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | undefined>(undefined);
  const [logoUrl, setLogoUrl] = useState<string | null | undefined>(undefined);
  const [color, setColor] = useState<BrandColorId | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const nombre = name === undefined ? storedName : name;
  const logo = logoUrl === undefined ? storedLogo : logoUrl;
  const colorMarca = color === undefined ? storedColor : color;
  const dirty =
    nombre.trim() !== storedName.trim() ||
    logo !== storedLogo ||
    colorMarca !== storedColor;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setImageBusy(true);
    setImageError(null);
    try {
      const url = await compressBrandLogo(file);
      setLogoUrl(url);
      setSaved(false);
    } catch {
      setImageError(t("config.logoInvalido"));
    } finally {
      setImageBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const guardar = async () => {
    if (busy || !dirty) return;
    const parsed = parseInput(branchBrandSchema, {
      name: nombre,
      logoUrl: logo,
      colorMarca,
    });
    if (!parsed.ok) {
      setNameError(t("config.errNombre"));
      return;
    }
    setNameError(null);
    const next = {
      name: parsed.data.name,
      logoUrl: parsed.data.logoUrl,
      colorMarca: parsed.data.colorMarca,
    };
    if (supabaseConfigured && isRealBranchId(branchId)) {
      setBusy(true);
      const ok = await saveBranchBrand(branchId!, next);
      setBusy(false);
      if (!ok) {
        toast(t("toast.configError"), "error");
        return;
      }
    }
    hydrate(next);
    setName(undefined);
    setLogoUrl(undefined);
    setColor(undefined);
    setSaved(true);
    toast(t("config.identidadGuardada"), "success");
  };

  return (
    <section id="identidad" className={`${CARD} scroll-mt-28`}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-carbon/60">
        {t("config.seccionIdentidad")}
      </h2>
      <p className="mb-4 mt-1 text-sm text-carbon/55">
        {t("config.seccionIdentidadSub")}
      </p>

      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-carbon/70">
            {t("config.nombre")}
          </span>
          <p className="text-xs text-carbon/50">{t("config.nombreSub")}</p>
          <input
            value={nombre}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
              setSaved(false);
            }}
            maxLength={80}
            className={INPUT}
            autoComplete="organization"
          />
          {nameError ? (
            <p className="text-xs text-red-500">{nameError}</p>
          ) : null}
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-carbon/70">
            {t("config.logo")}
          </span>
          <p className="text-xs text-carbon/50">{t("config.logoSub")}</p>
          {logo ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logo}
                alt=""
                className="h-12 w-auto max-w-[8rem] object-contain"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={imageBusy || busy}
                  onClick={() => fileRef.current?.click()}
                  className="min-h-11 rounded-full border border-linea px-4 text-sm font-semibold text-carbon disabled:opacity-50"
                >
                  {t("config.logoReemplazar")}
                </button>
                <button
                  type="button"
                  disabled={imageBusy || busy}
                  onClick={() => {
                    setLogoUrl(null);
                    setSaved(false);
                  }}
                  className="min-h-11 rounded-full border border-linea px-4 text-sm font-semibold text-carbon/70 disabled:opacity-50"
                >
                  {t("config.logoQuitar")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={imageBusy || busy}
              onClick={() => fileRef.current?.click()}
              className="min-h-11 w-full rounded-full border border-linea bg-crema/40 px-4 text-sm font-semibold text-carbon disabled:opacity-50 sm:w-auto"
            >
              {imageBusy ? "…" : t("config.logoSubir")}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          {imageError ? (
            <p className="text-xs text-red-500">{imageError}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-carbon/70">
            {t("config.colorMarca")}
          </span>
          <p className="text-xs text-carbon/50">{t("config.colorMarcaSub")}</p>
          <div className="flex flex-wrap gap-2">
            {SWATCHES.map((s) => {
              const selected = colorMarca === s.id;
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setColor(s.id);
                    setSaved(false);
                  }}
                  className={`flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-semibold transition ${
                    selected
                      ? "border-marca bg-marca/10 text-carbon ring-2 ring-marca/30"
                      : "border-linea bg-crema/40 text-carbon/70 hover:border-carbon/30"
                  }`}
                >
                  <span
                    className="size-5 shrink-0 rounded-full border border-black/10"
                    style={{ backgroundColor: s.hex }}
                  />
                  {t(s.key)}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          disabled={busy || imageBusy || !dirty}
          onClick={() => void guardar()}
          className="min-h-11 w-full rounded-full bg-marca px-5 text-sm font-semibold text-crema transition hover:bg-marca-fuerte disabled:opacity-50 sm:w-auto"
        >
          {busy
            ? "…"
            : saved
              ? `✓ ${t("config.identidadGuardada")}`
              : t("config.identidadGuardar")}
        </button>
      </div>
    </section>
  );
};
