"use client";

import { useEffect, useState } from "react";
import { useSessionStore } from "@/lib/store/session-store";
import { supabaseConfigured } from "@/lib/supabase/config";
import { useApp } from "@/components/providers/Providers";
import { fetchMySubscription, puedeOperar } from "@/lib/data/subscription";
import { MascotLoader } from "@/components/ui/MascotLoader";

const EMAIL_SOPORTE = "info@cicalino.net";

/* La dirección, copiable de un toque.
 *
 * El botón de arriba abre un mailto, que en el celular del dueño funciona pero
 * en una tablet de mostrador compartida muchas veces no: no hay cliente de
 * correo configurado y el toque no hace nada. Poder copiar la dirección y
 * escribir desde donde sea es la salida de ese caso. */
const MailCopiable = ({ es }: { es: boolean }) => {
  const [estado, setEstado] = useState<"listo" | "copiado" | "error">("listo");

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL_SOPORTE);
      setEstado("copiado");
      setTimeout(() => setEstado("listo"), 1800);
    } catch {
      /* clipboard necesita contexto seguro y permiso. Si falla hay que
       * decirlo: si no, el usuario toca, no pasa nada y no sabe por qué. */
      setEstado("error");
      setTimeout(() => setEstado("listo"), 2500);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => void copiar()}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-carbon/55 transition hover:bg-carbon/5 hover:text-carbon/80"
        aria-label={
          es ? `Copiar ${EMAIL_SOPORTE}` : `Copy ${EMAIL_SOPORTE}`
        }
      >
        <span>{EMAIL_SOPORTE}</span>
        {estado === "copiado" ? (
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-emerald-600"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>

      {/* aria-live para que un lector de pantalla anuncie el resultado: sin
          esto el cambio de ícono no se percibe. */}
      <span
        aria-live="polite"
        className={`text-xs ${
          estado === "error" ? "text-red-600/80" : "text-carbon/45"
        }`}
      >
        {estado === "copiado"
          ? es
            ? "Copiado"
            : "Copied"
          : estado === "error"
            ? es
              ? "No se pudo copiar, anotalo a mano"
              : "Couldn't copy — write it down"
            : ""}
      </span>
    </div>
  );
};

/* Screen shown when the account can't operate any more.
 *
 * The database is what actually blocks the writes (see local_operativo in
 * supabase/corte-por-impago.sql). This is here so the block reads as a
 * decision and not as a bug: without it the panel looks completely normal and
 * every button fails with an RLS error the shop can't interpret.
 *
 * Reads still work, so they keep seeing their history — that's why this
 * replaces the panel rather than logging anyone out. */
const Bloqueado = ({ pausada }: { pausada: boolean }) => {
  const { locale } = useApp();
  const es = locale !== "en";
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-[28px] border border-linea bg-surface px-6 py-12 text-center shadow-sm">
      <span className="flex size-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
      </span>
      <div>
        <h1 className="font-display text-2xl uppercase tracking-tight text-carbon">
          {pausada
            ? es
              ? "Cuenta pausada"
              : "Account paused"
            : es
              ? "Suscripción vencida"
              : "Subscription expired"}
        </h1>
        <p className="mt-2 text-sm text-carbon/60">
          {pausada
            ? es
              ? "Tu cuenta está pausada, así que por ahora no se pueden cargar pedidos ni esperas."
              : "Your account is paused, so orders and waitlist entries are on hold."
            : es
              ? "Terminó el plazo de pago y la cuenta quedó dada de baja. Por eso no se pueden cargar pedidos ni esperas."
              : "The payment window closed and the account was suspended, so orders and waitlist entries are on hold."}
        </p>
        <p className="mt-3 text-sm text-carbon/60">
          {es
            ? "Tus datos y tu historial siguen acá. Escribinos y en cuanto registremos el pago vuelve a funcionar todo."
            : "Your data and history are still here. Get in touch and everything comes back as soon as we register the payment."}
        </p>
      </div>
      <a
        href={`mailto:${EMAIL_SOPORTE}`}
        className="rounded-full bg-marca px-5 py-3 text-sm font-semibold text-crema transition hover:bg-marca-fuerte"
      >
        {es ? "Escribinos" : "Contact us"}
      </a>

      <MailCopiable es={es} />
    </div>
  );
};

export const SubscriptionGate = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const orgId = useSessionStore((s) => s.organizationId);
  const role = useSessionStore((s) => s.rol);

  const [resuelto, setResuelto] = useState<
    { tipo: "ok" } | { tipo: "bloqueado"; pausada: boolean } | null
  >(null);

  /* Superadmin pasa derecho, para que soporte pueda trabajar sobre una cuenta
   * cortada, incluso mientras impersona al dueño. La base opina lo mismo. */
  const hayQueConsultar =
    supabaseConfigured && role !== "superadmin" && Boolean(orgId);

  /* Derivado: si no hay nada que consultar, ya está resuelto. Antes eso era un
   * setState sincrónico dentro del efecto. */
  const estado = hayQueConsultar ? resuelto : { tipo: "ok" as const };

  useEffect(() => {
    if (!hayQueConsultar || !orgId) return;
    let vivo = true;
    void fetchMySubscription(orgId).then((s) => {
      if (!vivo) return;
      /* Fails open on purpose. If the lookup errors, a network blip shouldn't
       * lock a shop out of its own register in the middle of service — and the
       * database is still blocking the writes either way. */
      if (!s || puedeOperar(s)) {
        setResuelto({ tipo: "ok" });
        return;
      }
      setResuelto({ tipo: "bloqueado", pausada: s.status !== "expired" });
    });
    return () => {
      vivo = false;
    };
  }, [hayQueConsultar, orgId]);

  if (estado === null) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <MascotLoader className="h-16" />
      </div>
    );
  }
  if (estado.tipo === "bloqueado") return <Bloqueado pausada={estado.pausada} />;
  return <>{children}</>;
};
