import { z } from 'zod';
import { AppError } from './errors';

/** Valida y estrecha la entrada con Zod, o lanza un 400 con el detalle. */
export function parseOrThrow<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Datos no válidos', result.error.flatten());
  }
  return result.data;
}

/** Igual, pero sobre params/query (que llegan como strings). */
export function parseQueryOrThrow<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  return parseOrThrow(schema, data);
}
