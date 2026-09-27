import type { Prisma, PrismaClient } from '@prisma/client';
import type { CreateCommissionInvoiceInput } from '@intermediacion/shared';
import { env } from '../../env';
import { parseDateOnly, todayString } from '../../lib/date';
import { D, money, money2, sum } from '../../lib/decimal';
import { badRequest, conflict, invalidTransition, notFound } from '../../lib/errors';
import { nextDocumentNumber } from '../../lib/sequences';
import { maybeCompleteSalesOrder } from '../sales-orders/service';

type Db = PrismaClient | Prisma.TransactionClient;

export interface InvoiceBuildResult {
  number: string;
  subtotal: Prisma.Decimal;
  taxPct: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  total: Prisma.Decimal;
  lines: Array<{
    description: string;
    base: Prisma.Decimal;
    commissionPct: Prisma.Decimal;
    amount: Prisma.Decimal;
    sortOrder: number;
  }>;
  serviceOrders: Array<{ serviceOrderId: string; commissionAmount: Prisma.Decimal }>;
}

/**
 * Agrupa N órdenes de servicio verificadas en UNA factura de comisión a la
 * fábrica. Es la contraparte de la verificación agrupada.
 *
 * Reglas que se validan aquí (y el `@unique` de la tabla puente refuerza en
 * la base de datos):
 *   - todas las órdenes son de la misma fábrica;
 *   - todas están verificadas como correctas (`verified_ok`);
 *   - ninguna estaba facturada antes.
 */
export async function buildInvoice(
  db: Db,
  input: CreateCommissionInvoiceInput,
): Promise<InvoiceBuildResult> {
  const factory = await db.factory.findUnique({ where: { id: input.factoryId } });
  if (!factory) throw notFound('Fábrica');

  const ids = [...new Set(input.serviceOrderIds)];
  const serviceOrders = await db.serviceOrder.findMany({
    where: { id: { in: ids } },
    include: {
      lines: true,
      salesOrder: { include: { customer: true } },
      invoices: { select: { invoiceId: true } },
    },
  });

  const encontradas = new Set(serviceOrders.map((s) => s.id));
  const faltantes = ids.filter((id) => !encontradas.has(id));
  if (faltantes.length > 0) {
    throw notFound(`Órdenes de servicio (${faltantes.length})`);
  }

  const deOtra = serviceOrders.filter((s) => s.factoryId !== input.factoryId);
  if (deOtra.length > 0) {
    throw badRequest(
      'Todas las órdenes deben ser de la misma fábrica. ' +
        `No pertenecen a ${factory.name}: ${deOtra.map((s) => s.number).join(', ')}`,
    );
  }

  // Primero lo ya facturado: es el error más específico y el que de verdad
  // explica el fallo. Si se comprobara antes "está verificada", una orden ya
  // facturada (que pasa a estado `invoiced`) daría un 400 confuso.
  const yaFacturadas = serviceOrders.filter((s) => s.invoices.length > 0);
  if (yaFacturadas.length > 0) {
    throw conflict(
      'Estas órdenes ya están facturadas: ' + yaFacturadas.map((s) => s.number).join(', '),
    );
  }

  const noVerificadas = serviceOrders.filter((s) => s.status !== 'verified_ok');
  if (noVerificadas.length > 0) {
    throw badRequest(
      'Sólo se pueden facturar órdenes con la recepción verificada como correcta. ' +
        `No verificadas: ${noVerificadas.map((s) => `${s.number} (${s.status})`).join(', ')}`,
    );
  }

  const issueDate = parseDateOnly(input.issueDate ?? todayString());
  const taxPct = D(input.taxPct ?? env.defaultTaxPct);

  const lines = serviceOrders
    .sort((a, b) => a.number.localeCompare(b.number))
    .map((so, i) => {
      const base = sum(so.lines.map((l) => l.lineTotal));
      const amount = sum(so.lines.map((l) => l.commissionAmount));
      // Una orden puede mezclar comisiones distintas (productos con override).
      // El importe es el exacto; este porcentaje es el medio ponderado, sólo
      // informativo para leer la factura.
      const weightedPct =
        base.isZero() ? D(0) : money2(amount.mul(100).div(base));
      return {
        description:
          `Orden de servicio ${so.number} · cliente ${so.salesOrder.customer.name} ` +
          `· pedido ${so.salesOrder.reference}`,
        base: money(base),
        commissionPct: weightedPct,
        amount: money(amount),
        sortOrder: i,
      };
    });

  const serviceOrderAmounts = new Map<string, Prisma.Decimal>();
  for (const so of serviceOrders) {
    serviceOrderAmounts.set(so.id, money(sum(so.lines.map((l) => l.commissionAmount))));
  }

  const subtotal = money(sum(lines.map((l) => l.amount)));
  const taxTotal = money(subtotal.mul(taxPct).div(100));
  const total = money(subtotal.add(taxTotal));

  return {
    number: await nextDocumentNumber(db, 'INVOICE', issueDate),
    subtotal,
    taxPct,
    taxTotal,
    total,
    lines,
    serviceOrders: [...serviceOrderAmounts.entries()].map(([serviceOrderId, commissionAmount]) => ({
      serviceOrderId,
      commissionAmount,
    })),
  };
}

