/** Error de negocio con código HTTP. Lo captura el manejador global. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what: string) =>
  new AppError(404, 'NOT_FOUND', `${what} no encontrado`);

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'CONFLICT', message, details);

export const unauthorized = (message = 'No autenticado') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'Sin permisos') => new AppError(403, 'FORBIDDEN', message);

/** Transición de estado no permitida. */
export const invalidTransition = (from: string, to: string) =>
  new AppError(
    409,
    'INVALID_TRANSITION',
    `No se puede pasar de "${from}" a "${to}"`,
  );
