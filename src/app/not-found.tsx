import Link from "next/link";
import { ThemedImg } from "@/components/ui/ThemedImg";

// 404 branded.
const NotFound = () => (
  <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-crema px-6 text-center">
    <ThemedImg name="bell" alt="" className="h-24 sm:h-28" />
    <div>
      <h1 className="font-display text-3xl uppercase tracking-tight text-marca">
        404
      </h1>
      <p className="mt-2 max-w-sm text-sm text-carbon/60">
        No encontramos esta página. Puede que el link haya cambiado.
      </p>
    </div>
    <Link
      href="/"
      className="rounded-full bg-marca px-5 py-2.5 text-sm font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95"
    >
      Volver al inicio
    </Link>
  </div>
);

export default NotFound;
