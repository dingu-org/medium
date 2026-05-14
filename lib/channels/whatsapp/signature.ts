import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifySignature(opts: {
  rawBody: string;
  header: string | null;
  secret: string;
}): boolean {
  const { rawBody, header, secret } = opts;
  if (!header?.startsWith('sha256=')) return false;

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(header.slice('sha256='.length), 'hex');
  } catch {
    return false;
  }

  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
