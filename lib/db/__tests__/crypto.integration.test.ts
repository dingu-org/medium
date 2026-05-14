import { describe, it, expect } from 'vitest';
import { encryptToken, decryptToken } from '../crypto';

describe('lib/db/crypto (integration)', () => {
  it('round-trips a plaintext token through pgcrypto', async () => {
    const plaintext = 'EAABwzLixnjYBO0_super_secret_meta_token';
    const ciphertext = await encryptToken(plaintext);

    expect(ciphertext).toBeInstanceOf(Uint8Array);
    expect(ciphertext.byteLength).toBeGreaterThan(0);
    expect(Buffer.from(ciphertext).toString('utf8')).not.toContain(plaintext);

    const recovered = await decryptToken(ciphertext);
    expect(recovered).toBe(plaintext);
  });

  it('produces a different ciphertext each call (non-deterministic)', async () => {
    const a = await encryptToken('same input');
    const b = await encryptToken('same input');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});
