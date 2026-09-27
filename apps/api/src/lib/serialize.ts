import { Prisma } from '@prisma/client';
import type {
  ArticleDto,
  CommissionInvoiceDto,
  CustomerDto,
  FactoryArticleDto,
  FactoryDto,
  PriceHistoryRowDto,
  PriceListDto,
  PriceListLineDto,
  PriceListWithLinesDto,
  ReceiptVerificationDto,
  ResolvedPriceDto,
  SalesOrderDto,
  SalesOrderLineDto,
  ServiceOrderDto,
  ServiceOrderLineDto,
  UserDto,
} from '@intermediacion/shared';
import { toDateOnlyString } from './date';
import { D, toNum } from './decimal';

/* ------------------------------------------------------------------ Tipos */

export const factoryInclude = {} satisfies Prisma.FactoryInclude;

export type FactoryRow = Prisma.FactoryGetPayload<{ include: typeof factoryInclude }>;

export type FactoryArticleRow = Prisma.FactoryArticleGetPayload<{
  include: { factory: true; article: true };
}>;

export const priceListLineInclude = {
  priceList: true,
  factoryArticle: { include: { article: true } },
} satisfies Prisma.PriceListLineInclude;

export type PriceListLineRow = Prisma.PriceListLineGetPayload<{
  include: typeof priceListLineInclude;
}>;

export const priceListInclude = { lines: { include: priceListLineInclude } };
export type PriceListRow = Prisma.PriceListGetPayload<{ include: typeof priceListInclude }>;

/** Include completo (fábrica + líneas con artículo) para la vista de detalle. */
export const priceListFullInclude = {
  factory: true,
  lines: { include: priceListLineInclude },
} satisfies Prisma.PriceListInclude;
export type PriceListFullRow = Prisma.PriceListGetPayload<{
  include: typeof priceListFullInclude;
}>;

export const salesOrderLineInclude = { article: true };
export const salesOrderInclude = {
  customer: true,
  lines: { include: salesOrderLineInclude },
  _count: { select: { serviceOrders: true } },
};
export type SalesOrderRow = Prisma.SalesOrderGetPayload<{
  include: typeof salesOrderInclude;
}>;

export const serviceOrderLineInclude = { article: true };
export const serviceOrderInclude = {
  factory: true,
  salesOrder: { include: { customer: true } },
  lines: { include: serviceOrderLineInclude },
  verification: { include: { verifiedBy: true, batch: true } },
  invoices: { include: { invoice: { select: { id: true, number: true } } } },
};
export type ServiceOrderRow = Prisma.ServiceOrderGetPayload<{
  include: typeof serviceOrderInclude;
}>;

export const invoiceInclude = {
  factory: true,
  lines: true,
  serviceOrders: { include: { serviceOrder: true } },
};
export type InvoiceRow = Prisma.CommissionInvoiceGetPayload<{ include: typeof invoiceInclude }>;

/* ------------------------------------------------------------- Mapeadores */

export function toUserDto(u: {
  id: string;
  email: string;
  name: string;
  role: string;
}): UserDto {
  return { id: u.id, email: u.email, name: u.name, role: u.role === 'admin' ? 'admin' : 'user' };
}

export function toFactoryDto(f: FactoryRow): FactoryDto {
  return {
    id: f.id,
    name: f.name,
    taxId: f.taxId,
    email: f.email,
    phone: f.phone,
    addressLine: f.addressLine,
    city: f.city,
    postalCode: f.postalCode,
    province: f.province,
    defaultCommissionPct: toNum(f.defaultCommissionPct),
    paymentTermDays: f.paymentTermDays,
    active: f.active,
    createdAt: f.createdAt.toISOString(),
  };
}

/** Comisión efectiva de un vínculo: la específica del producto si la hay. */
export function effectiveCommissionPct(fa: FactoryArticleRow): number {
  return toNum(fa.commissionPctOverride ?? fa.factory.defaultCommissionPct);
}

export function toFactoryArticleDto(fa: FactoryArticleRow): FactoryArticleDto {
  return {
    id: fa.id,
    factoryId: fa.factoryId,
    factoryName: fa.factory.name,
    articleId: fa.articleId,
    articleSku: fa.article.sku,
    articleName: fa.article.name,
    factorySku: fa.factorySku,
    commissionPctOverride:
      fa.commissionPctOverride === null ? null : toNum(fa.commissionPctOverride),
    active: fa.active,
    effectiveCommissionPct: effectiveCommissionPct(fa),
  };
}

export function toArticleDto(
  a: {
    id: string;
    sku: string;
    name: string;
    description: string | null;
    unit: string;
    ean: string | null;
    active: boolean;
  },
  factoryCount?: number,
): ArticleDto {
  return {
    id: a.id,
    sku: a.sku,
    name: a.name,
    description: a.description,
    unit: a.unit,
    ean: a.ean,
    active: a.active,
    ...(factoryCount === undefined ? {} : { factoryCount }),
  };
}

