import { describe, expect, it } from 'vitest';
import { isInternalPath, safeNext } from '../safe-next';

const ORIGIN = 'https://app.example.com';

describe('safeNext', () => {
  it('keeps an internal path, query string included', () => {
    expect(safeNext('/reset-password?x=1', ORIGIN)).toBe('/reset-password?x=1');
    expect(safeNext('/today', ORIGIN)).toBe('/today');
  });

  it('falls back when there is no target', () => {
    expect(safeNext(null, ORIGIN)).toBe('/today');
    expect(safeNext('', ORIGIN)).toBe('/today');
    expect(safeNext('/', ORIGIN)).toBe('/today');
  });

  it('rejects protocol-relative and absolute targets', () => {
    expect(safeNext('//evil.example.com', ORIGIN)).toBe('/today');
    expect(safeNext('https://evil.example.com', ORIGIN)).toBe('/today');
    expect(safeNext('today', ORIGIN)).toBe('/today');
  });

  it('rejects backslash targets that resolve cross-origin', () => {
    // new URL('/\\evil.example.com', origin).host === 'evil.example.com'
    expect(safeNext('/\\evil.example.com', ORIGIN)).toBe('/today');
    expect(safeNext('/\\/evil.example.com', ORIGIN)).toBe('/today');
    expect(safeNext('\\\\evil.example.com', ORIGIN)).toBe('/today');
  });

  it('rejects control characters the URL parser strips before parsing', () => {
    expect(safeNext('/\t/evil.example.com', ORIGIN)).toBe('/today');
    expect(safeNext('/\n/evil.example.com', ORIGIN)).toBe('/today');
    expect(safeNext('/\r/evil.example.com', ORIGIN)).toBe('/today');
  });

  it('is a real cross-origin escape without the guard', () => {
    // Pins the parser behaviour the guard exists for.
    expect(new URL('/\\evil.example.com', ORIGIN).origin).toBe(
      'https://evil.example.com',
    );
    // Raw TAB/LF/CR pass any character-class test — they are removed from the
    // input, not encoded — and Node lets a TAB through into a Location header.
    expect(new URL('/\t/evil.example.com', ORIGIN).origin).toBe(
      'https://evil.example.com',
    );
  });
});

describe('isInternalPath', () => {
  it('accepts rooted paths only', () => {
    expect(isInternalPath('/today')).toBe(true);
    expect(isInternalPath('/settings/services?from=onboarding')).toBe(true);
    expect(isInternalPath('//evil.example.com')).toBe(false);
    expect(isInternalPath('/\\evil.example.com')).toBe(false);
    expect(isInternalPath('https://evil.example.com')).toBe(false);
    expect(isInternalPath('')).toBe(false);
  });

  // It is exported as a standalone guard (app/onboarding/actions.ts uses it on a
  // form field with no origin to compare against), so it has to carry the same
  // resolve check safeNext does — a shape test alone lets these through.
  it('rejects control characters on its own, without a caller-supplied origin', () => {
    expect(isInternalPath('/\t/evil.example.com')).toBe(false);
    expect(isInternalPath('/\n/evil.example.com')).toBe(false);
    expect(isInternalPath('/\r/evil.example.com')).toBe(false);
  });
});
