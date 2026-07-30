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

  it('is a real cross-origin escape without the guard', () => {
    // Pins the parser behaviour the guard exists for.
    expect(new URL('/\\evil.example.com', ORIGIN).origin).toBe(
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
});
