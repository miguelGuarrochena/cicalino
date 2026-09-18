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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2 sm:flex-nowrap sm:justify-between sm:gap-3 sm:px-8 sm:py-3">
          <Logo href={homeHref} className="h-8 shrink-0 sm:h-12" />
          <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-1.5 sm:w-auto sm:flex-nowrap sm:gap-3">
            {role !== "superadmin" && <BranchSwitcher />}
            {role !== "superadmin" && <PanelNav />}
            {mostrarFichaje && <Fichaje />}
            {role !== "superadmin" && <SoundToggle />}
            <ThemeToggle />
            <PanelMenu />
          </div>
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
