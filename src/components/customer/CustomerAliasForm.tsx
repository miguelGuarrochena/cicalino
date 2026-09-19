"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { supabaseConfigured } from "@/lib/supabase/config";
import { customerAliasSchema } from "@/lib/schemas";
import { orderByToken, useOrdersStore } from "@/lib/store/orders-store";

interface Props {
  token: string;
  alias: string | null;
  onSaved: (alias: string | null) => void;
}

export const CustomerAliasForm = ({ token, alias, onSaved }: Props) => {
  const { t } = useApp();
  const [editing, setEditing] = useState(!alias);
  const [value, setValue] = useState(alias ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (editing) return;
    setValue(alias ?? "");
  }, [alias, editing]);

  const guardar = async () => {
    if (busy) return;
    const parsed = customerAliasSchema.safeParse(value);
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? t("cliente.aliasError"),
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!supabaseConfigured) {
        const o = orderByToken(useOrdersStore.getState().pedidos, token);
        if (o) useOrdersStore.getState().setAlias(o.id, parsed.data);
        onSaved(parsed.data);
        setEditing(!parsed.data);
        setValue(parsed.data ?? "");
        return;
      }
      const res = await fetch(`/api/p/${token}/alias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias: parsed.data ?? "" }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; alias?: string | null; message?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setError(data?.message ?? t("cliente.aliasError"));
        return;
      }
      const saved = data.alias ?? null;
      onSaved(saved);
      setEditing(!saved);
      setValue(saved ?? "");
    } catch {
      setError(t("cliente.aliasError"));
    } finally {
      setBusy(false);
    }
  };

  if (!editing && alias) {
    return (
      <div className="mt-4 text-center">
        <p className="font-display text-3xl leading-tight text-marca sm:text-4xl">
          {alias}
        </p>
        <button
          type="button"
          onClick={() => {
            setEditing(true);
            setValue(alias);
            setError(null);
          }}
          className="mt-1.5 inline-flex min-h-11 items-center rounded-full border border-linea px-4 text-sm font-semibold text-carbon hover:border-marca hover:text-marca"
        >
          {t("cliente.aliasCambiar")}
        </button>
      </div>
    );
  }

  return (
    <form
      className="mt-5 w-full max-w-sm text-left"
      onSubmit={(e) => {
        e.preventDefault();
        void guardar();
      }}
    >
      <label htmlFor="alias-cliente" className="sr-only">
        {t("cliente.aliasPh")}
      </label>
      <div className="flex gap-2">
        <input
          id="alias-cliente"
          type="text"
          inputMode="text"
          autoComplete="nickname"
          maxLength={24}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("cliente.aliasPh")}
          className="min-h-12 flex-1 rounded-full border-2 border-linea bg-surface px-4 text-base text-carbon outline-none ring-marca/30 placeholder:text-suave focus:ring-2"
        />
        <button
          type="submit"
          disabled={busy}
          className="min-h-12 shrink-0 rounded-full bg-marca px-5 text-base font-semibold text-crema transition hover:bg-marca-fuerte disabled:opacity-60"
        >
          {busy ? "…" : t("cliente.aliasGuardar")}
        </button>
      </div>
      <p className="mt-2 px-1 text-sm text-suave">{t("cliente.aliasHint")}</p>
      {error && (
        <p role="alert" className="mt-1.5 px-1 text-sm font-semibold text-alerta">
          {error}
        </p>
      )}
    </form>
  );
};
