// Validaciones compartidas (front). En prod el back vuelve a validar.

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

export const pinEnUso = (pin: string, empleados: { id: string; pin: string }[], exceptoId?: string): boolean => {
  const p = pin.trim();
  if (!p) return false;
  return empleados.some(
    (e) => e.pin === p && (!exceptoId || e.id !== exceptoId),
  );
};
