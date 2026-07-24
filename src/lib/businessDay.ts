// "Jornada" operativa: el día del negocio NO corta a medianoche sino a una hora
// configurable por sucursal (default 6:00). Así un bar abierto hasta las 3-4 AM
// ve toda la noche como un mismo día, y los pedidos / QR no se reinician a las 00.
export const HORA_CORTE_DEFAULT = 6;

// Inicio de la jornada actual (la última vez que fue la hora de corte).
export const inicioJornada = (hora: number = HORA_CORTE_DEFAULT): Date => {
  const d = new Date();
  if (d.getHours() < hora) d.setDate(d.getDate() - 1);
  d.setHours(hora, 0, 0, 0);
  return d;
};

// Fin de la jornada actual (la próxima hora de corte). Sirve para el vencimiento
// del token del QR: dura hasta que termina la jornada, no el día calendario.
export const finJornada = (hora: number = HORA_CORTE_DEFAULT): Date => {
  const d = inicioJornada(hora);
  d.setDate(d.getDate() + 1);
  return d;
};
