import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import Fastify, { type FastifyInstance } from 'fastify';
import { AppError } from './lib/errors';
import { registerAuth } from './lib/auth';
import { env } from './env';
import { authRoutes } from './modules/auth/routes';
import { articleRoutes } from './modules/articles/routes';
import { customerRoutes } from './modules/customers/routes';
import { dashboardRoutes } from './modules/dashboard/routes';
import { factoryRoutes } from './modules/factories/routes';
import { invoiceRoutes } from './modules/invoices/routes';
import { priceListRoutes } from './modules/price-lists/routes';
import { priceRoutes } from './modules/prices/routes';
import { salesOrderRoutes } from './modules/sales-orders/routes';
import { serviceOrderRoutes } from './modules/service-orders/routes';
import { prisma } from './prisma';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.isProduction
      ? { level: 'info' }
      : { level: 'info', transport: undefined },
    ajv: { customOptions: { removeAdditional: false, coerceTypes: true } },
  });

  await app.register(cors, { origin: env.corsOrigin.split(','), credentials: true });
  await app.register(jwt, { secret: env.jwtSecret });
  registerAuth(app);

  // --- Error handler: los AppError llevan status y código propios ---
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof AppError) {
      return reply
        .code(error.statusCode)
        .send({ error: { code: error.code, message: error.message, details: error.details } });
    }
    // Violación de unicidad de Postgres o de Prisma.
    const code = (error as { code?: string }).code;
    if (code === 'P2002') {
      return reply.code(409).send({
        error: { code: 'DUPLICATE', message: 'Ya existe un registro con esos datos únicos' },
      });
    }
    if (code === 'P2025') {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Registro no encontrado' } });
    }
    req.log.error(error);
    return reply.code(500).send({ error: { code: 'INTERNAL', message: 'Error interno' } });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: `Ruta no encontrada: ${req.url}` } });
  });

  app.get('/health', async () => ({ status: 'ok', service: 'intermediacion-api' }));

  // --- Público ---
  await app.register(authRoutes, { prefix: '/api' });

  // --- Protegido con JWT ---
  await app.register(
    async (scope) => {
      scope.addHook('onRequest', scope.authenticate);
      await scope.register(articleRoutes);
      await scope.register(customerRoutes);
      await scope.register(dashboardRoutes);
      await scope.register(factoryRoutes);
      await scope.register(invoiceRoutes);
      await scope.register(priceListRoutes);
      await scope.register(priceRoutes);
      await scope.register(salesOrderRoutes);
      await scope.register(serviceOrderRoutes);
    },
    { prefix: '/api' },
  );

  return app;
}

export async function closeApp(app: FastifyInstance): Promise<void> {
  await app.close();
  await prisma.$disconnect();
}
