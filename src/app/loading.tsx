import { ThemedImg } from "@/components/ui/ThemedImg";

// Splash de carga global (branded). Se muestra durante la navegación.
const Loading = () => (
  <div
    className="flex min-h-dvh items-center justify-center bg-crema"
    role="status"
    aria-live="polite"
  >
    <ThemedImg name="bell" alt="" className="u-float h-24 sm:h-28" />
    <span className="sr-only">Cargando…</span>
  </div>
);

export default Loading;
