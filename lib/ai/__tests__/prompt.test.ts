import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../prompt';

describe('buildSystemPrompt', () => {
  it('renders current PT context and safe defaults without inventing contact details', () => {
    const prompt = buildSystemPrompt({
      practiceName: null,
      timezone: 'Europe/Tirane',
      aiName: null,
      aiGreeting: null,
      escalationKeyword: null,
      retentionDays: 90,
      now: new Date('2026-06-10T10:00:00.000Z'),
    });

    expect(prompt).toContain('praktika e fizioterapisë');
    expect(prompt).toContain('Europe/Tirane');
    expect(prompt).toContain('2026-06-10T10:00:00.000Z');
    expect(prompt).toContain(
      'Practice-local current time: e mërkurë, 10 qershor 2026 në 12:00',
    );
    expect(prompt).toMatch(
      /Practice-local current time: .* (?:GMT\+0?2(?::00)?|EEST)/,
    );
    expect(prompt).toContain('Human escalation keyword: NDIHMË');
    expect(prompt).not.toContain('Patient display name');
    expect(prompt).toContain('Do not invent a clinic address');
  });

  it('uses configured assistant fields', () => {
    const prompt = buildSystemPrompt({
      practiceName: 'Movement Clinic',
      timezone: 'Europe/Berlin',
      aiName: 'Mia',
      aiGreeting: 'Welcome to Movement Clinic.',
      escalationKeyword: 'HUMAN',
      retentionDays: 60,
      configuredServices: [{ name: 'Vlerësim i parë', durationMinutes: 45 }],
    });

    expect(prompt).toContain('Assistant name: Mia');
    expect(prompt).toContain(
      'Greeting for a new conversation: Welcome to Movement Clinic.',
    );
    expect(prompt).toContain('Human escalation keyword: HUMAN');
    expect(prompt).toContain('Vlerësim i parë: 45 minuta');
    expect(prompt).toContain('formal Albanian');
  });

  it('fails explicitly for an invalid practice timezone', () => {
    expect(() =>
      buildSystemPrompt({
        practiceName: 'Movement Clinic',
        timezone: 'Invalid/Timezone',
        aiName: 'Mia',
        aiGreeting: null,
        escalationKeyword: null,
        retentionDays: 90,
        now: new Date('2026-06-10T10:00:00.000Z'),
      }),
    ).toThrow(RangeError);
  });
});
