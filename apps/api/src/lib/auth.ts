import type { FastifyInstance, FastifyRequest } from 'fastify';
import { forbidden, unauthorized } from './errors';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Rellenado por el guard de autenticación. */
    currentUser: SessionUser | null;
  }
  interface FastifyInstance {
    /** Exige un JWT válido y deja el usuario en `request.currentUser`. */
    authenticate: (req: FastifyRequest) => Promise<void>;
    /** Igual, pero además exige rol admin. */
    requireAdmin: (req: FastifyRequest) => Promise<void>;
    /** Firma un JWT de sesión para el usuario indicado. */
    issueToken: (user: SessionUser) => string;
  }
}

export function registerAuth(app: FastifyInstance): void {
  app.decorateRequest('currentUser', null);

  const authenticate = async (req: FastifyRequest): Promise<void> => {
    try {
      await req.jwtVerify();
    } catch {
      throw unauthorized('Token ausente o inválido');
    }
    // El id viaja en `sub` (claim estándar de JWT), no en `id`.
    const payload = req.user as {
      sub: string;
      email: string;
      name: string;
      role: string;
    };
    req.currentUser = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
  };

  const requireAdmin = async (req: FastifyRequest): Promise<void> => {
    await authenticate(req);
    if (req.currentUser?.role !== 'admin') {
      throw forbidden('Se requiere rol de administrador');
    }
  };

  const issueToken = (user: SessionUser): string =>
    app.jwt.sign({ sub: user.id, email: user.email, name: user.name, role: user.role });

  app.decorate('authenticate', authenticate);
  app.decorate('requireAdmin', requireAdmin);
  app.decorate('issueToken', issueToken);
}
