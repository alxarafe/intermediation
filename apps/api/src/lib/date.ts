/**
 * Toda la lógica de vigencia de tarifas vive a escala de DÍA, no de instante.
 * Convertimos a (y medianoche UTC) en los dos sentidos para que Postgres no
 * nos desplace la fecha un día por zona horaria.
 */
export function parseDateOnly(value: string | Date): Date {
  if (value instanceof Date) return startOfDayUtc(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) throw new Error(`Fecha inválida: ${value} (se espera yyyy-mm-dd)`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** 'yyyy-mm-dd' a partir de un Date. */
export function toDateOnlyString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayString(): string {
  return toDateOnlyString(new Date());
}

export function yearOf(d: Date): number {
  return d.getUTCFullYear();
}

/** ¿Se solapan [aFrom,aTo) y [bFrom,bTo)? Ambas con final abierto = null. */
export function rangesOverlap(
  aFrom: Date,
  aTo: Date | null,
  bFrom: Date,
  bTo: Date | null,
): boolean {
  const aEnd = aTo ?? new Date(8_640_000_000_000_000);
  const bEnd = bTo ?? new Date(8_640_000_000_000_000);
  return aFrom < bEnd && bFrom < aEnd;
}
