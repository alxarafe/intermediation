import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEYLEN = 64;

/**
 * Hash con scrypt, incluido en Node — sin dependencias nativas que compilar
 * (bcrypt/argon2 darían problemas de build en Docker y en Windows).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, KEYLEN);
  return `scrypt:${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hex] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hex) return false;
  const key = await scrypt(password, salt, KEYLEN);
  const expected = Buffer.from(hex, 'hex');
  if (expected.length !== key.length) return false;
  return timingSafeEqual(key, expected);
}
