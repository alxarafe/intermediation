import type { FastifyInstance } from 'fastify';
import {
  ArticleOffersQuery,
  CreateArticleInput,
  IdParam,
  PaginationQuery,
  UpdateArticleInput,
} from '@intermediacion/shared';
import { notFound } from '../../lib/errors';
import { toArticleDto, toResolvedPriceDto } from '../../lib/serialize';
import { parseOrThrow } from '../../lib/validate';
import { parseDateOnly, todayString } from '../../lib/date';
import { prisma } from '../../prisma';
import { listOffers } from '../pricing/service';

export async function articleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/articles', async (req) => {
    const q = parseOrThrow(PaginationQuery, req.query);
    const where = q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' as const } },
            { sku: { contains: q.q, mode: 'insensitive' as const } },
            { ean: { contains: q.q } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      prisma.article.findMany({
        where,
        orderBy: { name: 'asc' },
        take: q.take,
        skip: q.skip,
        include: { _count: { select: { factoryArticles: true } } },
      }),
      prisma.article.count({ where }),
    ]);
    return {
      items: rows.map((a) => toArticleDto(a, a._count.factoryArticles)),
      total,
    };
  });

  app.get('/articles/:id', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    const article = await prisma.article.findUnique({
      where: { id },
      include: { _count: { select: { factoryArticles: true } } },
    });
    if (!article) throw notFound('Artículo');
    return toArticleDto(article, article._count.factoryArticles);
  });

  app.post('/articles', async (req, reply) => {
    const body = parseOrThrow(CreateArticleInput, req.body);
    const article = await prisma.article.create({
      data: {
        sku: body.sku,
        name: body.name,
        description: body.description ?? null,
        unit: body.unit,
        ean: body.ean ?? null,
        active: body.active,
      },
    });
    reply.code(201);
    return toArticleDto(article);
  });

  app.patch('/articles/:id', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    const body = parseOrThrow(UpdateArticleInput, req.body);
    return toArticleDto(await prisma.article.update({ where: { id }, data: body }));
  });

  app.delete('/articles/:id', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    await prisma.article.update({ where: { id }, data: { active: false } });
    return { id, active: false };
  });

  /**
   * Comparativa: qué fábricas sirven este artículo en una fecha y a qué precio.
   * Es la vista que usa el alta de pedido para elegir, y la que permite
   * comprobar de un vistazo que la resolución por fecha funciona.
   */
  app.get('/articles/:id/offers', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    const q = parseOrThrow(ArticleOffersQuery.pick({ at: true }), req.query);
    const at = parseDateOnly(q.at ?? todayString());
    const rows = await listOffers(prisma, id, at);
    return {
      at: q.at ?? todayString(),
      items: rows.map((r) => toResolvedPriceDto(r, r.factoryArticle.factory)),
      total: rows.length,
    };
  });
}
