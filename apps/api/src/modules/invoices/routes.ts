import type { FastifyInstance } from 'fastify';
import {
  CreateCommissionInvoiceInput,
  IdParam,
  InvoiceStatus,
  PaginationQuery,
  UpdateCommissionInvoiceInput,
} from '@intermediacion/shared';
import { toDateOnlyString } from '../../lib/date';
import { D, money } from '../../lib/decimal';
import { notFound } from '../../lib/errors';
import { invoiceInclude, toCommissionInvoiceDto } from '../../lib/serialize';
import { parseOrThrow } from '../../lib/validate';
import { prisma } from '../../prisma';
import { createCommissionInvoice, transitionInvoice } from './service';

const VALID_STATUS: InvoiceStatus[] = ['draft', 'issued', 'paid', 'cancelled'];

async function loadInvoice(id: string) {
  const inv = await prisma.commissionInvoice.findUnique({
    where: { id },
    include: invoiceInclude,
  });
  if (!inv) throw notFound('Factura');
  return toCommissionInvoiceDto(inv);
}

export async function invoiceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/commission-invoices', async (req) => {
    const q = parseOrThrow(
      PaginationQuery.extend({
        status: PaginationQuery.shape.q,
        factoryId: PaginationQuery.shape.q,
      }),
      req.query,
    );
    const where = {
      ...(q.status
        ? {
            status: {
              in: q.status.split(',').filter((s) => (VALID_STATUS as string[]).includes(s)),
            },
          }
        : {}),
      ...(q.factoryId ? { factoryId: q.factoryId } : {}),
      ...(q.q
        ? {
            OR: [
              { number: { contains: q.q, mode: 'insensitive' as const } },
              { factory: { name: { contains: q.q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.commissionInvoice.findMany({
        where,
        orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
        take: q.take,
        skip: q.skip,
        include: invoiceInclude,
      }),
      prisma.commissionInvoice.count({ where }),
    ]);

    return { items: rows.map(toCommissionInvoiceDto), total };
  });

  app.get('/commission-invoices/:id', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    return loadInvoice(id);
  });

  /**
   * Agrupa N órdenes de servicio verificadas en una factura de comisión a la
   * fábrica. El servidor comprueba fábrica, verificación y no-facturación previa.
   */
  app.post('/commission-invoices', async (req, reply) => {
    const body = parseOrThrow(CreateCommissionInvoiceInput, req.body);
    const invoice = await createCommissionInvoice(prisma, body);
    reply.code(201);
    return loadInvoice(invoice.id);
  });

  app.patch('/commission-invoices/:id', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    const body = parseOrThrow(UpdateCommissionInvoiceInput, req.body);
    const current = await prisma.commissionInvoice.findUnique({ where: { id } });
    if (!current) throw notFound('Factura');
    if (current.status !== 'draft') {
      // Sólo se retocan fechas e IVA; los importes ya están snapping.
      await prisma.commissionInvoice.update({
        where: { id },
        data: {
          ...(body.issueDate ? { issueDate: new Date(`${body.issueDate}T00:00:00.000Z`) } : {}),
          ...(body.dueDate !== undefined
            ? { dueDate: body.dueDate === null ? null : new Date(`${body.dueDate}T00:00:00.000Z`) }
            : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
        },
      });
      return loadInvoice(id);
    }

    // En borrador el IVA se puede corregir y recalcula los totales.
    const taxPct = body.taxPct !== undefined ? D(body.taxPct) : current.taxPct;
    const subtotal = D(current.subtotal);
    const taxTotal = money(subtotal.mul(taxPct).div(100));

    await prisma.commissionInvoice.update({
      where: { id },
      data: {
        taxPct,
        taxTotal,
        total: money(subtotal.add(taxTotal)),
        ...(body.issueDate ? { issueDate: new Date(`${body.issueDate}T00:00:00.000Z`) } : {}),
        ...(body.dueDate !== undefined
          ? { dueDate: body.dueDate === null ? null : new Date(`${body.dueDate}T00:00:00.000Z`) }
          : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });
    return loadInvoice(id);
  });

  const step = (path: string, to: string) => {
    app.post(`/commission-invoices/:id/${path}`, async (req) => {
      const { id } = parseOrThrow(IdParam, req.params);
      await transitionInvoice(prisma, id, to);
      return loadInvoice(id);
    });
  };

  step('issue', 'issued');
  step('pay', 'paid');
  step('cancel', 'cancelled');

  /** Vista imprimible: los mismos datos de la factura, sin más envoltorio. */
  app.get('/commission-invoices/:id/print', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    const inv = await prisma.commissionInvoice.findUnique({
      where: { id },
      include: invoiceInclude,
    });
    if (!inv) throw notFound('Factura');
    return {
      ...toCommissionInvoiceDto(inv),
      printedAt: new Date().toISOString(),
      issuedOn: toDateOnlyString(new Date()),
    };
  });
}
