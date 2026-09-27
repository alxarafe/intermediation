import { z } from 'zod';
import {
  amount,
  dateString,
  isoDateTime,
  pct,
  qty,
  PriceListStatus,
  Role,
  SalesOrderStatus,
  ServiceOrderStatus,
  VerificationResult,
  InvoiceStatus,
} from './primitives';

/* ------------------------------------------------------------------ Users */

export const UserDto = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: Role,
});
export type UserDto = z.infer<typeof UserDto>;

export const AuthResponseDto = z.object({
  token: z.string(),
  user: UserDto,
});
export type AuthResponseDto = z.infer<typeof AuthResponseDto>;

/* -------------------------------------------------------------- Factories */

export const FactoryDto = z.object({
  id: z.string(),
  name: z.string(),
  taxId: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  addressLine: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  province: z.string().nullable(),
  /** Comisión general acordada con la fábrica. */
  defaultCommissionPct: pct,
  paymentTermDays: z.number().int(),
  active: z.boolean(),
  createdAt: isoDateTime,
});
export type FactoryDto = z.infer<typeof FactoryDto>;

export const FactorySummaryDto = FactoryDto.extend({
  articleCount: z.number().int().optional(),
});
export type FactorySummaryDto = z.infer<typeof FactorySummaryDto>;

/* --------------------------------------------------------------- Articles */

export const ArticleDto = z.object({
  id: z.string(),
  sku: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  unit: z.string(),
  ean: z.string().nullable(),
  active: z.boolean(),
  /** Número de fábricas que lo suministran. */
  factoryCount: z.number().int().optional(),
});
export type ArticleDto = z.infer<typeof ArticleDto>;

/** Vínculo fábrica↔artículo: el SKU de la fábrica y su comisión específica. */
export const FactoryArticleDto = z.object({
  id: z.string(),
  factoryId: z.string(),
  factoryName: z.string(),
  articleId: z.string(),
  articleSku: z.string(),
  articleName: z.string(),
  factorySku: z.string().nullable(),
  /** Comisión pactada para este producto en concreto. null → usa la general. */
  commissionPctOverride: pct.nullable(),
  active: z.boolean(),
  /** Comisión efectiva ya resuelta (override ?? general de la fábrica). */
  effectiveCommissionPct: pct,
});
export type FactoryArticleDto = z.infer<typeof FactoryArticleDto>;

/* ------------------------------------------------------------- PriceLists */

export const PriceListLineDto = z.object({
  id: z.string(),
  priceListId: z.string(),
  factoryArticleId: z.string(),
  articleId: z.string(),
  articleSku: z.string(),
  articleName: z.string(),
  unit: z.string(),
  unitPrice: amount,
  currency: z.string(),
  validFrom: dateString,
  validTo: dateString.nullable(),
  /**
   * "open" = vigente hasta que entre otra tarifa (validTo = null).
   * "closed" = tiene fecha de fin explícita, o se la cerró una tarifa posterior.
   */
  validityMode: z.enum(['closed', 'open']),
});
export type PriceListLineDto = z.infer<typeof PriceListLineDto>;

export const PriceListDto = z.object({
  id: z.string(),
  factoryId: z.string(),
  factoryName: z.string(),
  code: z.string(),
  name: z.string().nullable(),
  status: PriceListStatus,
  effectiveFrom: dateString,
  notes: z.string().nullable(),
  lineCount: z.number().int(),
  createdAt: isoDateTime,
  activatedAt: isoDateTime.nullable(),
});
export type PriceListDto = z.infer<typeof PriceListDto>;

export const PriceListWithLinesDto = PriceListDto.extend({
  lines: z.array(PriceListLineDto),
});
export type PriceListWithLinesDto = z.infer<typeof PriceListWithLinesDto>;

/**
 * Resultado de resolver (fábrica, artículo, fecha) → tarifa vigente.
 * Es la pieza que respeta las dos modalidades de vigencia.
 */
