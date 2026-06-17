import { describe, expect, it } from 'vitest';
import { privacyName } from '../name';

describe('privacyName', () => {
  it('renders first name + last initial', () => {
    expect(privacyName('John Doe')).toBe('John D.');
    expect(privacyName('maria garcia lopez')).toBe('maria l.');
  });

  it('keeps a single name as-is', () => {
    expect(privacyName('Cher')).toBe('Cher');
  });

  it('collapses extra whitespace', () => {
    expect(privacyName('  John   Doe  ')).toBe('John D.');
  });

  it('falls back for empty input', () => {
    expect(privacyName('')).toBe('Patient');
    expect(privacyName('   ')).toBe('Patient');
  });
});
