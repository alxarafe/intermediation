import type { Prisma, PrismaClient } from '@prisma/client';
import type { CreateSalesOrderInput } from '@intermediacion/shared';
import { parseDateOnly, todayString } from '../../lib/date';
import { D, money } from '../../lib/decimal';
import { badRequest, invalidTransition, notFound } from '../../lib/errors';
import { nextDocumentNumber } from '../../lib/sequences';
import { findBestOffer } from '../pricing/service';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Alta de pedido del cliente final.
 *
 * El cliente NO manda precios. Para cada línea:
 *   1. se busca la fábrica más barata con precio vigente en `orderDate`;
 *   2. se congela ese precio en la línea.
 *
 * De ahí sale la garantía de que cambiar una tarifa después no altera un
 * pedido ya creado: el precio es un dato copiado, no una referencia viva.
 */
export async function createSalesOrder(db: Db, input: CreateSalesOrderInput) {
  const orderDate = parseDateOnly(input.orderDate ?? todayString());

  const customer = await db.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw notFound('Cliente');
  if (!customer.active) throw badRequest(`El cliente ${customer.name} está dado de baja`);

  // Se resuelven todas las líneas ANTES de escribir nada: si un artículo no
  // tiene precio en esa fecha, no creamos un pedido a medio construir.
  const resolved = [];
  const sinPrecio: string[] = [];
  for (const line of input.lines) {
    const offer = await findBestOffer(db, line.articleId, orderDate);
    if (!offer) {
      const article = await db.article.findUnique({
        where: { id: line.articleId },
        select: { name: true },
      });
      sinPrecio.push(article?.name ?? line.articleId);
      continue;
    }
    const unitPrice = money(offer.unitPrice);
    resolved.push({
      articleId: line.articleId,
      qty: D(line.qty),
      unitPrice,
      lineTotal: money(D(line.qty).mul(unitPrice)),
      factoryId: offer.factoryArticle.factory.id,
      priceListCode: offer.priceList.code,
      notes: line.notes ?? null,
    });
  }

  if (sinPrecio.length > 0) {
    throw badRequest(
      `No hay ninguna fábrica con precio vigente en ${input.orderDate ?? todayString()} para: ` +
        sinPrecio.join(', '),
      { articlesWithoutPrice: sinPrecio },
    );
  }

  const reference =
    input.reference ?? (await nextDocumentNumber(db, 'SALES_ORDER', orderDate));

  return db.salesOrder.create({
    data: {
      reference,
      customerId: input.customerId,
      orderDate,
      status: 'draft',
      notes: input.notes ?? null,
      lines: { create: resolved },
    },
  });
}

/**
 * Confirma el pedido y lo reparte en órdenes de servicio, una por fábrica.
 *
 * Es idempotente: si ya existen órdenes de servicio, las devuelve en vez de
 * duplicarlas. La comisión de cada línea se resuelve y congela aquí, así que
 * un cambio de comisión posterior no altera estas órdenes.
 */
export async function confirmSalesOrder(db: Db, orderId: string) {
  const order = await db.salesOrder.findUnique({
    where: { id: orderId },
    include: { lines: true, serviceOrders: true },
  });
  if (!order) throw notFound('Pedido');
  if (order.status !== 'draft') {
    throw invalidTransition(order.status, 'confirmed');
  }

  const sinFabrica = order.lines.filter((l) => !l.factoryId);
  if (sinFabrica.length > 0) {
    throw badRequest(
      'Hay líneas sin fábrica asignada; vuelve a resolver precios antes de confirmar',
    );
  }

  if (order.serviceOrders.length > 0) {
    return { order, serviceOrders: order.serviceOrders, created: false };
  }

  // Agrupar líneas por fábrica.
  const byFactory = new Map<string, typeof order.lines>();
  for (const line of order.lines) {
    const key = line.factoryId as string;
    const bucket = byFactory.get(key);
    if (bucket) bucket.push(line);
    else byFactory.set(key, [line]);
  }

  const serviceOrders = [];
  for (const [factoryId, lines] of byFactory) {
    const factory = await db.factory.findUnique({ where: { id: factoryId } });
    if (!factory) throw notFound('Fábrica');

    const number = await nextDocumentNumber(db, 'SERVICE_ORDER', order.orderDate);

    const created = await db.serviceOrder.create({
      data: {
        number,
        factoryId,
        salesOrderId: order.id,
        status: 'draft',
        notes: `Generada del pedido ${order.reference}`,
        lines: {
          create: await Promise.all(
            lines.map(async (l) => {
              const link = await db.factoryArticle.findUnique({
                where: { factoryId_articleId: { factoryId, articleId: l.articleId } },
              });
              // Override del producto si existe; si no, la general de la fábrica.
              const commissionPct = D(link?.commissionPctOverride ?? factory.defaultCommissionPct);
              return {
                articleId: l.articleId,
                salesOrderLineId: l.id,
                qty: l.qty,
                unitPrice: l.unitPrice,
                lineTotal: l.lineTotal,
                commissionPct,
                commissionAmount: money(D(l.lineTotal).mul(commissionPct).div(100)),
              };
            }),
          ),
        },
      },
    });
    serviceOrders.push(created);
  }

  const updated = await db.salesOrder.update({
    where: { id: orderId },
    data: { status: 'confirmed' },
  });

  return { order: updated, serviceOrders, created: true };
}

const SALES_ORDER_ALLOWED: Record<string, string[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['placed', 'cancelled'],
  placed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function assertSalesOrderTransition(from: string, to: string): void {
  const allowed = SALES_ORDER_ALLOWED[from] ?? [];
  if (!allowed.includes(to)) throw invalidTransition(from, to);
}

export async function placeSalesOrder(db: Db, orderId: string) {
  const order = await db.salesOrder.findUnique({
    where: { id: orderId },
    include: { serviceOrders: { select: { id: true } } },
  });
  if (!order) throw notFound('Pedido');
  assertSalesOrderTransition(order.status, 'placed');
  if (order.serviceOrders.length === 0) {
    throw badRequest('El pedido no tiene órdenes de servicio; confírmalo antes de enviarlo');
  }
  return db.salesOrder.update({ where: { id: orderId }, data: { status: 'placed' } });
}

/**
 * Cuando todas las órdenes de servicio de un pedido quedan facturadas, el
 * pedido pasa a completado. Si ninguna está facturada todavía, no se toca.
 */
export async function maybeCompleteSalesOrder(
  db: Db,
  salesOrderId: string,
): Promise<void> {
  const pending = await db.serviceOrder.count({
    where: { salesOrderId, invoices: { none: {} } },
  });
  if (pending === 0) {
    await db.salesOrder.updateMany({
      where: { id: salesOrderId, status: { in: ['confirmed', 'placed'] } },
      data: { status: 'completed' },
    });
  }
}
