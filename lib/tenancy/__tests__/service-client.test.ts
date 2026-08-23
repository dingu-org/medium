import { describe, expect, it } from 'vitest';
import { TenancyError, getServiceClient } from '@/lib/tenancy';

describe('getServiceClient', () => {
  it('throws TenancyError when accountId is missing', () => {
    expect(() => getServiceClient(undefined)).toThrow(TenancyError);
    expect(() => getServiceClient(null)).toThrow(TenancyError);
    expect(() => getServiceClient('')).toThrow(TenancyError);
  });

  it('throws TenancyError when accountId is not a UUID', () => {
    expect(() => getServiceClient('not-a-uuid')).toThrow(TenancyError);
    expect(() => getServiceClient('00000000-0000-0000-0000')).toThrow(TenancyError);
  });

  it('returns ctx with the same accountId for a valid UUID', () => {
    const accountId = '11111111-2222-3333-4444-555555555555';
    const ctx = getServiceClient(accountId);
    expect(ctx.accountId).toBe(accountId);
    expect(ctx.db).toBeDefined();
  });
});
