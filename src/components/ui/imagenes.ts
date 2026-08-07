import type { StaticImageData } from "next/image";

import bellLight from "../../../public/bell-light.png";
import bellDark from "../../../public/bell-dark.png";
import campana_chefLight from "../../../public/campana-chef-light.png";
import campana_chefDark from "../../../public/campana-chef-dark.png";
import campanaLight from "../../../public/campana-light.png";
import campanaDark from "../../../public/campana-dark.png";
import chefLight from "../../../public/chef-light.png";
import chefDark from "../../../public/chef-dark.png";
import esperaLight from "../../../public/espera-light.png";
import esperaDark from "../../../public/espera-dark.png";
import logoLight from "../../../public/logo-light.png";
import logoDark from "../../../public/logo-dark.png";
import okLight from "../../../public/ok-light.png";
import okDark from "../../../public/ok-dark.png";

/* Las ilustraciones que cambian con el tema, importadas estáticamente.
 *
 * El import estático es lo que hace falta para usar next/image: de ahí salen
 * el ancho y el alto reales, que son los que evitan el salto de layout y
 * habilitan la conversión a WebP/AVIF. Con un `src` armado como string
 * (`/${name}-light.png`) eso no se puede.
 *
 * Son unos 13 MB de PNG sin optimizar, con archivos de hasta 2 MB. La pantalla
 * del cliente los carga por datos móviles. */
export const IMAGENES = {
  "bell": { light: bellLight, dark: bellDark },
  "campana-chef": { light: campana_chefLight, dark: campana_chefDark },
  "campana": { light: campanaLight, dark: campanaDark },
  "chef": { light: chefLight, dark: chefDark },
  "espera": { light: esperaLight, dark: esperaDark },
  "logo": { light: logoLight, dark: logoDark },
  "ok": { light: okLight, dark: okDark },
} as const satisfies Record<string, { light: StaticImageData; dark: StaticImageData }>;

export type NombreImagen = keyof typeof IMAGENES;
