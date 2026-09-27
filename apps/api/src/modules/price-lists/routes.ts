import type { FastifyInstance } from 'fastify';
import {
  ActivatePriceListInput,
  CreatePriceListInput,
  IdParam,
  PaginationQuery,
  UpdatePriceListInput,
} from '@intermediacion/shared';
import { D } from '../../lib/decimal';
import { badRequest, notFound } from '../../lib/errors';
import { toPriceListDto, toPriceListWithLinesDto, priceListFullInclude } from '../../lib/serialize';
import { parseOrThrow } from '../../lib/validate';
import { parseDateOnly, rangesOverlap } from '../../lib/date';
import { prisma } from '../../prisma';
import { activatePriceList, archivePriceList } from '../pricing/service';

export async function priceListRoutes(app: FastifyInstance): Promise<void> {
  app.get('/price-lists', async (req) => {
    const q = parseOrThrow(
      PaginationQuery.extend({
        factoryId: PaginationQuery.shape.q,
        status: PaginationQuery.shape.q,
      }),
      req.query,
    );
    const where = {
      ...(q.factoryId ? { factoryId: q.factoryId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? {
            OR: [
              { code: { contains: q.q, mode: 'insensitive' as const } },
              { name: { contains: q.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.priceList.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: q.take,
        skip: q.skip,
        include: { factory: true, _count: { select: { lines: true } } },
      }),
      prisma.priceList.count({ where }),
    ]);
    return { items: rows.map(toPriceListDto), total };
  });

  app.get('/price-lists/:id', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    const pl = await prisma.priceList.findUnique({
      where: { id },
      include: priceListFullInclude,
    });
    if (!pl) throw notFound('Tarifa');
    return toPriceListWithLinesDto(pl);
  });

  /**
   * Alta de tarifa en `draft`. Al crearla se comprueba que una misma línea
   * (mismo vínculo fábrica-artículo) no tenga intervalos solapados con lo ya
   * publicado, porque dos precios vigentes a la vez harían la resolución
   * ambigua.
   */
  app.post('/price-lists', async (req, reply) => {
    const body = parseOrThrow(CreatePriceListInput, req.body);

    const links = await prisma.factoryArticle.findMany({
      where: { factoryId: body.factoryId, articleId: { in: body.lines.map((l) => l.articleId) } },
      select: { id: true, articleId: true, article: { select: { name: true } } },
    });
    const linkByArticle = new Map(links.map((l) => [l.articleId, l]));

    const faltantes = body.lines
      .map((l) => l.articleId)
      .filter((articleId) => !linkByArticle.has(articleId));
    if (faltantes.length > 0) {
      throw badRequest(
        'Esos artículos no están vinculados a esta fábrica: ' + faltantes.join(', '),
      );
    }

    const effectiveFrom = parseDateOnly(body.effectiveFrom);
    const prepared = body.lines.map((l) => {
      const validFrom = l.validFrom ? parseDateOnly(l.validFrom) : effectiveFrom;
      const validTo = l.validTo ? parseDateOnly(l.validTo) : null;
      if (validTo && validTo <= validFrom) {
        throw badRequest('validTo debe ser posterior a validFrom');
      }
      return { articleId: l.articleId, validFrom, validTo };
    });

    // Solapes dentro de la propia tarifa.
    for (let i = 0; i < prepared.length; i += 1) {
      for (let j = i + 1; j < prepared.length; j += 1) {
        const a = prepared[i]!;
        const b = prepared[j]!;
        if (a.articleId === b.articleId && rangesOverlap(a.validFrom, a.validTo, b.validFrom, b.validTo)) {
          throw badRequest('Dos líneas de la misma tarifa se solapan en el tiempo');
        }
      }
    }

    // Solapes con lo ya publicado.
    for (const p of prepared) {
      const linkId = linkByArticle.get(p.articleId)!.id;
      const existentes = await prisma.priceListLine.findMany({
        where: { factoryArticleId: linkId, priceList: { status: 'active' } },
      });
      const choque = existentes.find((e) =>
        rangesOverlap(e.validFrom, e.validTo, p.validFrom, p.validTo),
      );
      if (choque) {
        throw badRequest(
          `El precio de "${linkByArticle.get(p.articleId)!.article.name}" se solapa con ` +
            `una tarifa ya vigente. Cierra la línea anterior o alinea las fechas.`,
        );
      }
    }

    const pl = await prisma.priceList.create({
      data: {
        factoryId: body.factoryId,
        code: body.code,
        name: body.name ?? null,
        status: 'draft',
        effectiveFrom,
        notes: body.notes ?? null,
        lines: {
          create: body.lines.map((l, i) => ({
            factoryArticleId: linkByArticle.get(l.articleId)!.id,
            unitPrice: D(l.unitPrice),
            validFrom: prepared[i]!.validFrom,
            validTo: prepared[i]!.validTo,
          })),
        },
      },
      include: { factory: true, lines: true },
    });

    reply.code(201);
    return toPriceListDto(pl);
  });

  app.patch('/price-lists/:id', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    const body = parseOrThrow(UpdatePriceListInput, req.body);
    const pl = await prisma.priceList.findUnique({ where: { id } });
    if (!pl) throw notFound('Tarifa');
    if (pl.status !== 'draft') {
      throw badRequest('Sólo se puede editar una tarifa en borrador');
    }

    await prisma.$transaction(async (tx) => {
      if (body.removeLineIds?.length) {
        await tx.priceListLine.deleteMany({
          where: { priceListId: id, id: { in: body.removeLineIds } },
        });
      }
      for (const l of body.updateLines ?? []) {
        await tx.priceListLine.updateMany({
          where: { id: l.id, priceListId: id },
          data: {
            ...(l.unitPrice !== undefined ? { unitPrice: D(l.unitPrice) } : {}),
            ...(l.validFrom !== undefined ? { validFrom: parseDateOnly(l.validFrom) } : {}),
            ...(l.validTo !== undefined
              ? { validTo: l.validTo === null ? null : parseDateOnly(l.validTo) }
              : {}),
          },
        });
      }
      if (body.addLines?.length) {
        const links = await tx.factoryArticle.findMany({
          where: {
            factoryId: pl.factoryId,
            articleId: { in: body.addLines.map((l) => l.articleId) },
          },
          select: { id: true, articleId: true },
        });
        const byArticle = new Map(links.map((l) => [l.articleId, l.id]));
        await tx.priceListLine.createMany({
          data: body.addLines.map((l) => ({
            priceListId: id,
            factoryArticleId: byArticle.get(l.articleId)!,
            unitPrice: D(l.unitPrice),
            validFrom: l.validFrom ? parseDateOnly(l.validFrom) : pl.effectiveFrom,
            validTo: l.validTo ? parseDateOnly(l.validTo) : null,
          })),
        });
      }
      await tx.priceList.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
        },
      });
    });

    const updated = await prisma.priceList.findUnique({
      where: { id },
      include: priceListFullInclude,
    });
    return toPriceListWithLinesDto(updated as never);
  });

  /** Publica la tarifa y cierra las líneas abiertas que la nueva tarifa sustituye. */
  app.post('/price-lists/:id/activate', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    parseOrThrow(ActivatePriceListInput, req.body ?? {});
    const lines = await activatePriceList(prisma, id);
    const pl = await prisma.priceList.findUnique({
      where: { id },
      include: priceListFullInclude,
    });
    return {
      priceList: toPriceListWithLinesDto(pl as never),
      supersededLines: lines.length,
    };
  });

  app.post('/price-lists/:id/archive', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    await archivePriceList(prisma, id);
    return { id, status: 'archived' };
  });

  app.delete('/price-lists/:id', async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    const pl = await prisma.priceList.findUnique({ where: { id } });
    if (!pl) throw notFound('Tarifa');
    if (pl.status !== 'draft') {
      throw badRequest('Una tarifa publicada se archiva, no se borra');
    }
    await prisma.priceList.delete({ where: { id } });
    return { id, deleted: true };
  });
}
