"use client";

import { useEffect } from "react";

/* La experiencia del comensal es siempre Light: el Light/Dark de Cicalino
 * queda en el panel, la landing y el CRM. Forzar acá no pisa la preferencia
 * guardada; al salir se restaura. */
const CustomerLayout = ({ children }: { children: React.ReactNode }) => {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", "light");
    root.style.colorScheme = "light";
    return () => {
      root.style.colorScheme = "";
      try {
        const saved = localStorage.getItem("cicalino-theme");
        if (saved && saved !== "system") {
          root.setAttribute("data-theme", saved);
        } else {
          root.removeAttribute("data-theme");
        }
      } catch {
        root.removeAttribute("data-theme");
      }
    };
  }, []);

  return children;
};

export default CustomerLayout;
