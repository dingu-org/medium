import { describe, expect, it, vi } from 'vitest';
import { testNowUtc } from '@/tests/support/clock';

vi.mock('node:fs', () => ({
  readFileSync: () => {
    throw new Error('System prompts must not be loaded from the filesystem');
  },
}));

describe('buildSystemPrompt bundle safety', () => {
  it('builds without reading a runtime asset', async () => {
    const { buildSystemPrompt } = await import('../prompt');

    const prompt = buildSystemPrompt({
      practiceName: 'Example PT',
      timezone: 'Europe/Tirane',
      aiName: null,
      aiGreeting: null,
      title: null,
      address: null,
      retentionDays: 30,
      now: testNowUtc(),
    });

    expect(prompt).toContain(
      'You are an automated scheduling assistant for a solo physical therapist.',
    );
  });
});
