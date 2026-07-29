import { MascotLoader } from "@/components/ui/MascotLoader";

// Estado de carga del panel: mascota, no skeletons/puntos.
const PanelLoading = () => (
  <div className="flex min-h-[50vh] items-center justify-center">
    <MascotLoader />
  </div>
);

export default PanelLoading;
