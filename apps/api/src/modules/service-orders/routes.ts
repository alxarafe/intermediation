import type { FastifyInstance } from 'fastify';
import {
  BatchVerifyInput,
  IdParam,
  PaginationQuery,
  ServiceOrderStatus,
  VerifyServiceOrderInput,
} from '@intermediacion/shared';
import { notFound } from '../../lib/errors';
import { serviceOrderInclude, toServiceOrderDto } from '../../lib/serialize';
import { parseOrThrow } from '../../lib/validate';
import { prisma } from '../../prisma';
import { batchVerify, transitionServiceOrder, verifyServiceOrder } from './service';

const VALID_STATUS: ServiceOrderStatus[] = [
  'draft',
  'sent',
  'acknowledged',
  'shipped',
  'delivered',
  'verified_ok',
  'discrepancy',
  'rejected',
  'invoiced',
];

async function loadServiceOrder(id: string) {
  const so = await prisma.serviceOrder.findUnique({ where: { id }, include: serviceOrderInclude });
  if (!so) throw notFound('Orden de servicio');
  return toServiceOrderDto(so);
}

export async function serviceOrderRoutes(app: FastifyInstance): Promise<void> {
  app.get('/service-orders', async (req) => {
    const q = parseOrThrow(
      PaginationQuery.extend({
        status: PaginationQuery.shape.q,
        factoryId: PaginationQuery.shape.q,
        salesOrderId: PaginationQuery.shape.q,
        billable: PaginationQuery.shape.q,
      }),
      req.query,
    );

    const statuses = q.status
      ? q.status.split(',').filter((s) => (VALID_STATUS as string[]).includes(s))
      : undefined;

    const where = {
      ...(statuses?.length ? { status: { in: statuses } } : {}),
      ...(q.factoryId ? { factoryId: q.factoryId } : {}),
      ...(q.salesOrderId ? { salesOrderId: q.salesOrderId } : {}),
      // Candidatas a facturar: verificadas y sin factura.
      ...(q.billable === 'true'
        ? { status: 'verified_ok', invoices: { none: {} } }
        : {}),
      ...(q.q
        ? {
            OR: [
              { number: { contains: q.q, mode: 'insensitive' as const } },
              { factory: { name: { contains: q.q, mode: 'insensitive' as const } } },
              {
                salesOrder: {
                  customer: { name: { contains: q.q, mode: 'insensitive' as const } },
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.serviceOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: q.take,
        skip: q.skip,
        include: serviceOrderInclude,
      }),
      prisma.serviceOrder.count({ where }),
    ]);

    return { items: rows.map(toServiceOrderDto), total };
  });

  app.get('/service-orders/:id', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    return loadServiceOrder(id);
  });

  /* ----------------------------- Cambios de estado ----------------------------- */

  const step = (path: string, to: string) => {
    app.post(`/service-orders/:id/${path}`, async (req) => {
      const { id } = parseOrThrow(IdParam, req.params);
      await transitionServiceOrder(prisma, id, to);
      return loadServiceOrder(id);
    });
  };

  step('send', 'sent');
  step('acknowledge', 'acknowledged');
  step('ship', 'shipped');
  step('deliver', 'delivered');

  /* ------------------------------ Verificación ------------------------------ */

  app.post('/service-orders/:id/verify', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    const body = parseOrThrow(VerifyServiceOrderInput, req.body);
    await verifyServiceOrder(prisma, id, body, req.currentUser?.id ?? null, null);
    return loadServiceOrder(id);
  });

  /**
   * Verificación agrupada: N órdenes de una vez, en una sola transacción, y
   * todas quedan selladas en el mismo lote para poder auditarlas.
   */
  app.post('/service-orders/verify-batch', async (req) => {
    const body = parseOrThrow(BatchVerifyInput, req.body);
    const out = await batchVerify(prisma, body, req.currentUser?.id ?? null);
    return {
      batchId: out.batch.id,
      reference: out.batch.reference,
      counts: out.counts,
      results: out.results,
    };
  });

  /* -------------------------------- Lotes -------------------------------- */

  app.get('/verification-batches', async (req) => {
    const q = parseOrThrow(PaginationQuery, req.query);
    const [rows, total] = await Promise.all([
      prisma.verificationBatch.findMany({
        orderBy: { verifiedAt: 'desc' },
        take: q.take,
        skip: q.skip,
        include: {
          verifiedBy: { select: { name: true } },
          verifications: {
            include: {
              serviceOrder: {
                include: { lines: { select: { commissionAmount: true } } },
              },
            },
          },
        },
      }),
      prisma.verificationBatch.count(),
    ]);

    return {
      items: rows.map((b) => {
        const vs = b.verifications;
        return {
          id: b.id,
          reference: b.reference,
          verifiedAt: b.verifiedAt.toISOString(),
          notes: b.notes,
          verifiedByName: b.verifiedBy?.name ?? null,
          orderCount: vs.length,
          okCount: vs.filter((v) => v.result === 'ok').length,
          discrepancyCount: vs.filter((v) => v.result === 'discrepancy').length,
          rejectedCount: vs.filter((v) => v.result === 'rejected').length,
          commissionTotal: vs.reduce(
            (acc, v) =>
              acc + v.serviceOrder.lines.reduce((a, l) => a + Number(l.commissionAmount), 0),
            0,
          ),
        };
      }),
      total,
    };
  });
}
