import { describe, expect, it } from 'vitest';
import { missingMigrations } from '../check-migrations';

const entries = [
  { when: 100, tag: '0000_init' },
  { when: 200, tag: '0001_schema' },
  { when: 300, tag: '0002_rls' },
];

describe('missingMigrations', () => {
  it('is empty when everything in the journal is applied', () => {
    expect(missingMigrations(entries, new Set([100, 200, 300]))).toEqual([]);
  });

  // Migrate-then-merge means the DB is routinely ahead of the code.
  it('ignores applied migrations the journal does not know about', () => {
    expect(missingMigrations(entries, new Set([100, 200, 300, 400]))).toEqual([]);
  });

  it('names exactly the journal entries that were never applied', () => {
    expect(missingMigrations(entries, new Set([100]))).toEqual([
      { when: 200, tag: '0001_schema' },
      { when: 300, tag: '0002_rls' },
    ]);
  });

  it('reports everything missing against an unmigrated database', () => {
    expect(missingMigrations(entries, new Set())).toHaveLength(3);
  });
});
