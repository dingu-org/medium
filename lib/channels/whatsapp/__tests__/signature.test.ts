import { createHmac } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { verifySignature } from '../signature';

const body = '{"hello":"world"}';
const secret = 'app-secret';
const goodHeader = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

describe('verifySignature', () => {
  it('accepts a correctly-signed body', () => {
    expect(verifySignature({ rawBody: body, header: goodHeader, secret })).toBe(true);
  });

  it('rejects a missing header', () => {
    expect(verifySignature({ rawBody: body, header: null, secret })).toBe(false);
  });

  it('rejects the wrong scheme prefix', () => {
    expect(verifySignature({ rawBody: body, header: 'sha1=abcd', secret })).toBe(false);
  });

  it('rejects a flipped bit in the signature', () => {
    const lastChar = goodHeader.slice(-1);
    const flipped = lastChar === '0' ? '1' : '0';
    const tampered = goodHeader.slice(0, -1) + flipped;
    expect(verifySignature({ rawBody: body, header: tampered, secret })).toBe(false);
  });

  it('rejects a body modified after signing', () => {
    expect(verifySignature({ rawBody: body + ' ', header: goodHeader, secret })).toBe(false);
  });

  it('rejects a signature signed with a different secret', () => {
    const wrongSecretHeader =
      'sha256=' + createHmac('sha256', 'other-secret').update(body).digest('hex');
    expect(verifySignature({ rawBody: body, header: wrongSecretHeader, secret })).toBe(false);
  });
});