export const ResolvedPriceDto = z.object({
  factoryId: z.string(),
  factoryName: z.string(),
  articleId: z.string(),
  articleSku: z.string(),
  articleName: z.string(),
  unit: z.string(),
  factoryArticleId: z.string(),
  priceListId: z.string(),
  priceListCode: z.string(),
  unitPrice: amount,
  currency: z.string(),
  validFrom: dateString,
  validTo: dateString.nullable(),
  /** "closed" = fecha a fecha. "open" = hasta nueva tarifa. */
  validityMode: z.enum(['closed', 'open']),
});
export type ResolvedPriceDto = z.infer<typeof ResolvedPriceDto>;

/** Un precio que además dice si no hay nada vigente en esa fecha. */
export const PriceLookupDto = z.object({
  at: dateString,
  found: z.boolean(),
  price: ResolvedPriceDto.nullable(),
});
export type PriceLookupDto = z.infer<typeof PriceLookupDto>;

/** Histórico completo de precios de un artículo en una fábrica. */
export const PriceHistoryRowDto = z.object({
  unitPrice: amount,
  validFrom: dateString,
  validTo: dateString.nullable(),
  priceListCode: z.string(),
  validityMode: z.enum(['closed', 'open']),
});
export type PriceHistoryRowDto = z.infer<typeof PriceHistoryRowDto>;

/* -------------------------------------------------------------- Customers */

export const CustomerDto = z.object({
  id: z.string(),
  name: z.string(),
  taxId: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  addressLine: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  province: z.string().nullable(),
  active: z.boolean(),
  createdAt: isoDateTime,
});
export type CustomerDto = z.infer<typeof CustomerDto>;

/* ------------------------------------------------------------ SalesOrders */

export const SalesOrderLineDto = z.object({
  id: z.string(),
  articleId: z.string(),
  articleSku: z.string(),
  articleName: z.string(),
  unit: z.string(),
  qty,
  /** PRECIO CONGELADO en el momento del pedido, resuelto por el servidor. */
  unitPrice: amount,
  lineTotal: amount,
  /** Fábrica a la que se asignó la línea (la más barata en esa fecha). */
  factoryId: z.string().nullable(),
  factoryName: z.string().nullable(),
  priceListCode: z.string().nullable(),
  notes: z.string().nullable(),
});
export type SalesOrderLineDto = z.infer<typeof SalesOrderLineDto>;

export const SalesOrderDto = z.object({
  id: z.string(),
  reference: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  customerTaxId: z.string(),
  orderDate: dateString,
  status: SalesOrderStatus,
  notes: z.string().nullable(),
  lines: z.array(SalesOrderLineDto),
  subtotal: amount,
  lineCount: z.number().int(),
  serviceOrderCount: z.number().int(),
  createdAt: isoDateTime,
});
export type SalesOrderDto = z.infer<typeof SalesOrderDto>;

/* ---------------------------------------------------------- ServiceOrders */

export const ServiceOrderLineDto = z.object({
  id: z.string(),
  articleId: z.string(),
  articleSku: z.string(),
  articleName: z.string(),
  unit: z.string(),
  qty,
  unitPrice: amount,
  lineTotal: amount,
  /** Comisión congelada al crear la orden (override ?? general). */
  commissionPct: pct,
  commissionAmount: amount,
  salesOrderLineId: z.string().nullable(),
});
export type ServiceOrderLineDto = z.infer<typeof ServiceOrderLineDto>;

export const ReceiptVerificationDto = z.object({
  id: z.string(),
  serviceOrderId: z.string(),
  receivedAt: dateString,
  verifiedAt: isoDateTime,
  result: VerificationResult,
  notes: z.string().nullable(),
  verifiedByName: z.string().nullable(),
  batchId: z.string().nullable(),
  batchReference: z.string().nullable(),
});
export type ReceiptVerificationDto = z.infer<typeof ReceiptVerificationDto>;

