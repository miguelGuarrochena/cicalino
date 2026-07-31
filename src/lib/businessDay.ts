export const DEFAULT_CUTOFF_HOUR = 6;

export const businessDayStart = (hora: number = DEFAULT_CUTOFF_HOUR): Date => {
  const d = new Date();
  if (d.getHours() < hora) d.setDate(d.getDate() - 1);
  d.setHours(hora, 0, 0, 0);
  return d;
};

export const businessDayEnd = (hora: number = DEFAULT_CUTOFF_HOUR): Date => {
  const d = businessDayStart(hora);
  d.setDate(d.getDate() + 1);
  return d;
};
