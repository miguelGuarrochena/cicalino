
export const isEmail = (v: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
};

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

export const isWhatsapp = (v: string): boolean => {
  if (!v.trim()) return true;
  return v.replace(/\D/g, "").length >= 8;
};

export const isPin4 = (v: string): boolean => {
  return /^\d{4}$/.test(v.trim());
};

export const normalizeEmployeeName = (nombre: string): string =>
  nombre.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");

export const isEmployeeNameTaken = (
  nombre: string,
  empleados: ReadonlyArray<{ id: string; nombre: string }>,
  exceptoId?: string,
): boolean => {
  const n = normalizeEmployeeName(nombre);
  if (!n) return false;
  return empleados.some(
    (e) =>
      e.id !== exceptoId && normalizeEmployeeName(e.nombre) === n,
  );
};

