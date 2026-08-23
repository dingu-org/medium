import { describe, expect, it, vi } from 'vitest';
import {
  compareMessages,
  normalizeTimestamp,
  nextRealtimeTopic,
} from '../realtime';

// The hook module imports useRouter at module scope; the helpers under test are
// pure, so a stub is enough to load it in the node environment.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

// The exact wire form realtime delivers for a timestamptz column.
const PG_TEXT = '2026-07-29 14:05:11.4+00';

describe('normalizeTimestamp', () => {
  it('rewrites the Postgres text form as ISO', () => {
    expect(normalizeTimestamp(PG_TEXT)).toBe('2026-07-29T14:05:11.400Z');
  });

  it('leaves an ISO value untouched', () => {
    expect(normalizeTimestamp('2026-07-29T10:00:00.123Z')).toBe(
      '2026-07-29T10:00:00.123Z',
    );
  });

  it('passes an unparseable value through', () => {
    expect(normalizeTimestamp('not-a-date')).toBe('not-a-date');
  });
});

describe('compareMessages', () => {
  const msg = (id: string, createdAt: string) => ({ id, createdAt });

  it('orders a live Postgres-text row after earlier ISO rows', () => {
    const list = [
      msg('c', PG_TEXT),
      msg('a', '2026-07-29T09:00:00.000Z'),
      msg('b', '2026-07-29T10:00:00.123Z'),
    ];
    expect([...list].sort(compareMessages).map((m) => m.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('compares instants, not strings', () => {
    // Same instant, different representations.
    expect(
      compareMessages(msg('x', '2026-07-29T14:05:11.400Z'), msg('x', PG_TEXT)),
    ).toBe(0);
  });

  it('breaks ties on id so the keyset cursor stays total', () => {
    const at = '2026-07-29T10:00:00.000Z';
    expect(
      [msg('b', at), msg('a', at)].sort(compareMessages).map((m) => m.id),
    ).toEqual(['a', 'b']);
  });

  it('sorts unparseable timestamps first without producing NaN', () => {
    const list = [msg('b', '2026-07-29T10:00:00.000Z'), msg('a', 'garbage')];
    expect([...list].sort(compareMessages).map((m) => m.id)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('nextRealtimeTopic', () => {
  it('never repeats a topic for the same table and filter', () => {
    const filter = 'account_id=eq.11111111-1111-4111-8111-111111111111';
    const first = nextRealtimeTopic('conversations', filter);
    const second = nextRealtimeTopic('conversations', filter);

    expect(first).not.toBe(second);
    expect(first).toContain('conversations');
    expect(first).toContain(filter);
  });

  it('labels an unfiltered subscription', () => {
    expect(nextRealtimeTopic('messages')).toMatch(/^rt-messages-all-\d+$/);
  });
});