export async function createCommissionInvoice(
  db: PrismaClient,
  input: CreateCommissionInvoiceInput,
) {
  return db.$transaction(
    async (tx) => {
      const build = await buildInvoice(tx, input);

      const issueDate = parseDateOnly(input.issueDate ?? todayString());
      const factory = await tx.factory.findUniqueOrThrow({ where: { id: input.factoryId } });
      const dueDate =
        input.dueDate !== undefined
          ? input.dueDate === null
            ? null
            : parseDateOnly(input.dueDate)
          : new Date(issueDate.getTime() + factory.paymentTermDays * 86_400_000);

      const invoice = await tx.commissionInvoice.create({
        data: {
          number: build.number,
          factoryId: input.factoryId,
          issueDate,
          dueDate,
          status: 'draft',
          taxPct: build.taxPct,
          subtotal: build.subtotal,
          taxTotal: build.taxTotal,
          total: build.total,
          notes: input.notes ?? null,
          lines: { create: build.lines },
          serviceOrders: { create: build.serviceOrders },
        },
      });

      // Las órdenes facturadas quedan en estado `invoiced`.
      await tx.serviceOrder.updateMany({
        where: { id: { in: build.serviceOrders.map((s) => s.serviceOrderId) } },
        data: { status: 'invoiced' },
      });

      for (const s of build.serviceOrders) {
        const so = await tx.serviceOrder.findUnique({
          where: { id: s.serviceOrderId },
          select: { salesOrderId: true },
        });
        if (so) await maybeCompleteSalesOrder(tx, so.salesOrderId);
      }

      return invoice;
    },
    { timeout: 20000 },
  );
}

const INVOICE_ALLOWED: Record<string, string[]> = {
  draft: ['issued', 'cancelled'],
  issued: ['paid', 'cancelled'],
  paid: [],
  cancelled: [],
};

export async function transitionInvoice(db: PrismaClient, invoiceId: string, to: string) {
  const invoice = await db.commissionInvoice.findUnique({
    where: { id: invoiceId },
    include: { serviceOrders: true },
  });
  if (!invoice) throw notFound('Factura');

  const allowed = INVOICE_ALLOWED[invoice.status] ?? [];
  if (!allowed.includes(to)) throw invalidTransition(invoice.status, to);

  if (to === 'cancelled') {
    // Al cancelar se liberan las órdenes: vuelven a estar facturables.
    return db.$transaction(async (tx) => {
      await tx.commissionInvoiceServiceOrder.deleteMany({ where: { invoiceId } });
      await tx.commissionInvoice.update({ where: { id: invoiceId }, data: { status: 'cancelled' } });
      await tx.serviceOrder.updateMany({
        where: { id: { in: invoice.serviceOrders.map((s) => s.serviceOrderId) } },
        data: { status: 'verified_ok' },
      });
      for (const s of invoice.serviceOrders) {
        const so = await tx.serviceOrder.findUnique({
          where: { id: s.serviceOrderId },
          select: { salesOrderId: true },
        });
        if (so) {
          await tx.salesOrder.updateMany({
            where: { id: so.salesOrderId, status: 'completed' },
            data: { status: 'placed' },
          });
        }
      }
      return { id: invoiceId, status: 'cancelled' as const };
    });
  }

  return db.commissionInvoice.update({ where: { id: invoiceId }, data: { status: to } });
}
