// Imagen que cambia segun el tema: usa <name>-light.png (azul, modo claro) y
// <name>-dark.png (crema, modo oscuro), alternadas por CSS (.on-light/.on-dark).
export const ThemedImg = ({
  name,
  alt = "",
  className = "",
}: {
  name: string;
  alt?: string;
  className?: string;
}) => {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/${name}-light.png`}
        alt={alt}
        className={`on-light w-auto ${className}`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/${name}-dark.png`}
        alt={alt}
        className={`on-dark w-auto ${className}`}
      />
    </>
  );
};
