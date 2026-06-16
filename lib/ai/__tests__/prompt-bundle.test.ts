import { describe, expect, it, vi } from 'vitest';

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
      escalationKeyword: null,
      retentionDays: 30,
      now: new Date('2026-06-15T12:00:00.000Z'),
    });

    expect(prompt).toContain(
      'You are an automated scheduling assistant for a solo physical therapist.',
    );
  });
});