export function toPriceListLineDto(l: PriceListLineRow): PriceListLineDto {
  return {
    id: l.id,
    priceListId: l.priceListId,
    factoryArticleId: l.factoryArticleId,
    articleId: l.factoryArticle.articleId,
    articleSku: l.factoryArticle.article.sku,
    articleName: l.factoryArticle.article.name,
    unit: l.factoryArticle.article.unit,
    unitPrice: toNum(l.unitPrice),
    currency: l.currency,
    validFrom: toDateOnlyString(l.validFrom),
    validTo: l.validTo === null ? null : toDateOnlyString(l.validTo),
    validityMode: l.validTo === null ? 'open' : 'closed',
  };
}

export function toPriceListDto(pl: {
  id: string;
  factoryId: string;
  factory?: { name: string } | null;
  code: string;
  name: string | null;
  status: string;
  effectiveFrom: Date;
  notes: string | null;
  createdAt: Date;
  activatedAt: Date | null;
  _count?: { lines: number };
  lines?: Array<unknown>;
}): PriceListDto {
  return {
    id: pl.id,
    factoryId: pl.factoryId,
    factoryName: pl.factory?.name ?? '',
    code: pl.code,
    name: pl.name,
    status: pl.status === 'active' || pl.status === 'archived' ? pl.status : 'draft',
    effectiveFrom: toDateOnlyString(pl.effectiveFrom),
    notes: pl.notes,
    lineCount: pl._count?.lines ?? pl.lines?.length ?? 0,
    createdAt: pl.createdAt.toISOString(),
    activatedAt: pl.activatedAt?.toISOString() ?? null,
  };
}

export function toPriceListWithLinesDto(pl: PriceListFullRow): PriceListWithLinesDto {
  return { ...toPriceListDto(pl), lines: pl.lines.map(toPriceListLineDto) };
}

export function toResolvedPriceDto(
  line: PriceListLineRow,
  factory: { id: string; name: string },
): ResolvedPriceDto {
  return {
    factoryId: factory.id,
    factoryName: factory.name,
    articleId: line.factoryArticle.articleId,
    articleSku: line.factoryArticle.article.sku,
    articleName: line.factoryArticle.article.name,
    unit: line.factoryArticle.article.unit,
    factoryArticleId: line.factoryArticleId,
    priceListId: line.priceListId,
    priceListCode: line.priceList.code,
    unitPrice: toNum(line.unitPrice),
    currency: line.currency,
    validFrom: toDateOnlyString(line.validFrom),
    validTo: line.validTo === null ? null : toDateOnlyString(line.validTo),
    validityMode: line.validTo === null ? 'open' : 'closed',
  };
}

export function toPriceHistoryRowDto(line: PriceListLineRow): PriceHistoryRowDto {
  return {
    unitPrice: toNum(line.unitPrice),
    validFrom: toDateOnlyString(line.validFrom),
    validTo: line.validTo === null ? null : toDateOnlyString(line.validTo),
    priceListCode: line.priceList.code,
    validityMode: line.validTo === null ? 'open' : 'closed',
  };
}

export function toCustomerDto(c: {
  id: string;
  name: string;
  taxId: string;
  email: string | null;
  phone: string | null;
  addressLine: string | null;
  city: string | null;
  postalCode: string | null;
  province: string | null;
  active: boolean;
  createdAt: Date;
}): CustomerDto {
  return {
    id: c.id,
    name: c.name,
    taxId: c.taxId,
    email: c.email,
    phone: c.phone,
    addressLine: c.addressLine,
    city: c.city,
    postalCode: c.postalCode,
    province: c.province,
    active: c.active,
    createdAt: c.createdAt.toISOString(),
  };
}

export function toSalesOrderLineDto(l: SalesOrderRow['lines'][number]): SalesOrderLineDto {
  return {
    id: l.id,
    articleId: l.articleId,
    articleSku: l.article.sku,
    articleName: l.article.name,
    unit: l.article.unit,
    qty: toNum(l.qty),
    unitPrice: toNum(l.unitPrice),
    lineTotal: toNum(l.lineTotal),
    factoryId: l.factoryId,
    factoryName: null, // lo rellena la vista con _count/include; ver toSalesOrderDto
    priceListCode: l.priceListCode,
    notes: l.notes,
  };
}

