import { Prisma } from '@prisma/client';

/** Construye un Decimal de Prisma desde número, string o Decimal. */
export function D(value: Prisma.Decimal | number | string): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  return new Prisma.Decimal(value);
}

/**
 * Decimal → number para la respuesta JSON.
 *
 * El importe SIEMPRE se guarda y se calcula en Decimal (numeric en Postgres).
 * Sólo la serialización baja a float, y eso afecta a la presentación, no al
 * almacenamiento: reread de la DB devuelve el Decimal original.
 */
export function toNum(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return D(value).toNumber();
}

/**
 * Redondeo a 4 decimales con ROUND_HALF_UP.
 *
 * Es la política del sistema: todo importe se guarda y se redondea a 4 dp, de
 * modo que la suma de las líneas redondeadas coincide con el total redondeado
 * (no hay deriva entre desglose y total). Para una factura de servicios esto
 * es más precisión que la que se factura (2 dp), así que el desglose siempre
 * cuadra con el importe emitido.
 */
export function money(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return D(value).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}

/** Redondeo monetario a 2 decimales (importes de factura). */
export function money2(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return D(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function pctOf(base: Prisma.Decimal | number, pct: Prisma.Decimal | number): Prisma.Decimal {
  return money(D(base).mul(D(pct)).div(100));
}

export function sum(values: Array<Prisma.Decimal | number>): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((acc, v) => acc.add(D(v)), D(0));
}
