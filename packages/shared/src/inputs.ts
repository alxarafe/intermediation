import { z } from 'zod';
import { amount, dateString, pct, qty, VerificationResult } from './primitives';

/* -------------------------------------------------------------------- Auth */

export const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const CreateUserInput = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(['admin', 'user']).default('user'),
});
export type CreateUserInput = z.infer<typeof CreateUserInput>;

/* ---------------------------------------------------------------- Factories */

export const CreateFactoryInput = z.object({
  name: z.string().min(1),
  taxId: z.string().min(1),
  email: z.string().email().nullish(),
  phone: z.string().nullish(),
  addressLine: z.string().nullish(),
  city: z.string().nullish(),
  postalCode: z.string().nullish(),
  province: z.string().nullish(),
  defaultCommissionPct: pct,
  paymentTermDays: z.number().int().min(0).max(365).default(30),
  active: z.boolean().default(true),
});
export type CreateFactoryInput = z.infer<typeof CreateFactoryInput>;

export const UpdateFactoryInput = CreateFactoryInput.partial();
export type UpdateFactoryInput = z.infer<typeof UpdateFactoryInput>;

/* ----------------------------------------------------------------- Articles */

export const CreateArticleInput = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullish(),
  unit: z.string().min(1).default('ud'),
  ean: z.string().nullish(),
  active: z.boolean().default(true),
});
export type CreateArticleInput = z.infer<typeof CreateArticleInput>;

export const UpdateArticleInput = CreateArticleInput.partial();
export type UpdateArticleInput = z.infer<typeof UpdateArticleInput>;

/** Alta/edición del vínculo fábrica↔artículo y su comisión específica. */
export const UpsertFactoryArticleInput = z.object({
  factorySku: z.string().nullish(),
  commissionPctOverride: pct.nullable().default(null),
  active: z.boolean().default(true),
});
export type UpsertFactoryArticleInput = z.infer<typeof UpsertFactoryArticleInput>;

/* --------------------------------------------------------------- PriceLists */

export const CreatePriceListLineInput = z.object({
  articleId: z.string().min(1),
  unitPrice: amount,
  /**
   * Si se omite, la línea nace el día de vigencia de la tarifa.
   * Si validTo se omite, la línea queda ABIERTA: vigente hasta que entre otra.
   */
  validFrom: dateString.optional(),
  validTo: dateString.nullable().optional(),
});
export type CreatePriceListLineInput = z.infer<typeof CreatePriceListLineInput>;

export const CreatePriceListInput = z.object({
  factoryId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().nullish(),
  effectiveFrom: dateString,
  notes: z.string().nullish(),
  lines: z.array(CreatePriceListLineInput).min(1),
});
export type CreatePriceListInput = z.infer<typeof CreatePriceListInput>;

export const UpdatePriceListLineInput = z.object({
  id: z.string().min(1),
  unitPrice: amount.optional(),
  validFrom: dateString.optional(),
  validTo: dateString.nullable().optional(),
});
export type UpdatePriceListLineInput = z.infer<typeof UpdatePriceListLineInput>;

export const UpdatePriceListInput = z.object({
  name: z.string().nullish(),
  notes: z.string().nullish(),
  addLines: z.array(CreatePriceListLineInput).optional(),
  updateLines: z.array(UpdatePriceListLineInput).optional(),
  removeLineIds: z.array(z.string()).optional(),
});
export type UpdatePriceListInput = z.infer<typeof UpdatePriceListInput>;

/** Activar = publicar la tarifa y cerrar las líneas abiertas anteriores. */
export const ActivatePriceListInput = z.object({});
export type ActivatePriceListInput = z.infer<typeof ActivatePriceListInput>;

/* ------------------------------------------------------------ Price queries */

export const PriceResolveQuery = z.object({
  factoryId: z.string().min(1),
  articleId: z.string().min(1),
  at: dateString.optional(),
});
export type PriceResolveQuery = z.infer<typeof PriceResolveQuery>;

export const PriceHistoryQuery = z.object({
  factoryId: z.string().min(1),
  articleId: z.string().min(1),
});
export type PriceHistoryQuery = z.infer<typeof PriceHistoryQuery>;

/** Comparativa deFactories que suministran un artículo en una fecha dada. */
export const ArticleOffersQuery = z.object({
  articleId: z.string().min(1),
  at: dateString.optional(),
});
export type ArticleOffersQuery = z.infer<typeof ArticleOffersQuery>;

