import { config } from 'dotenv';
import { resolve } from 'node:path';

// El .env vive en la raíz del monorepo; también se admite uno local en apps/api.
config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(__dirname, '../.env') });

function str(key: string, fallback?: string): string {
  const v = process.env[key];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Falta la variable de entorno ${key}`);
  }
  return v;
}

function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`${key} debe ser un número, recibido: ${v}`);
  return n;
}

export const env = {
  nodeEnv: str('NODE_ENV', 'development'),
  get isProduction() {
    return this.nodeEnv === 'production';
  },
  port: num('API_PORT', 3000),
  host: str('API_HOST', '0.0.0.0'),
  corsOrigin: str('CORS_ORIGIN', 'http://localhost:4200'),
  jwtSecret: str('JWT_SECRET', 'dev-secret-cambiar-en-produccion'),
  jwtExpiresIn: str('JWT_EXPIRES_IN', '8h'),
  /**
   * IVA por defecto de las facturas de comisión. 0 = exportación
   * (Canarias -> Península), que es el caso real de este negocio.
   */
  defaultTaxPct: num('DEFAULT_TAX_PCT', 0),
};
