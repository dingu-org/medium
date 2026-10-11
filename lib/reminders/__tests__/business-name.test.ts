import { describe, expect, it } from 'vitest';
import { reminderBusinessName } from '../business-name';

describe('reminderBusinessName', () => {
  it('uses the business name, trimmed, in either language', () => {
    expect(reminderBusinessName('  Studio Vita ', 'sq')).toBe('Studio Vita');
    expect(reminderBusinessName('Studio Vita', 'en_US')).toBe('Studio Vita');
  });

  // The slot follows "me" in the Albanian templates, so the stand-in is
  // accusative ("takimi juaj me biznesin"), and it names no vertical.
  it('falls back to a neutral stand-in in the template language', () => {
    expect(reminderBusinessName(null, 'sq')).toBe('biznesin');
    expect(reminderBusinessName(null, 'en_US')).toBe('the business');
  });

  it('treats a blank name as missing', () => {
    expect(reminderBusinessName('', 'sq')).toBe('biznesin');
    expect(reminderBusinessName('   ', 'sq')).toBe('biznesin');
    expect(reminderBusinessName(' \t ', 'en_US')).toBe('the business');
  });
});
