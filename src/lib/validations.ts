// Validaciones de UX para los formularios (feedback en vivo mientras se tipea).
//
// ⚠️ NO son un control de seguridad. La validación que importa vive en
// `src/lib/schemas` (Zod, en el servidor) y en los CHECK de la base. Si cambiás
// una regla acá, cambiala también allá.

export const isEmail = (v: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
};

// CUIL/CUIT AR: XX-XXXXXXXX-X o 11 dígitos.
export const isCuil = (v: string): boolean => {
  const digits = v.replace(/\D/g, "");
  return digits.length === 11;
};

export const formatCuil = (v: string): string => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
};

// WhatsApp flexible: al menos 8 dígitos.
export const isWhatsapp = (v: string): boolean => {
  if (!v.trim()) return true; // opcional
  return v.replace(/\D/g, "").length >= 8;
};

export const isPin4 = (v: string): boolean => {
  return /^\d{4}$/.test(v.trim());
};

/** Comparación de nombres de empleado (sin importar mayúsculas ni espacios de sobra). */
export const normalizarNombreEmpleado = (nombre: string): string =>
  nombre.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");

/** true si ya hay alguien con ese nombre en la lista (opcional: ignorar un id al editar). */
export const nombreEmpleadoEnUso = (
  nombre: string,
  empleados: ReadonlyArray<{ id: string; nombre: string }>,
  exceptoId?: string,
): boolean => {
  const n = normalizarNombreEmpleado(nombre);
  if (!n) return false;
  return empleados.some(
    (e) =>
      e.id !== exceptoId && normalizarNombreEmpleado(e.nombre) === n,
  );
};

// `pinEnUso` se eliminó: los PINs ya no bajan al navegador, así que el chequeo
// de duplicados lo hace `set_empleado_pin` en la base (security-fixes-03.sql).
