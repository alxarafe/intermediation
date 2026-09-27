import type { Prisma, PrismaClient } from '@prisma/client';
import { parseDateOnly, toDateOnlyString } from '../../lib/date';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { priceListLineInclude, type PriceListLineRow } from '../../lib/serialize';

type Db = PrismaClient | Prisma.TransactionClient;

export interface PriceRow extends PriceListLineRow {
  factoryArticle: PriceListLineRow['factoryArticle'] & { factory: { id: string; name: string } };
}

/**
 * Precio vigente de un vínculo fábrica↔artículo en una fecha dada.
 *
 * Semántica de intervalos: [validFrom, validTo) — validFrom incluido,
 * validTo EXCLUIDO. `validTo = null` significa "hasta nueva tarifa": la línea
 * sigue vigente y se cerrará sola cuando se active otra que la toque.
 *
 * Sólo se consideran líneas de tarifas `active`: una tarifa en `draft` no
 * existe para el negocio todavía.
 */
export async function resolvePrice(
  db: Db,
  factoryArticleId: string,
  at: Date,
): Promise<PriceRow | null> {
  return db.priceListLine.findFirst({
    where: {
      factoryArticleId,
      priceList: { status: 'active' },
      validFrom: { lte: at },
      OR: [{ validTo: null }, { validTo: { gt: at } }],
    },
    // Si por error hubiera varias líneas candidatas, gana la más reciente.
    orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
    include: { ...priceListLineInclude, factoryArticle: { include: { article: true, factory: true } } },
  }) as Promise<PriceRow | null>;
}

export async function resolvePriceForArticle(
  db: Db,
  factoryId: string,
  articleId: string,
  at: Date,
): Promise<PriceRow | null> {
  const link = await db.factoryArticle.findUnique({
    where: { factoryId_articleId: { factoryId, articleId } },
    select: { id: true },
  });
  if (!link) return null;
  return resolvePrice(db, link.id, at);
}

/** Todas las fábricas que pueden servir el artículo en esa fecha, de más a menos barata. */
export async function listOffers(db: Db, articleId: string, at: Date): Promise<PriceRow[]> {
  return db.priceListLine.findMany({
    where: {
      factoryArticle: { articleId, active: true, factory: { active: true } },
      priceList: { status: 'active' },
      validFrom: { lte: at },
      OR: [{ validTo: null }, { validTo: { gt: at } }],
    },
    orderBy: [{ unitPrice: 'asc' }, { validFrom: 'desc' }],
    include: { ...priceListLineInclude, factoryArticle: { include: { article: true, factory: true } } },
  }) as Promise<PriceRow[]>;
}

/**
 * Fábrica más barata que puede servir el artículo en esa fecha.
 * Es la que se asigna a la línea del pedido.
 */
export async function findBestOffer(db: Db, articleId: string, at: Date): Promise<PriceRow | null> {
  const offers = await listOffers(db, articleId, at);
  return offers[0] ?? null;
}

/** Histórico completo (incluido lo ya cerrado) para el explorador de precios. */
export async function priceHistory(
  db: Db,
  factoryId: string,
  articleId: string,
): Promise<PriceListLineRow[]> {
  const link = await db.factoryArticle.findUnique({
    where: { factoryId_articleId: { factoryId, articleId } },
    select: { id: true },
  });
  if (!link) return [];
  return db.priceListLine.findMany({
    where: { factoryArticleId: link.id },
    orderBy: { validFrom: 'desc' },
    include: priceListLineInclude,
  });
}

/**
 * Al activar una tarifa, toda línea abierta de un artículo que empiece ANTES
 * que la nueva se cierra con validTo = validFrom de la nueva.
 *
 * Esto es lo que convierte "de fecha a nueva tarifa" en un hecho persistido: a
 * partir de la activación, el histórico deja de tener huecos y la consulta de
 * precio en cualquier fecha pasada da el mismo resultado.
 */
export async function closeSupersededLines(
  db: Db,
  lines: Array<{ id: string; factoryArticleId: string; validFrom: Date }>,
): Promise<number> {
  let closed = 0;
  for (const line of lines) {
    const res = await db.priceListLine.updateMany({
      where: {
        factoryArticleId: line.factoryArticleId,
        id: { not: line.id },
        // Sólo lo que estaba en vigor: nunca tocamos líneas de tarifas en draft.
        priceList: { status: 'active' },
        validTo: null,
        validFrom: { lt: line.validFrom },
      },
      data: { validTo: line.validFrom },
    });
    closed += res.count;
  }
  return closed;
}

export async function activatePriceList(
  db: Db,
  priceListId: string,
): Promise<Array<{ id: string; factoryArticleId: string; validFrom: Date }>> {
  const priceList = await db.priceList.findUnique({
    where: { id: priceListId },
    include: { lines: { orderBy: { validFrom: 'asc' } } },
  });
  if (!priceList) throw notFound('Tarifa');
  if (priceList.status !== 'draft') {
    throw conflict(`La tarifa ${priceList.code} ya está ${priceList.status}`);
  }

  // Dos líneas del mismo artículo en la MISMA tarifa se pisan entre sí:
  // la segunda cerraría a la primera. Lo rechazamos por clarity.
  const seen = new Set<string>();
  for (const l of priceList.lines) {
    if (seen.has(l.factoryArticleId)) {
      throw badRequest(
        `La tarifa ${priceList.code} repite el artículo ${l.factoryArticleId}. ` +
          'Un artículo aparece como máximo una vez por tarifa.',
      );
    }
    seen.add(l.factoryArticleId);
  }

  await closeSupersededLines(db, priceList.lines);
  await db.priceList.update({
    where: { id: priceListId },
    data: { status: 'active', activatedAt: new Date() },
  });
  return priceList.lines;
}

export async function archivePriceList(db: Db, priceListId: string): Promise<void> {
  const priceList = await db.priceList.findUnique({ where: { id: priceListId } });
  if (!priceList) throw notFound('Tarifa');
  if (priceList.status === 'archived') return;
  // Al archivar reabrimos sus líneas: si no, el artículo se quedaría sin
  // precio en las fechas que cubrían.
  await db.priceListLine.updateMany({
    where: { priceListId, validTo: { not: null } },
    data: { validTo: null },
  });
  await db.priceList.update({ where: { id: priceListId }, data: { status: 'archived' } });
}

export { parseDateOnly, toDateOnlyString };
