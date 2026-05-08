import { describe, expect, it } from 'vitest';
import { TenancyError, getServiceClient } from '@/lib/tenancy';

describe('getServiceClient', () => {
  it('throws TenancyError when ptId is missing', () => {
    expect(() => getServiceClient(undefined)).toThrow(TenancyError);
    expect(() => getServiceClient(null)).toThrow(TenancyError);
    expect(() => getServiceClient('')).toThrow(TenancyError);
  });

  it('throws TenancyError when ptId is not a UUID', () => {
    expect(() => getServiceClient('not-a-uuid')).toThrow(TenancyError);
    expect(() => getServiceClient('00000000-0000-0000-0000')).toThrow(TenancyError);
  });

  it('returns ctx with the same ptId for a valid UUID', () => {
    const ptId = '11111111-2222-3333-4444-555555555555';
    const ctx = getServiceClient(ptId);
    expect(ctx.ptId).toBe(ptId);
    expect(ctx.db).toBeDefined();
  });
});
