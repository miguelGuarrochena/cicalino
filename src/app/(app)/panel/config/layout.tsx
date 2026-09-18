"use client";

import { AdminGate } from "@/components/panel/AdminGate";
import { ConfigNav } from "@/components/panel/config/ConfigNav";

const ConfigLayout = ({ children }: { children: React.ReactNode }) => (
  <AdminGate>
    <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
      <ConfigNav />
      {children}
    </div>
  </AdminGate>
);

export default ConfigLayout;
