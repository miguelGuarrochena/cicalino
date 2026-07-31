import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { Controls } from "@/components/ui/Controls";
import { LogoutButton } from "@/components/ui/LogoutButton";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { getCurrentProfile } from "@/lib/auth/profile";

const AdminLayout = async ({
  children,
}: Readonly<{ children: React.ReactNode }>) => {
  const perfil = await getCurrentProfile();
  if (!perfil || perfil.rol !== "superadmin") redirect("/login");
  return (
    <div className="flex min-h-dvh flex-col bg-crema">
      <header className="sticky top-0 z-20 border-b border-linea/70 bg-crema/80 backdrop-blur-md">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 sm:gap-3 sm:px-8 sm:py-3">
          <Logo href="/admin" className="h-8 sm:h-12" />
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            <Controls />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 sm:px-6 sm:py-8">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
};
export default AdminLayout;
