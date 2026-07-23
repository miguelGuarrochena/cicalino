import { Skeleton, OrderCardSkeleton } from "@/components/ui/Skeleton";

// Estado de carga del panel de pedidos.
const PanelLoading = () => (
  <div className="flex flex-col gap-5 sm:gap-6" aria-hidden="true">
    <div className="flex items-center justify-between gap-3">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-11 w-36 rounded-full" />
    </div>
    <div className="flex gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-24 rounded-full" />
      ))}
    </div>
    <Skeleton className="h-12 rounded-xl" />
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <OrderCardSkeleton key={i} />
      ))}
    </div>
  </div>
);

export default PanelLoading;