/* ---------------------------------------------------------------- Customers */

export const CreateCustomerInput = z.object({
  name: z.string().min(1),
  taxId: z.string().min(1),
  email: z.string().email().nullish(),
  phone: z.string().nullish(),
  addressLine: z.string().nullish(),
  city: z.string().nullish(),
  postalCode: z.string().nullish(),
  province: z.string().nullish(),
  active: z.boolean().default(true),
});
export type CreateCustomerInput = z.infer<typeof CreateCustomerInput>;

export const UpdateCustomerInput = CreateCustomerInput.partial();
export type UpdateCustomerInput = z.infer<typeof UpdateCustomerInput>;

/* -------------------------------------------------------------- SalesOrders */

export const CreateSalesOrderLineInput = z.object({
  articleId: z.string().min(1),
  qty,
  notes: z.string().nullish(),
});
export type CreateSalesOrderLineInput = z.infer<typeof CreateSalesOrderLineInput>;

/**
 * El cliente NO envía precios. El servidor los resuelve contra la tarifa vigente
 * en `orderDate` y congela el resultado en la línea. Es lo que garantiza que
 * cambiar una tarifa después no altere un pedido ya cerrado.
 */
export const CreateSalesOrderInput = z.object({
  customerId: z.string().min(1),
  orderDate: dateString.optional(),
  reference: z.string().min(1).optional(),
  notes: z.string().nullish(),
  lines: z.array(CreateSalesOrderLineInput).min(1),
});
export type CreateSalesOrderInput = z.infer<typeof CreateSalesOrderInput>;

export const AddSalesOrderLinesInput = z.object({
  lines: z.array(CreateSalesOrderLineInput).min(1),
});
export type AddSalesOrderLinesInput = z.infer<typeof AddSalesOrderLinesInput>;

export const UpdateSalesOrderInput = z.object({
  orderDate: dateString.optional(),
  notes: z.string().nullish(),
});
export type UpdateSalesOrderInput = z.infer<typeof UpdateSalesOrderInput>;

/* ------------------------------------------------------------ ServiceOrders */

/** Cantidad realmente recibida en la línea, para detectar incidencias. */
export const VerificationLineInput = z.object({
  lineId: z.string().min(1),
  qtyReceived: qty,
});
export type VerificationLineInput = z.infer<typeof VerificationLineInput>;

export const VerifyServiceOrderInput = z.object({
  receivedAt: dateString,
  result: VerificationResult,
  notes: z.string().nullish(),
  lines: z.array(VerificationLineInput).optional(),
});
export type VerifyServiceOrderInput = z.infer<typeof VerifyServiceOrderInput>;

/** Verificación AGRUPADA: N órdenes en una sola operación atómica. */
export const BatchVerifyInput = VerifyServiceOrderInput.extend({
  serviceOrderIds: z.array(z.string().min(1)).min(1),
});
export type BatchVerifyInput = z.infer<typeof BatchVerifyInput>;

export const ServiceOrderFilter = z.object({
  status: z
    .string()
    .optional()
    .transform((v) => (v ? (v.split(',') as string[]) : undefined)),
  factoryId: z.string().optional(),
  salesOrderId: z.string().optional(),
  /** Sólo órdenes verificadas OK y aún no facturadas: candidatas a facturar. */
  billable: z.coerce.boolean().optional(),
});
export type ServiceOrderFilter = z.infer<typeof ServiceOrderFilter>;

/* ------------------------------------------------------- CommissionInvoices */

/**
 * Una factura que agrupa N órdenes de servicio de la misma fábrica.
 * El servidor valida que estén verificadas y no facturadas previamente.
 */
export const CreateCommissionInvoiceInput = z.object({
  factoryId: z.string().min(1),
  serviceOrderIds: z.array(z.string().min(1)).min(1),
  issueDate: dateString.optional(),
  dueDate: dateString.nullable().optional(),
  taxPct: pct.optional(),
  notes: z.string().nullish(),
});
export type CreateCommissionInvoiceInput = z.infer<typeof CreateCommissionInvoiceInput>;

export const UpdateCommissionInvoiceInput = z.object({
  issueDate: dateString.optional(),
  dueDate: dateString.nullable().optional(),
  taxPct: pct.optional(),
  notes: z.string().nullish(),
});
export type UpdateCommissionInvoiceInput = z.infer<typeof UpdateCommissionInvoiceInput>;
