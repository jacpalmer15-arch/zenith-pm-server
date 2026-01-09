import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function normalizeKey(secret: string): Buffer {
  if (/^[0-9a-f]{64}$/i.test(secret)) {
    return Buffer.from(secret, 'hex');
  }

  const base64 = Buffer.from(secret, 'base64');
  if (base64.length === KEY_LENGTH) {
    return base64;
  }

  return createHash('sha256').update(secret).digest();
}

export function encryptToken(value: string, secret: string): string {
  const key = normalizeKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptToken(value: string, secret: string): string {
  const key = normalizeKey(secret);
  const data = Buffer.from(value, 'base64');
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const payload = data.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
  return decrypted.toString('utf8');
}
