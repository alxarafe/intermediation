import type { Prisma, PrismaClient } from '@prisma/client';
import { yearOf } from './date';

export type DocumentKind = 'SALES_ORDER' | 'SERVICE_ORDER' | 'INVOICE' | 'VERIFICATION_BATCH';

const PREFIX: Record<DocumentKind, string> = {
  SALES_ORDER: 'P',
  SERVICE_ORDER: 'OS',
  INVOICE: 'F',
  VERIFICATION_BATCH: 'VB',
};

/**
 * Numeración correlativa y atómica por tipo y año.
 *
 * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` es atómico en Postgres, así
 * que dos peticiones simultáneas no pueden sacar el mismo número. La alternativa
 * naïve (leer el máximo y sumar uno) tiene una carrera entre el SELECT y el
 * INSERT.
 */
export async function nextDocumentNumber(
  db: PrismaClient | Prisma.TransactionClient,
  kind: DocumentKind,
  onDate: Date,
): Promise<string> {
  const year = yearOf(onDate);
  const rows = await db.$queryRaw<Array<{ value: number }>>`
    INSERT INTO document_sequences (kind, year, value)
    VALUES (${kind}, ${year}, 1)
    ON CONFLICT (kind, year)
    DO UPDATE SET value = document_sequences.value + 1
    RETURNING value
  `;
  const value = rows[0]?.value;
  if (value === undefined) throw new Error('No se pudo generar la numeración del documento');
  return `${PREFIX[kind]}-${year}-${String(value).padStart(5, '0')}`;
}
