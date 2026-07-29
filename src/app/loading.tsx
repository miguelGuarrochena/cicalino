import { MascotLoader } from "@/components/ui/MascotLoader";

// Splash de carga global (branded). Se muestra durante la navegación.
const Loading = () => (
  <div className="flex min-h-dvh items-center justify-center bg-crema">
    <MascotLoader />
  </div>
);

export default Loading;