export function toSalesOrderDto(
  o: SalesOrderRow,
  factoryNames?: Map<string, string>,
): SalesOrderDto {
  return {
    id: o.id,
    reference: o.reference,
    customerId: o.customerId,
    customerName: o.customer.name,
    customerTaxId: o.customer.taxId,
    orderDate: toDateOnlyString(o.orderDate),
    status: o.status === 'confirmed' || o.status === 'placed' || o.status === 'completed' || o.status === 'cancelled' ? o.status : 'draft',
    notes: o.notes,
    lines: o.lines.map((l) => ({
      ...toSalesOrderLineDto(l),
      factoryName: l.factoryId ? (factoryNames?.get(l.factoryId) ?? null) : null,
    })),
    subtotal: toNum(o.lines.reduce((acc, l) => acc.add(D(l.lineTotal)), D(0))),
    lineCount: o.lines.length,
    serviceOrderCount: o._count?.serviceOrders ?? 0,
    createdAt: o.createdAt.toISOString(),
  };
}

export function toServiceOrderLineDto(l: ServiceOrderRow['lines'][number]): ServiceOrderLineDto {
  return {
    id: l.id,
    articleId: l.articleId,
    articleSku: l.article.sku,
    articleName: l.article.name,
    unit: l.article.unit,
    qty: toNum(l.qty),
    unitPrice: toNum(l.unitPrice),
    lineTotal: toNum(l.lineTotal),
    commissionPct: toNum(l.commissionPct),
    commissionAmount: toNum(l.commissionAmount),
    salesOrderLineId: l.salesOrderLineId,
  };
}

export function toReceiptVerificationDto(
  v: ServiceOrderRow['verification'],
): ReceiptVerificationDto | null {
  if (!v) return null;
  return {
    id: v.id,
    serviceOrderId: v.serviceOrderId,
    receivedAt: toDateOnlyString(v.receivedAt),
    verifiedAt: v.verifiedAt.toISOString(),
    result: v.result === 'ok' || v.result === 'rejected' ? v.result : 'discrepancy',
    notes: v.notes,
    verifiedByName: v.verifiedBy?.name ?? null,
    batchId: v.batchId,
    batchReference: v.batch?.reference ?? null,
  };
}

const SERVICE_ORDER_STATUSES = [
  'draft',
  'sent',
  'acknowledged',
  'shipped',
  'delivered',
  'verified_ok',
  'discrepancy',
  'rejected',
  'invoiced',
] as const;

function narrowStatus(s: string): (typeof SERVICE_ORDER_STATUSES)[number] {
  return (SERVICE_ORDER_STATUSES as readonly string[]).includes(s)
    ? (s as (typeof SERVICE_ORDER_STATUSES)[number])
    : 'draft';
}

export function toServiceOrderDto(so: ServiceOrderRow): ServiceOrderDto {
  const invoice = so.invoices[0]?.invoice;
  return {
    id: so.id,
    number: so.number,
    factoryId: so.factoryId,
    factoryName: so.factory.name,
    salesOrderId: so.salesOrderId,
    salesOrderReference: so.salesOrder.reference,
    customerId: so.salesOrder.customerId,
    customerName: so.salesOrder.customer.name,
    status: narrowStatus(so.status),
    commissionTotal: toNum(so.lines.reduce((acc, l) => acc.add(D(l.commissionAmount)), D(0))),
    invoiceId: invoice?.id ?? null,
    invoiceNumber: invoice?.number ?? null,
    sentAt: so.sentAt?.toISOString() ?? null,
    shippedAt: so.shippedAt?.toISOString() ?? null,
    deliveredAt: so.deliveredAt?.toISOString() ?? null,
    notes: so.notes,
    lines: so.lines.map(toServiceOrderLineDto),
    verification: toReceiptVerificationDto(so.verification),
    createdAt: so.createdAt.toISOString(),
  };
}

export function toCommissionInvoiceDto(inv: InvoiceRow): CommissionInvoiceDto {
  const taxPct = toNum(inv.taxPct);
  return {
    id: inv.id,
    number: inv.number,
    factoryId: inv.factoryId,
    factoryName: inv.factory.name,
    factoryTaxId: inv.factory.taxId,
    issueDate: toDateOnlyString(inv.issueDate),
    dueDate: inv.dueDate === null ? null : toDateOnlyString(inv.dueDate),
    status: inv.status === 'issued' || inv.status === 'paid' || inv.status === 'cancelled' ? inv.status : 'draft',
    taxPct,
    subtotal: toNum(inv.subtotal),
    taxTotal: toNum(inv.taxTotal),
    total: toNum(inv.total),
    notes: inv.notes,
    lines: [...inv.lines]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((l) => ({
        id: l.id,
        description: l.description,
        base: toNum(l.base),
        commissionPct: toNum(l.commissionPct),
        amount: toNum(l.amount),
        sortOrder: l.sortOrder,
      })),
    serviceOrders: inv.serviceOrders.map((s) => ({
      serviceOrderId: s.serviceOrderId,
      serviceOrderNumber: s.serviceOrder.number,
      commissionAmount: toNum(s.commissionAmount),
    })),
    createdAt: inv.createdAt.toISOString(),
  };
}
