import type { FastifyInstance } from 'fastify';
import { CreateUserInput, LoginInput } from '@intermediacion/shared';
import { hashPassword, verifyPassword } from '../../lib/password';
import { unauthorized } from '../../lib/errors';
import { parseOrThrow } from '../../lib/validate';
import { toUserDto } from '../../lib/serialize';
import { prisma } from '../../prisma';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', async (req) => {
    const body = parseOrThrow(LoginInput, req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    // Mismo mensaje para usuario inexistente y contraseña mala: no revelamos
    // qué emails existen.
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw unauthorized('Credenciales no válidas');
    }
    const session = { id: user.id, email: user.email, name: user.name, role: user.role };
    return { token: app.issueToken(session), user: toUserDto(user) };
  });

  app.get('/auth/me', { preHandler: app.authenticate }, async (req) => {
    const user = await prisma.user.findUnique({ where: { id: req.currentUser!.id } });
    if (!user) throw unauthorized('El usuario ya no existe');
    return toUserDto(user);
  });

  app.post(
    '/auth/users',
    { preHandler: app.requireAdmin },
    async (req, reply) => {
      const body = parseOrThrow(CreateUserInput, req.body);
      const user = await prisma.user.create({
        data: {
          email: body.email,
          name: body.name,
          role: body.role,
          passwordHash: await hashPassword(body.password),
        },
      });
      reply.code(201);
      return toUserDto(user);
    },
  );

  app.get('/auth/users', { preHandler: app.requireAdmin }, async () => {
    const users = await prisma.user.findMany({ orderBy: { name: 'asc' } });
    return { items: users.map(toUserDto), total: users.length };
  });
}
