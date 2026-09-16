"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ModuleHub } from "@/components/panel/ModuleHub";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";
import { MascotLoader } from "@/components/ui/MascotLoader";

const PanelHubPage = () => {
  const router = useRouter();
  const path = usePathname();
  const { homePath, ready } = useOperationalAccess();

  useEffect(() => {
    if (!ready) return;
    if (homePath !== path) router.replace(homePath);
  }, [ready, homePath, path, router]);

  if (!ready || homePath !== path) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <MascotLoader className="h-16" />
      </div>
    );
  }

  return <ModuleHub />;
};

export default PanelHubPage;
