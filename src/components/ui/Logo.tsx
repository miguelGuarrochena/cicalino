import Link from "next/link";
import { ThemedImg } from "@/components/ui/ThemedImg";

// Logo lockup de Cicalino. Por defecto es un link a home; pasá `href` para
// que en panel/admin vuelva al área logueada (no a la landing).
export const Logo = ({
  className = "h-10",
  linked = true,
  href = "/",
}: {
  className?: string;
  linked?: boolean;
  /** Destino del link. En panel usá `/panel`; en admin `/admin`. */
  href?: string;
}) => {
  // h-* en el wrapper; la img mantiene aspect-ratio (no se estira).
  const img = (
    <span
      className={`relative inline-flex shrink-0 items-center overflow-hidden ${className}`}
    >
      <ThemedImg
        name="logo"
        alt="Cicalino"
        className="!h-full !w-auto max-w-[9.5rem] object-contain object-left sm:max-w-[12rem]"
      />
    </span>
  );
  if (!linked) {
    return <span className="inline-flex shrink-0 items-center">{img}</span>;
  }
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center"
      aria-label="Cicalino"
    >
      {img}
    </Link>
  );
};
