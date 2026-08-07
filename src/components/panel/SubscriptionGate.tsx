"use client";

import { useEffect, useState } from "react";
import { useSessionStore } from "@/lib/store/session-store";
import { supabaseConfigured } from "@/lib/supabase/config";
import { useApp } from "@/components/providers/Providers";
import { fetchMySubscription, puedeOperar } from "@/lib/data/subscription";
import { MascotLoader } from "@/components/ui/MascotLoader";

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
        href="mailto:info@cicalino.net"
        className="rounded-full bg-marca px-5 py-3 text-sm font-semibold text-crema transition hover:bg-marca-fuerte"
      >
        {es ? "Escribinos" : "Contact us"}
      </a>
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

  const [estado, setEstado] = useState<
    { tipo: "cargando" } | { tipo: "ok" } | { tipo: "bloqueado"; pausada: boolean }
  >({ tipo: "cargando" });

  useEffect(() => {
    /* Superadmin passes through so support can work on a cut-off account,
     * including while impersonating the owner. The database agrees. */
    if (!supabaseConfigured || role === "superadmin" || !orgId) {
      setEstado({ tipo: "ok" });
      return;
    }
    let vivo = true;
    void fetchMySubscription(orgId).then((s) => {
      if (!vivo) return;
      /* Fails open on purpose. If the lookup errors, a network blip shouldn't
       * lock a shop out of its own register in the middle of service — and the
       * database is still blocking the writes either way. */
      if (!s || puedeOperar(s)) {
        setEstado({ tipo: "ok" });
        return;
      }
      setEstado({ tipo: "bloqueado", pausada: s.status !== "expired" });
    });
    return () => {
      vivo = false;
    };
  }, [orgId, role]);

  if (estado.tipo === "cargando") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <MascotLoader className="h-16" />
      </div>
    );
  }
  if (estado.tipo === "bloqueado") return <Bloqueado pausada={estado.pausada} />;
  return <>{children}</>;
};
