import { buildApp } from './app';
import { env } from './env';
import { prisma } from './prisma';

async function main(): Promise<void> {
  const app = await buildApp();

  // Fallar pronto y con mensaje claro es mejor que un 500 en la primera
  // petición si el Postgres no está levantado.
  try {
    await prisma.$connect();
  } catch (error) {
    app.log.error(
      { err: error },
      'No se pudo conectar con la base de datos. ¿Está docker compose up -d postgres?',
    );
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} recibido, cerrando...`);
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: env.port, host: env.host });
  app.log.info(`API de intermediación escuchando en http://${env.host}:${env.port}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
