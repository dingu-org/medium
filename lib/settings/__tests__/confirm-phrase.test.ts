import { describe, expect, it } from 'vitest';
import {
  CONFIRM_PHRASE_FALLBACK,
  confirmMatches,
  confirmPhrase,
} from '../confirm-phrase';

describe('confirmPhrase', () => {
  it('uses the first non-blank candidate', () => {
    expect(confirmPhrase('Fizio Tirana')).toBe('Fizio Tirana');
    expect(confirmPhrase('  Fizio Tirana  ')).toBe('Fizio Tirana');
    expect(confirmPhrase('', 'account@example.com')).toBe('account@example.com');
  });

  it('falls back when every candidate is blank or missing', () => {
    expect(confirmPhrase('')).toBe(CONFIRM_PHRASE_FALLBACK);
    expect(confirmPhrase('   ')).toBe(CONFIRM_PHRASE_FALLBACK);
    expect(confirmPhrase(null, undefined)).toBe(CONFIRM_PHRASE_FALLBACK);
  });
});

describe('confirmMatches', () => {
  it('matches the trimmed phrase', () => {
    expect(confirmMatches('Fizio Tirana', 'Fizio Tirana')).toBe(true);
    expect(confirmMatches('Fizio Tirana', '  Fizio Tirana ')).toBe(true);
  });

  it('rejects a different or partial phrase', () => {
    expect(confirmMatches('Fizio Tirana', 'fizio tirana')).toBe(false);
    expect(confirmMatches('Fizio Tirana', 'Fizio')).toBe(false);
  });

  it('never matches against a blank phrase', () => {
    // The pre-fix defect: '' === '' armed the delete button on open.
    expect(confirmMatches('', '')).toBe(false);
    expect(confirmMatches('   ', '')).toBe(false);
    expect(confirmMatches('   ', '   ')).toBe(false);
  });

  it('never matches a blank input', () => {
    expect(confirmMatches('Fizio Tirana', '')).toBe(false);
    expect(confirmMatches('Fizio Tirana', '   ')).toBe(false);
  });

  it('the dialog wiring cannot arm with an unset practice name', () => {
    const phrase = confirmPhrase('');
    expect(confirmMatches(phrase, '')).toBe(false);
    expect(confirmMatches(phrase, CONFIRM_PHRASE_FALLBACK)).toBe(true);
  });
});
