import type { Prisma, PrismaClient } from '@prisma/client';
import type { BatchVerifyInput, VerifyServiceOrderInput } from '@intermediacion/shared';
import { parseDateOnly } from '../../lib/date';
import { D } from '../../lib/decimal';
import { badRequest, conflict, invalidTransition, notFound } from '../../lib/errors';
import { nextDocumentNumber } from '../../lib/sequences';

type Db = PrismaClient | Prisma.TransactionClient;

/** Transiciones de la orden de servicio. La verificación va por su propio endpoint. */
const ALLOWED: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['acknowledged', 'shipped'],
  acknowledged: ['shipped'],
  shipped: ['delivered'],
  delivered: [],
  verified_ok: [],
  discrepancy: ['verified_ok', 'rejected'],
  rejected: [],
  invoiced: [],
};

/** Desde qué estados se puede verificar la recepción. */
const VERIFIABLE_FROM = ['shipped', 'delivered', 'discrepancy'];

const STATUS_TIMESTAMP: Record<string, 'sentAt' | 'shippedAt' | 'deliveredAt'> = {
  sent: 'sentAt',
  shipped: 'shippedAt',
  delivered: 'deliveredAt',
};

export async function transitionServiceOrder(db: Db, serviceOrderId: string, to: string) {
  const so = await db.serviceOrder.findUnique({
    where: { id: serviceOrderId },
    include: { invoices: { select: { invoiceId: true } } },
  });
  if (!so) throw notFound('Orden de servicio');

  if (so.invoices.length > 0) {
    throw conflict('La orden ya está incluida en una factura de comisión');
  }

  const allowed = ALLOWED[so.status] ?? [];
  if (!allowed.includes(to)) throw invalidTransition(so.status, to);

  const stampField = STATUS_TIMESTAMP[to];
  return db.serviceOrder.update({
    where: { id: serviceOrderId },
    data: stampField ? { status: to, [stampField]: new Date() } : { status: to },
  });
}

const RESULT_STATUS = {
  ok: 'verified_ok',
  discrepancy: 'discrepancy',
  rejected: 'rejected',
} as const;

/**
 * Verifica la recepción de UNA orden de servicio.
 *
 * Si se pasan cantidades por línea yAlguna no cuadra con lo pedido, el
 * resultado no puede ser `ok`: es un error de datos inconsistente y se rechaza
 * en vez de guardar una verificación que diga "todo correcto" con mermas
 * que no lo están.
 */
export async function verifyServiceOrder(
  db: Db,
  serviceOrderId: string,
  input: VerifyServiceOrderInput,
  userId: string | null,
  batchId: string | null,
) {
  const so = await db.serviceOrder.findUnique({
    where: { id: serviceOrderId },
    include: { lines: true, verification: true },
  });
  if (!so) throw notFound('Orden de servicio');

  if (so.verification && so.verification.result === 'ok') {
    throw conflict('La recepción de esta orden ya se verificó como correcta');
  }
  if (!VERIFIABLE_FROM.includes(so.status)) {
    throw invalidTransition(so.status, 'verificación');
  }

  if (input.lines && input.lines.length > 0) {
    const byId = new Map(so.lines.map((l) => [l.id, l.qty]));
    const descuadres: string[] = [];
    for (const entry of input.lines) {
      const pedido = byId.get(entry.lineId);
      if (pedido === undefined) {
        throw badRequest(`La línea ${entry.lineId} no pertenece a la orden ${so.number}`);
      }
      if (!D(pedido).minus(D(entry.qtyReceived)).equals(0)) {
        descuadres.push(
          `${entry.lineId}: pedido ${pedido.toString()} / recibido ${entry.qtyReceived}`,
        );
      }
    }
    if (descuadres.length > 0 && input.result === 'ok') {
      throw badRequest(
        'Hay cantidades que no cuadran, así que el resultado no puede ser "ok": ' +
          descuadres.join('; '),
        { discrepancies: descuadres },
      );
    }
  }

  const receivedAt = parseDateOnly(input.receivedAt);

  // Una reverificación (p. ej. tras una incidencia) reemplaza la anterior.
  await db.receiptVerification.deleteMany({ where: { serviceOrderId } });
  await db.receiptVerification.create({
    data: {
      serviceOrderId,
      receivedAt,
      result: input.result,
      notes: input.notes ?? null,
      verifiedById: userId,
      batchId,
    },
  });

  return db.serviceOrder.update({
    where: { id: serviceOrderId },
    data: { status: RESULT_STATUS[input.result] },
  });
}

/**
 * Verificación AGRUPADA: N órdenes en una sola transacción.
 *
 * O se verifican todas o ninguna: a medio verificar, el lote dejaría
 * comisiones devengadas inconsistentes. Cada orden guarda además el lote, así
 * que se puede auditar después qué se verificó junto con qué.
 */
export async function batchVerify(
  db: PrismaClient,
  input: BatchVerifyInput,
  userId: string | null,
) {
  const { serviceOrderIds, ...rest } = input;
  const unicos = [...new Set(serviceOrderIds)];
  if (unicos.length !== serviceOrderIds.length) {
    throw badRequest('Hay identificadores de orden repetidos en la selección');
  }

  return db.$transaction(
    async (tx) => {
      const reference = await nextDocumentNumber(
        tx,
        'VERIFICATION_BATCH',
        parseDateOnly(rest.receivedAt),
      );
      const batch = await tx.verificationBatch.create({
        data: { reference, notes: rest.notes ?? null, verifiedById: userId },
      });

      const results = [];
      for (const id of unicos) {
        const so = await verifyServiceOrder(tx, id, rest, userId, batch.id);
        results.push({ id: so.id, number: so.number, status: so.status });
      }

      const counts = results.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      }, {});

      return { batch, results, counts };
    },
    { timeout: 15000 },
  );
}
