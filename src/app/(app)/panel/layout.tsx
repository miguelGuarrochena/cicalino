"use client";

import { Logo } from "@/components/ui/Logo";
import { PanelNav } from "@/components/panel/PanelNav";
import { Fichaje } from "@/components/panel/TimeClock";
import { SoundToggle } from "@/components/panel/SoundToggle";
import { InstallButton } from "@/components/pwa/InstallButton";
import { BranchSwitcher } from "@/components/panel/BranchSwitcher";
import { RoleSwitcher } from "@/components/panel/RoleSwitcher";
import { Controls } from "@/components/ui/Controls";
import { useWakeLock } from "@/lib/hooks/useWakeLock";
import { useSessionStore } from "@/lib/store/session-store";
import { useApp } from "@/components/providers/Providers";
import { SiteFooter } from "@/components/ui/SiteFooter";
import Link from "next/link";
import { useRouter } from "next/navigation";

const SuperadminRedirect = () => (
  <div className="flex flex-col items-center gap-3 rounded-[28px] border border-linea bg-surface/60 px-6 py-16 text-center">
    <p className="font-display text-xl uppercase tracking-tight text-carbon">
      Área del local
    </p>
    <p className="max-w-sm text-sm text-carbon/55">
      El superadmin opera en su propia consola. Para ver una sucursal, abrila
      desde Superadmin y usá “Entrar como dueño”.
    </p>
    <Link
      href="/admin"
      className="rounded-full bg-carbon px-5 py-2.5 text-sm font-semibold text-crema transition hover:opacity-90"
    >
      Ir a Superadmin
    </Link>
  </div>
);

const BannerImpersonacion = () => {
  const { t } = useApp();
  const router = useRouter();
  const impersonating = useSessionStore((s) => s.impersonando);
  const exitImpersonation = useSessionStore((s) => s.salirImpersonacion);

  if (!impersonating) return null;

  return (
    <div className="border-b border-carbon/20 bg-carbon text-crema">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6">
        <p className="text-xs font-medium sm:text-sm">
          {t("super.viendoComo", {
            n: `${impersonating.organizacionNombre} · ${impersonating.sucursalNombre}`,
          })}
        </p>
        <button
          type="button"
          onClick={() => {
            exitImpersonation();
            router.push("/admin");
          }}
          className="rounded-full bg-crema/15 px-3 py-1 text-xs font-semibold transition hover:bg-crema/25"
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

  useWakeLock(role !== "superadmin");

  return (
    <div className="flex min-h-dvh flex-col bg-crema">
      <BannerImpersonacion />
      <header className="sticky top-0 z-20 border-b border-linea/70 bg-crema/80 backdrop-blur-md">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-8 sm:py-3">
          <Logo className="h-9 sm:h-12" />
          <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-3">
            {role !== "superadmin" && <BranchSwitcher />}
            {role !== "superadmin" && <PanelNav />}
            {role !== "superadmin" && <Fichaje />}
            {role !== "superadmin" && <SoundToggle />}
            <InstallButton className="hidden md:flex" />
            <RoleSwitcher />
            <Controls />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-6 pt-6 sm:px-6 sm:pb-8 sm:pt-8">
        {role === "superadmin" && !impersonating ? (
          <SuperadminRedirect />
        ) : (
          children
        )}
      </main>

      <SiteFooter className="pb-20 sm:pb-8" />
      {role !== "superadmin" && <PanelNav variant="bottom" />}
    </div>
  );
};

export default PanelLayout;
