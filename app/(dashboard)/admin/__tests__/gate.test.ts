import { describe, expect, it } from 'vitest';
import { isAllowedAdminEmail } from '../gate';

describe('isAllowedAdminEmail', () => {
  it('rejects when ADMIN_EMAILS is unset', () => {
    expect(isAllowedAdminEmail('owner@example.com', undefined)).toBe(false);
  });

  it('rejects when ADMIN_EMAILS is empty', () => {
    expect(isAllowedAdminEmail('owner@example.com', '')).toBe(false);
  });

  it('rejects a non-matching email', () => {
    expect(
      isAllowedAdminEmail('someone-else@example.com', 'owner@example.com'),
    ).toBe(false);
  });

  it('rejects a missing user email', () => {
    expect(isAllowedAdminEmail(null, 'owner@example.com')).toBe(false);
    expect(isAllowedAdminEmail(undefined, 'owner@example.com')).toBe(false);
  });

  it('allows a matching email, case- and whitespace-insensitively', () => {
    expect(
      isAllowedAdminEmail(
        '  Owner@Example.com ',
        'other@example.com, Owner@example.com',
      ),
    ).toBe(true);
  });
});
