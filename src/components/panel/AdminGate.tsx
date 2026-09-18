"use client";

/* Anyone already signed into Cicalino can open Settings. The extra owner
 * password used to sit here; waiters were also blocked. Both are gone. */
export const AdminGate = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);
