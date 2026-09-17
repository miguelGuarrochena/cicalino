"use client";

import { useSessionStore } from "@/lib/store/session-store";
import { NoAccess } from "@/components/ui/NoAccess";

/* Role check only. The extra owner-password prompt used to sit here; the
 * panel itself is open without login. Waiters still can't open Settings. */
export const AdminGate = ({ children }: { children: React.ReactNode }) => {
  const role = useSessionStore((s) => s.rol);

  if (role === "empleado" || role === "superadmin") {
    return <NoAccess />;
  }

  return <>{children}</>;
};
