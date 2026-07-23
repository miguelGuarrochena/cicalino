// Bloque de carga con efecto shimmer (ver .skeleton en globals.css).
export const Skeleton = ({ className = "" }: { className?: string }) => (
  <div className={`skeleton ${className}`} aria-hidden="true" />
);

// Tarjeta de pedido en estado de carga (misma silueta que PedidoCard).
export const PedidoCardSkeleton = () => (
  <div className="flex flex-col gap-4 rounded-[28px] border border-linea bg-surface p-5">
    <div className="flex items-start justify-between gap-2">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-8 w-20" />
      </div>
      <Skeleton className="h-6 w-16 rounded-full" />
    </div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Skeleton className="h-8" />
      <Skeleton className="h-8" />
      <Skeleton className="col-span-2 h-8 sm:col-span-1" />
    </div>
    <Skeleton className="h-11 rounded-full" />
  </div>
);
