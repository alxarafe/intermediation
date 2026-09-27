import type { FastifyInstance } from 'fastify';
import { PriceHistoryQuery, PriceResolveQuery } from '@intermediacion/shared';
import { parseDateOnly, todayString } from '../../lib/date';
import { notFound } from '../../lib/errors';
import { toPriceHistoryRowDto, toResolvedPriceDto } from '../../lib/serialize';
import { parseOrThrow } from '../../lib/validate';
import { prisma } from '../../prisma';
import { priceHistory, resolvePriceForArticle } from '../pricing/service';

export async function priceRoutes(app: FastifyInstance): Promise<void> {
  /**
   * El corazón del sistema: qué precio rige para (fábrica, artículo, fecha).
   * Responde `found: false` si no hay ninguna tarifa vigente en esa fecha.
   */
  app.get('/prices/resolve', async (req) => {
    const q = parseOrThrow(PriceResolveQuery, req.query);
    const at = parseDateOnly(q.at ?? todayString());
    const line = await resolvePriceForArticle(prisma, q.factoryId, q.articleId, at);
    return {
      at: q.at ?? todayString(),
      found: line !== null,
      price: line ? toResolvedPriceDto(line, line.factoryArticle.factory) : null,
    };
  });

  /** Histórico de un artículo en una fábrica, para auditar la regla de fechas. */
  app.get('/prices/history', async (req) => {
    const q = parseOrThrow(PriceHistoryQuery, req.query);
    const link = await prisma.factoryArticle.findUnique({
      where: { factoryId_articleId: { factoryId: q.factoryId, articleId: q.articleId } },
    });
    if (!link) throw notFound('Vínculo fábrica-artículo');
    const rows = await priceHistory(prisma, q.factoryId, q.articleId);
    return {
      factoryId: q.factoryId,
      articleId: q.articleId,
      items: rows.map(toPriceHistoryRowDto),
      total: rows.length,
    };
  });
}
