"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { PanelNav } from "@/components/panel/PanelNav";
import { Fichaje } from "@/components/panel/TimeClock";
import { SoundToggle } from "@/components/panel/SoundToggle";
import { BranchSwitcher } from "@/components/panel/BranchSwitcher";
import { PanelMenu } from "@/components/panel/PanelMenu";
import { ThemeToggle } from "@/components/ui/Controls";
import { useWakeLock } from "@/lib/hooks/useWakeLock";
import { useBranchConfigSync } from "@/lib/hooks/useBranchConfigSync";
import { useSessionStore } from "@/lib/store/session-store";
import { useApp } from "@/components/providers/Providers";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { EsperaCancelWatch } from "@/components/panel/EsperaCancelWatch";
import { FloorAttentionWatch } from "@/components/panel/FloorAttentionWatch";
import { PanelAlertsWatch } from "@/components/panel/PanelAlertsWatch";
import { PanelAlertDock } from "@/components/panel/PanelAlertDock";
import { InstallBanner } from "@/components/pwa/InstallBanner";
import { MascotLoader } from "@/components/ui/MascotLoader";
import { SubscriptionGate } from "@/components/panel/SubscriptionGate";
import {
  useOperationalAccess,
  useModuleRedirect,
} from "@/lib/hooks/useOperationalAccess";

const SuperadminRedirect = () => {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin");
  }, [router]);
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <MascotLoader className="h-16" />
    </div>
  );
};

const BannerImpersonacion = () => {
  const { t } = useApp();
  const router = useRouter();
  const impersonating = useSessionStore((s) => s.impersonando);
  const exitImpersonation = useSessionStore((s) => s.salirImpersonacion);

  if (!impersonating) return null;

  return (
    <div className="border-b border-carbon/20 bg-carbon text-crema">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2 sm:px-6">
        <p className="min-w-0 text-xs font-medium sm:text-sm">
          {t("super.viendoComo", {
            n: `${impersonating.organizationName} · ${impersonating.branchName}`,
          })}
        </p>
        <button
          type="button"
          onClick={() => {
            router.replace("/admin");
            exitImpersonation();
          }}
          className="shrink-0 rounded-full bg-crema/15 px-3 py-1 text-xs font-semibold transition hover:bg-crema/25"
        >
          {t("super.volverAdmin")}
        </button>
      </div>
    </div>
  );
};

const PanelLayout = ({
  children,
}: Readonly<{ children: React.ReactNode }>) => {
  const role = useSessionStore((s) => s.rol);
  const impersonating = useSessionStore((s) => s.impersonando);
  const branchId = useSessionStore((s) => s.sucursalId);
  const path = usePathname();
  const { homePath: homeHref } = useOperationalAccess();
  useModuleRedirect();
  /* "Who's serving" is for shared devices signed in with the owner's or a
   * manager's account. A waiter with their own login is already known: the
   * database attributes their actions (staff-roles.sql). Nothing requires it. */
  const mostrarFichaje =
    role !== "superadmin" &&
    role !== "empleado" &&
    (path === "/panel" ||
      path.startsWith("/panel/pedidos") ||
      path.startsWith("/panel/espera") ||
      path === "/panel/pagos");

  useWakeLock(role !== "superadmin");
  useBranchConfigSync(branchId);

  return (
    <div className="flex min-h-dvh flex-col bg-crema">
      <BannerImpersonacion />
      {role !== "superadmin" && <EsperaCancelWatch />}
      {role !== "superadmin" && <FloorAttentionWatch />}
      {role !== "superadmin" && <PanelAlertsWatch />}
      <header className="sticky top-0 z-20 border-b border-linea/70 bg-crema/80 backdrop-blur-md print:hidden">
        {/* En el teléfono son dos líneas: arriba el logo con los tres botones
            de siempre —sonido, tema y el menú— y abajo la sucursal y quién
            atiende, que son los que llevan texto y necesitan el ancho.
            Antes caían donde entraran y el menú quedaba solo en una tercera
            línea.

            De `xl` para arriba `xl:contents` disuelve los dos grupos: sus
            hijos pasan a ser hijos directos de esta fila y queda el header de
            una sola línea de siempre. El grupo de botones va `xl:order-last`
            para terminar a la derecha, después de Mesas y del fichaje.

            El corte es `xl` (1280) y no `sm`. Medido, la fila única necesita
            985 px —logo 126, sucursal 162, las pestañas 284, el fichaje 169,
            los botones 132, más los espacios y el padding— y eso con la
            sucursal de nombre más corto. En `lg` (1024) quedaban 39 px de
            aire: un nombre de sucursal un poco más largo los comía y la
            sucursal terminaba montada sobre el logo, que es justo lo que
            pasaba en un iPad mini apaisado. Así que teléfono y tablet usan
            las dos líneas y la fila única queda para la notebook. */}
        <div className="flex flex-col gap-1.5 px-3 py-2 sm:px-8 sm:py-3 xl:flex-row xl:items-center xl:gap-3">
          <div className="flex items-center gap-2 xl:contents">
            {/* El logo empuja: a la derecha en su línea del teléfono y contra
                el borde izquierdo en pantalla grande. Va envuelto porque `Logo`
                usa su className para el alto, no para el margen. `shrink-0`
                porque el `Link` que arma `Logo` ya lo traía: sin eso, en una
                tablet angosta el logo se achica y la sucursal se le monta
                encima. */}
            <div className="mr-auto flex shrink-0 items-center">
              <Logo href={homeHref} className="h-8 shrink-0 sm:h-12" />
            </div>
            <div className="flex shrink-0 items-center gap-1.5 xl:order-last xl:gap-3">
              {role !== "superadmin" && <SoundToggle />}
              <ThemeToggle />
              <PanelMenu />
            </div>
          </div>

          {role !== "superadmin" && (
            <div className="flex min-w-0 items-center gap-1.5 xl:contents">
              <BranchSwitcher />
              <PanelNav />
              {/* Contra el margen derecho, debajo de los tres botones: en el
                  teléfono la segunda línea queda con la sucursal a un lado y
                  quién atiende al otro, igual que la primera. En la fila
                  única de `xl` el margen automático se saca, porque ahí el
                  único que empuja tiene que ser el logo. */}
              {mostrarFichaje && (
                <div className="ml-auto flex items-center xl:ml-0">
                  <Fichaje />
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 pb-6 pt-6 sm:px-6 sm:pb-8 sm:pt-8">
        {role === "superadmin" && !impersonating ? (
          <SuperadminRedirect />
        ) : (
          <SubscriptionGate>{children}</SubscriptionGate>
        )}
      </main>

      <SiteFooter className="pb-20 sm:pb-8 print:hidden" />
      {role !== "superadmin" && <PanelAlertDock />}
      {role !== "superadmin" && <PanelNav variant="bottom" />}
      {role !== "superadmin" && <InstallBanner />}
    </div>
  );
};

export default PanelLayout;
