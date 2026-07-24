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
  const img = (
    <ThemedImg name="logo" alt="Cicalino" className={className} />
  );
  if (!linked) {
    return <span className="inline-flex items-center">{img}</span>;
  }
  return (
    <Link href={href} className="inline-flex items-center" aria-label="Cicalino">
      {img}
    </Link>
  );
};
