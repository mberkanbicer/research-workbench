import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';

const BCRYPT_PREFIX = 'bcrypt:';
const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  return `${BCRYPT_PREFIX}${hash}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  if (stored.startsWith(BCRYPT_PREFIX)) {
    const hash = stored.slice(BCRYPT_PREFIX.length);
    const valid = await bcrypt.compare(password, hash);
    return { valid, needsUpgrade: false };
  }

  const [salt, hash] = stored.split(':');
  if (!salt || !hash) {
    return { valid: false, needsUpgrade: false };
  }

  const computed = createHash('sha256').update(salt + password).digest('hex');
  const valid = hash === computed;
  return { valid, needsUpgrade: valid };
}