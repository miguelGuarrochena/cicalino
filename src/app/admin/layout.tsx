import { Logo } from "@/components/ui/Logo";
import { Controls } from "@/components/ui/Controls";
import { RoleSwitcher } from "@/components/local/RoleSwitcher";
import { SiteFooter } from "@/components/ui/SiteFooter";

// Layout del area de superadmin (Cicalino) — separada del panel del local.
const AdminLayout = ({
  children,
}: Readonly<{ children: React.ReactNode }>) => {
  return (
    <div className="flex min-h-dvh flex-col bg-crema">
      <header className="sticky top-0 z-20 border-b border-linea/70 bg-crema/80 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <Logo className="h-10 sm:h-12" />
            <span className="rounded-full bg-carbon px-3 py-1 text-xs font-bold uppercase tracking-wide text-crema">
              Superadmin
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <RoleSwitcher />
            <Controls />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
};
export default AdminLayout;
