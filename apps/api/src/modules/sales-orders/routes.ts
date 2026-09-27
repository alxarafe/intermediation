import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import {
  AddSalesOrderLinesInput,
  CreateSalesOrderInput,
  IdParam,
  PaginationQuery,
  SalesOrderStatus,
  UpdateSalesOrderInput,
} from '@intermediacion/shared';
import { D, money } from '../../lib/decimal';
import { badRequest, notFound } from '../../lib/errors';
import {
  salesOrderInclude,
  toSalesOrderDto,
  type SalesOrderRow,
} from '../../lib/serialize';
import { parseOrThrow } from '../../lib/validate';
import { prisma } from '../../prisma';
import { findBestOffer } from '../pricing/service';
import {
  assertSalesOrderTransition,
  confirmSalesOrder,
  createSalesOrder,
  placeSalesOrder,
} from './service';

/** Los nombres de fábrica no son relación en el esquema (la línea sólo guarda
 *  el id), así que se resuelven aparte para no ensuciar el modelo. */
async function factoryNameMap(
  db: PrismaClient,
  orders: Array<{ lines: Array<{ factoryId: string | null }> }>,
): Promise<Map<string, string>> {
  const ids = new Set<string>();
  for (const o of orders) for (const l of o.lines) if (l.factoryId) ids.add(l.factoryId);
  if (ids.size === 0) return new Map();
  const rows = await db.factory.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function loadOrder(id: string) {
  const order = await prisma.salesOrder.findUnique({ where: { id }, include: salesOrderInclude });
  if (!order) throw notFound('Pedido');
  const names = await factoryNameMap(prisma, [order]);
  return toSalesOrderDto(order, names);
}

const VALID_STATUS: SalesOrderStatus[] = [
  'draft',
  'confirmed',
  'placed',
  'completed',
  'cancelled',
];

export async function salesOrderRoutes(app: FastifyInstance): Promise<void> {
  app.get('/sales-orders', async (req) => {
    const q = parseOrThrow(
      PaginationQuery.extend({
        status: PaginationQuery.shape.q,
        customerId: PaginationQuery.shape.q,
        from: PaginationQuery.shape.q,
        to: PaginationQuery.shape.q,
      }),
      req.query,
    );
    const statuses = q.status
      ? q.status.split(',').filter((s) => (VALID_STATUS as string[]).includes(s))
      : undefined;

    const where = {
      ...(statuses?.length ? { status: { in: statuses } } : {}),
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.from || q.to
        ? {
            orderDate: {
              ...(q.from ? { gte: new Date(`${q.from}T00:00:00.000Z`) } : {}),
              ...(q.to ? { lte: new Date(`${q.to}T00:00:00.000Z`) } : {}),
            },
          }
        : {}),
      ...(q.q
        ? {
            OR: [
              { reference: { contains: q.q, mode: 'insensitive' as const } },
              { customer: { name: { contains: q.q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.salesOrder.findMany({
        where,
        orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
        take: q.take,
        skip: q.skip,
        include: salesOrderInclude,
      }),
      prisma.salesOrder.count({ where }),
    ]);

    const names = await factoryNameMap(prisma, rows);
    return { items: rows.map((o) => toSalesOrderDto(o, names)), total };
  });

  app.get('/sales-orders/:id', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    return loadOrder(id);
  });

  /** Alta del pedido. Los precios los resuelve y congela el servidor. */
  app.post('/sales-orders', async (req, reply) => {
    const body = parseOrThrow(CreateSalesOrderInput, req.body);
    const order = await createSalesOrder(prisma, body);
    reply.code(201);
    return loadOrder(order.id);
  });

  app.patch('/sales-orders/:id', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    const body = parseOrThrow(UpdateSalesOrderInput, req.body);
    const current = await prisma.salesOrder.findUnique({ where: { id } });
    if (!current) throw notFound('Pedido');
    if (current.status !== 'draft') {
      throw badRequest('Sólo se puede editar un pedido en borrador');
    }
    await prisma.salesOrder.update({
      where: { id },
      data: {
        ...(body.orderDate ? { orderDate: new Date(`${body.orderDate}T00:00:00.000Z`) } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });
    return loadOrder(id);
  });

  /**
   * Añade líneas a un pedido en borrador. Cada línea nueva se precio con la
   * tarifa vigente en la fecha del pedido, igual que en el alta.
   */
  app.post('/sales-orders/:id/lines', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    const body = parseOrThrow(AddSalesOrderLinesInput, req.body);

    const order = await prisma.salesOrder.findUnique({ where: { id } });
    if (!order) throw notFound('Pedido');
    if (order.status !== 'draft') {
      throw badRequest('Sólo se pueden añadir líneas a un pedido en borrador');
    }

    const sinPrecio: string[] = [];
    const prepared = [];
    for (const line of body.lines) {
      const offer = await findBestOffer(prisma, line.articleId, order.orderDate);
      if (!offer) {
        sinPrecio.push(line.articleId);
        continue;
      }
      const unitPrice = money(offer.unitPrice);
      prepared.push({
        orderId: id,
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
      throw badRequest('Sin precio vigente para: ' + sinPrecio.join(', '));
    }

    await prisma.salesOrderLine.createMany({ data: prepared });
    return loadOrder(id);
  });

  app.delete('/sales-orders/:id/lines/:lineId', async (req) => {
    const { id, lineId } = parseOrThrow(
      IdParam.extend({ lineId: IdParam.shape.id }),
      req.params,
    );
    const order = await prisma.salesOrder.findUnique({ where: { id } });
    if (!order) throw notFound('Pedido');
    if (order.status !== 'draft') {
      throw badRequest('Sólo se pueden quitar líneas de un pedido en borrador');
    }
    await prisma.salesOrderLine.delete({ where: { id: lineId } });
    return loadOrder(id);
  });

  /** Confirma y reparte en órdenes de servicio, una por fábrica. */
  app.post('/sales-orders/:id/confirm', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    await confirmSalesOrder(prisma, id);
    return loadOrder(id);
  });

  app.post('/sales-orders/:id/place', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    await placeSalesOrder(prisma, id);
    return loadOrder(id);
  });

  app.post('/sales-orders/:id/cancel', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    const order = await prisma.salesOrder.findUnique({
      where: { id },
      include: { serviceOrders: { select: { id: true } } },
    });
    if (!order) throw notFound('Pedido');
    assertSalesOrderTransition(order.status, 'cancelled');
    if (order.serviceOrders.length > 0) {
      throw badRequest(
        'El pedido ya tiene órdenes de servicio en la fábrica; cancélalas antes',
      );
    }
    await prisma.salesOrder.update({ where: { id }, data: { status: 'cancelled' } });
    return loadOrder(id);
  });
}

export type { SalesOrderRow };
