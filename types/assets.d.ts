/* Declaraciones de tipo para importar imágenes.
 *
 * Next genera esto mismo en `next-env.d.ts`, pero ese archivo está en el
 * .gitignore y sólo aparece después de un `next dev` o `next build`. En CI el
 * typecheck corre antes que el build, así que ahí no existe y todos los
 * imports de `.png` fallan con TS2307.
 *
 * Local no se notaba porque el archivo generado ya estaba en disco: el clásico
 * "en mi máquina anda". Esta copia, commiteada, hace que el typecheck no
 * dependa de si alguien corrió el build antes.
 */
/// <reference types="next/image-types/global" />
