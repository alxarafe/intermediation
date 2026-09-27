import { z } from 'zod';

/** Fecha sin hora (yyyy-mm-dd). Toda la lógica de tarifas vive en esta escala. */
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Se espera una fecha en formato yyyy-mm-dd');

export const isoDateTime = z.string().datetime();

/** Porcentaje de comisión: 0..100 con hasta 2 decimales. */
export const pct = z.number().min(0).max(100);

/** Importe con hasta 4 decimales (precisión de precio unitario industrial). */
export const amount = z.number().min(0);

/** Cantidad con hasta 3 decimales (admite kg, metros, cajas). */
export const qty = z.number().positive();

/**
 * Rango de vigencia de una línea de tarifa.
 *
 * - validTo = null  → intervalo ABIERTO: vigente desde validFrom "hasta nueva tarifa".
 *   Se cierra automáticamente cuando entra otra línea con validFrom posterior.
 * - validTo = fecha  → intervalo CERRADO [validFrom, validTo).
 */
export const validityRange = z.object({
  validFrom: dateString,
  validTo: dateString.nullable().default(null),
});
export type ValidityRange = z.infer<typeof validityRange>;

export const PriceListStatus = z.enum(['draft', 'active', 'archived']);
export type PriceListStatus = z.infer<typeof PriceListStatus>;

export const SalesOrderStatus = z.enum([
  'draft',
  'confirmed',
  'placed',
  'completed',
  'cancelled',
]);
export type SalesOrderStatus = z.infer<typeof SalesOrderStatus>;

export const ServiceOrderStatus = z.enum([
  'draft',
  'sent',
  'acknowledged',
  'shipped',
  'delivered',
  'verified_ok',
  'discrepancy',
  'rejected',
  'invoiced',
]);
export type ServiceOrderStatus = z.infer<typeof ServiceOrderStatus>;

export const VerificationResult = z.enum(['ok', 'discrepancy', 'rejected']);
export type VerificationResult = z.infer<typeof VerificationResult>;

export const InvoiceStatus = z.enum(['draft', 'issued', 'paid', 'cancelled']);
export type InvoiceStatus = z.infer<typeof InvoiceStatus>;

export const Role = z.enum(['admin', 'user']);
export type Role = z.infer<typeof Role>;
