import { describe, expect, it } from 'vitest';
import { detectSafetyEscalation, safetyEscalationResponse } from '../safety';

describe('deterministic conversation safety', () => {
  it.each([
    ['HELP', 'human_requested'],
    ['HUMAN', 'human_requested'],
    ['I want to talk to a real person', 'human_requested'],
    ["I fell and can't walk", 'urgent_health_concern'],
    ['I recently fell and hurt my knee', 'urgent_health_concern'],
    ['I have a billing dispute', 'legal_or_billing'],
    ['Does my insurance cover this?', 'insurance_question'],
    ['Is this covered by my health plan?', 'insurance_question'],
    ["This isn't working", 'high_frustration'],
  ] as const)('classifies %s', (content, reason) => {
    expect(detectSafetyEscalation(content, 'HUMAN')).toBe(reason);
  });

  it('does not treat ordinary scheduling language as an escalation', () => {
    for (const content of [
      'Can you help me book next Tuesday?',
      'I fell asleep waiting for your reply',
      'Do you provide evening coverage?',
    ]) {
      expect(detectSafetyEscalation(content, 'HUMAN')).toBeNull();
    }
  });

  it('returns a distinct urgent response without inventing contact details', () => {
    const response = safetyEscalationResponse(
      'urgent_health_concern',
      'Movement Clinic',
    );
    expect(response).toContain('local emergency services');
    expect(response).toContain('Movement Clinic');
    expect(response).not.toMatch(/\+\d/);
  });
});
