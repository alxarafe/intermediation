import type { FastifyInstance } from 'fastify';
import {
  CreateFactoryInput,
  IdParam,
  PaginationQuery,
  UpdateFactoryInput,
  UpsertFactoryArticleInput,
} from '@intermediacion/shared';
import { notFound } from '../../lib/errors';
import { toFactoryArticleDto, toFactoryDto } from '../../lib/serialize';
import { parseOrThrow } from '../../lib/validate';
import { prisma } from '../../prisma';

const factoryArticleInclude = { factory: true, article: true };

export async function factoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/factories', async (req) => {
    const q = parseOrThrow(PaginationQuery, req.query);
    const where = q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' as const } },
            { taxId: { contains: q.q } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      prisma.factory.findMany({
        where,
        orderBy: { name: 'asc' },
        take: q.take,
        skip: q.skip,
      }),
      prisma.factory.count({ where }),
    ]);
    return { items: rows.map(toFactoryDto), total };
  });

  app.get('/factories/:id', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    const factory = await prisma.factory.findUnique({ where: { id } });
    if (!factory) throw notFound('Fábrica');
    return toFactoryDto(factory);
  });

  app.post('/factories', async (req, reply) => {
    const body = parseOrThrow(CreateFactoryInput, req.body);
    const factory = await prisma.factory.create({
      data: {
        name: body.name,
        taxId: body.taxId,
        email: body.email ?? null,
        phone: body.phone ?? null,
        addressLine: body.addressLine ?? null,
        city: body.city ?? null,
        postalCode: body.postalCode ?? null,
        province: body.province ?? null,
        defaultCommissionPct: body.defaultCommissionPct,
        paymentTermDays: body.paymentTermDays,
        active: body.active,
      },
    });
    reply.code(201);
    return toFactoryDto(factory);
  });

  app.patch('/factories/:id', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    const body = parseOrThrow(UpdateFactoryInput, req.body);
    const factory = await prisma.factory.update({ where: { id }, data: body });
    return toFactoryDto(factory);
  });

  app.delete('/factories/:id', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    // Baja lógica: las facturas y órdenes históricas deben seguir siendo legibles.
    await prisma.factory.update({ where: { id }, data: { active: false } });
    return { id, active: false };
  });

  /* ------------------------------ Artículos de la fábrica ------------------------------ */

  app.get('/factories/:id/articles', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    const rows = await prisma.factoryArticle.findMany({
      where: { factoryId: id },
      include: factoryArticleInclude,
      orderBy: { article: { name: 'asc' } },
    });
    return { items: rows.map(toFactoryArticleDto), total: rows.length };
  });

  /** Alta o edición del vínculo. La comisión específica va aquí. */
  app.put('/factories/:id/articles/:articleId', async (req) => {
    const { id, articleId } = parseOrThrow(
      IdParam.extend({ articleId: IdParam.shape.id }),
      req.params,
    );
    const body = parseOrThrow(UpsertFactoryArticleInput, req.body);
    const row = await prisma.factoryArticle.upsert({
      where: { factoryId_articleId: { factoryId: id, articleId } },
      create: {
        factoryId: id,
        articleId,
        factorySku: body.factorySku ?? null,
        commissionPctOverride: body.commissionPctOverride,
        active: body.active,
      },
      update: {
        factorySku: body.factorySku ?? null,
        commissionPctOverride: body.commissionPctOverride,
        active: body.active,
      },
      include: factoryArticleInclude,
    });
    return toFactoryArticleDto(row);
  });

  app.delete('/factories/:id/articles/:articleId', async (req) => {
    const { id, articleId } = parseOrThrow(
      IdParam.extend({ articleId: IdParam.shape.id }),
      req.params,
    );
    await prisma.factoryArticle.update({
      where: { factoryId_articleId: { factoryId: id, articleId } },
      data: { active: false },
    });
    return { id, articleId, active: false };
  });
}
