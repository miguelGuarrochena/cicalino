"use client";

import { useApp } from "@/components/providers/Providers";
import { usePwaInstall } from "@/lib/hooks/usePwaInstall";

/* El acceso directo del menú, para quien ya descartó el aviso de abajo o
 * quiere instalarla sin esperar a que aparezca. La detección la comparte con
 * el banner: ver `usePwaInstall`. */
export const InstallButton = ({ className = "" }: { className?: string }) => {
  const { t } = useApp();
  const { promptDisponible, instalar } = usePwaInstall();

  /* Sin diálogo nativo el botón no tiene nada que abrir. En iOS los pasos van
   * en el aviso de abajo, que es donde hay lugar para explicarlos. */
  if (!promptDisponible) return null;

  return (
    <button
      type="button"
      onClick={() => void instalar()}
      className={`flex items-center gap-1.5 rounded-full border border-marca/40 bg-marca/10 px-3 py-1.5 text-xs font-semibold text-marca transition hover:bg-marca/15 ${className}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" />
      </svg>
      {t("instalar.instalar")}
    </button>
  );
};
