import type { FastifyInstance } from 'fastify';
import {
  CreateCustomerInput,
  IdParam,
  PaginationQuery,
  UpdateCustomerInput,
} from '@intermediacion/shared';
import { notFound } from '../../lib/errors';
import { toCustomerDto } from '../../lib/serialize';
import { parseOrThrow } from '../../lib/validate';
import { prisma } from '../../prisma';

export async function customerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/customers', async (req) => {
    const q = parseOrThrow(PaginationQuery, req.query);
    const where = q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' as const } },
            { taxId: { contains: q.q } },
            { email: { contains: q.q, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        take: q.take,
        skip: q.skip,
      }),
      prisma.customer.count({ where }),
    ]);
    return { items: rows.map(toCustomerDto), total };
  });

  app.get('/customers/:id', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    const c = await prisma.customer.findUnique({ where: { id } });
    if (!c) throw notFound('Cliente');
    return toCustomerDto(c);
  });

  app.post('/customers', async (req, reply) => {
    const body = parseOrThrow(CreateCustomerInput, req.body);
    const c = await prisma.customer.create({
      data: {
        name: body.name,
        taxId: body.taxId,
        email: body.email ?? null,
        phone: body.phone ?? null,
        addressLine: body.addressLine ?? null,
        city: body.city ?? null,
        postalCode: body.postalCode ?? null,
        province: body.province ?? null,
        active: body.active,
      },
    });
    reply.code(201);
    return toCustomerDto(c);
  });

  app.patch('/customers/:id', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    const body = parseOrThrow(UpdateCustomerInput, req.body);
    return toCustomerDto(await prisma.customer.update({ where: { id }, data: body }));
  });

  app.delete('/customers/:id', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    await prisma.customer.update({ where: { id }, data: { active: false } });
    return { id, active: false };
  });
}
