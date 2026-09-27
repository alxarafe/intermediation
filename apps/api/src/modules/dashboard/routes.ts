import type { FastifyInstance } from 'fastify';
import { toNum } from '../../lib/decimal';
import { prisma } from '../../prisma';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/dashboard', async () => {
    const [
      openSalesOrders,
      statusGroups,
      accrued,
      invoiced,
      activeFactories,
      activeArticles,
      billableCount,
    ] = await Promise.all([
      prisma.salesOrder.count({ where: { status: { in: ['draft', 'confirmed', 'placed'] } } }),
      prisma.serviceOrder.groupBy({ by: ['status'], _count: { _all: true } }),
      // Comisión devengada: la de las órdenes ya enviadas a fábrica.
      prisma.serviceOrderLine.aggregate({
        where: { serviceOrder: { status: { notIn: ['draft'] } } },
        _sum: { commissionAmount: true },
      }),
      prisma.commissionInvoice.aggregate({
        where: { status: { not: 'cancelled' } },
        _sum: { total: true },
      }),
      prisma.factory.count({ where: { active: true } }),
      prisma.article.count({ where: { active: true } }),
      prisma.serviceOrder.count({ where: { status: 'verified_ok', invoices: { none: {} } } }),
    ]);

    const commissionAccrued = toNum(accrued._sum.commissionAmount);
    const commissionInvoiced = toNum(invoiced._sum.total);

    return {
      openSalesOrders,
      serviceOrdersByStatus: Object.fromEntries(
        statusGroups.map((g) => [g.status, g._count._all]),
      ),
      commissionAccrued,
      commissionInvoiced,
      commissionOutstanding: Math.max(0, commissionAccrued - commissionInvoiced),
      activeFactories,
      activeArticles,
      billableServiceOrders: billableCount,
    };
  });
}
