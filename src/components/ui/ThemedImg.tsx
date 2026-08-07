import Image from "next/image";
import { IMAGENES, type NombreImagen } from "./imagenes";

/* Renderiza las dos variantes y deja que el CSS muestre la que corresponde
 * (`.on-light` / `.on-dark`). Se hace así, y no eligiendo en JS, porque el
 * tema lo aplica un script bloqueante antes del primer pintado: decidirlo en
 * React traería un desajuste de hidratación y un parpadeo. */
export const ThemedImg = ({
  name,
  alt = "",
  className = "",
  priority = false,
}: {
  name: NombreImagen;
  alt?: string;
  className?: string;
  /* Para lo que está arriba del pliegue, como el logo: sin esto next/image
   * carga en diferido y se ve aparecer. */
  priority?: boolean;
}) => {
  const par = IMAGENES[name];
  return (
    <>
      <Image
        src={par.light}
        alt={alt}
        className={`on-light ${className}`}
        priority={priority}
      />
      <Image
        src={par.dark}
        alt={alt}
        className={`on-dark ${className}`}
        priority={priority}
      />
    </>
  );
};