export const ServiceOrderDto = z.object({
  id: z.string(),
  number: z.string(),
  factoryId: z.string(),
  factoryName: z.string(),
  salesOrderId: z.string(),
  salesOrderReference: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  status: ServiceOrderStatus,
  /** Comisión total de la orden (suma de sus líneas). */
  commissionTotal: amount,
  invoiceId: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  sentAt: isoDateTime.nullable(),
  shippedAt: isoDateTime.nullable(),
  deliveredAt: isoDateTime.nullable(),
  notes: z.string().nullable(),
  lines: z.array(ServiceOrderLineDto),
  verification: ReceiptVerificationDto.nullable(),
  createdAt: isoDateTime,
});
export type ServiceOrderDto = z.infer<typeof ServiceOrderDto>;

/* ---------------------------------------------------- VerificationBatch */

/** Agrupa verificaciones hechas en una misma operación (regla de agrupación). */
export const VerificationBatchDto = z.object({
  id: z.string(),
  reference: z.string(),
  verifiedAt: isoDateTime,
  notes: z.string().nullable(),
  verifiedByName: z.string().nullable(),
  orderCount: z.number().int(),
  okCount: z.number().int(),
  discrepancyCount: z.number().int(),
  rejectedCount: z.number().int(),
  commissionTotal: amount,
});
export type VerificationBatchDto = z.infer<typeof VerificationBatchDto>;

/* --------------------------------------------------- CommissionInvoices */

export const CommissionInvoiceLineDto = z.object({
  id: z.string(),
  description: z.string(),
  base: amount,
  commissionPct: pct,
  amount: amount,
  sortOrder: z.number().int(),
});
export type CommissionInvoiceLineDto = z.infer<typeof CommissionInvoiceLineDto>;

export const InvoiceServiceOrderRefDto = z.object({
  serviceOrderId: z.string(),
  serviceOrderNumber: z.string(),
  commissionAmount: amount,
});
export type InvoiceServiceOrderRefDto = z.infer<typeof InvoiceServiceOrderRefDto>;

export const CommissionInvoiceDto = z.object({
  id: z.string(),
  number: z.string(),
  factoryId: z.string(),
  factoryName: z.string(),
  factoryTaxId: z.string(),
  issueDate: dateString,
  dueDate: dateString.nullable(),
  status: InvoiceStatus,
  /**
   * IVA de la factura. Configurable por factura porque el negocio opera desde
   * Canarias hacia Península: esas operaciones son exportación y van a 0%.
   */
  taxPct: pct,
  subtotal: amount,
  taxTotal: amount,
  total: amount,
  notes: z.string().nullable(),
  lines: z.array(CommissionInvoiceLineDto),
  serviceOrders: z.array(InvoiceServiceOrderRefDto),
  createdAt: isoDateTime,
});
export type CommissionInvoiceDto = z.infer<typeof CommissionInvoiceDto>;

/* ------------------------------------------------------------- Dashboard */

export const DashboardStatsDto = z.object({
  openSalesOrders: z.number().int(),
  serviceOrdersByStatus: z.record(z.number().int()),
  /** Comisión devengada (órdenes enviadas) menos la ya facturada. */
  commissionAccrued: amount,
  commissionInvoiced: amount,
  commissionOutstanding: amount,
  activeFactories: z.number().int(),
  activeArticles: z.number().int(),
  /** Órdenes verificadas y aún sin facturar: candidatas al siguiente lote. */
  billableServiceOrders: z.number().int(),
});
export type DashboardStatsDto = z.infer<typeof DashboardStatsDto>;

/* ------------------------------------------------------------- Utilidades */

export const IdParam = z.object({ id: z.string().min(1) });
export const IdListParam = z.object({ id: z.string().min(1) });

export const PaginationQuery = z.object({
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

export const PageDto = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), total: z.number().int() });
