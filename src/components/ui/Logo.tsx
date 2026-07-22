import Link from "next/link";
import { ThemedImg } from "@/components/ui/ThemedImg";

// Logo lockup de Cicalino. Por defecto es un link a home; pasá linked={false}
// si ya está dentro de otro <a>/<Link>.
export const Logo = ({
  className = "h-10",
  linked = true,
}: {
  className?: string;
  linked?: boolean;
}) => {
  const img = (
    <ThemedImg name="logo" alt="Cicalino" className={className} />
  );
  if (!linked) {
    return <span className="inline-flex items-center">{img}</span>;
  }
  return (
    <Link href="/" className="inline-flex items-center" aria-label="Cicalino">
      {img}
    </Link>
  );
};
