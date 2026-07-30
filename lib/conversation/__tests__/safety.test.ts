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
    ['I want a refund', 'legal_or_billing'],
    ['I was overcharged', 'legal_or_billing'],
    ['Does my insurance cover this?', 'insurance_question'],
    ['Is this covered by my health plan?', 'insurance_question'],
    ["This isn't working", 'high_frustration'],
    ['NDIHMË', 'human_requested'],
    ['Dua të flas me një person të vërtetë', 'human_requested'],
    ['Kam vështirësi në frymëmarrje', 'urgent_health_concern'],
  ] as const)('classifies %s', (content, reason) => {
    expect(detectSafetyEscalation(content, 'HUMAN')).toBe(reason);
  });

  // Albanian words ending in 'ë' never matched the old ASCII \b patterns, so
  // the most likely emergency words were silently ignored.
  it.each([
    ['Kam urgjencë', 'urgent_health_concern'],
    ['Duhet ambulancë tani', 'urgent_health_concern'],
    ['urgjencë!', 'urgent_health_concern'],
    ['Nuk mund të marr frymë', 'urgent_health_concern'],
    ['Kam dhimbje të forta', 'urgent_health_concern'],
    ['Dua një terapist të vërtetë', 'human_requested'],
    ['Dua të flas me dikë', 'human_requested'],
    ['Dua të flas me fizioterapistin', 'human_requested'],
    ['Më lidhni me një person', 'human_requested'],
    ['Do të flas me avokatin', 'legal_or_billing'],
    ['Kam një faturë e gabuar', 'legal_or_billing'],
    ['Kam sigurimin shëndetësor', 'insurance_question'],
    ['Jam shumë e frustruar', 'high_frustration'],
  ] as const)('classifies inflected Albanian %s', (content, reason) => {
    expect(detectSafetyEscalation(content, 'HUMAN')).toBe(reason);
  });

  it('does not treat ordinary scheduling language as an escalation', () => {
    for (const content of [
      'Can you help me book next Tuesday?',
      'I fell asleep waiting for your reply',
      'Do you provide evening coverage?',
      'A ka orare urgjente për javën tjetër?',
      // Albanian nouns here are nearly always definite, so an open-ended stem
      // match on 'fizioterapist'/'person' turned the product's most common
      // intent into a permanent handoff.
      'Dua një takim me fizioterapistin',
      'Dua terapi personale',
      'Dua një trajtim personal',
    ]) {
      expect(detectSafetyEscalation(content, 'HUMAN')).toBeNull();
    }
  });

  // Prices live in the prompt (Phase 15), so a plain price question must reach
  // the model instead of being escalated by the billing net.
  it('lets price questions through to the model', () => {
    for (const content of [
      'How much do you charge for a first assessment?',
      'What does the first session cost?',
      'Can I get an invoice for the session?',
      'Sa kushton seanca e parë?',
      'Sa është pagesa për seancën?',
    ]) {
      expect(detectSafetyEscalation(content, 'HUMAN')).toBeNull();
    }
  });

  it('returns a distinct urgent response without inventing contact details', () => {
    const response = safetyEscalationResponse(
      'urgent_health_concern',
      'Movement Clinic',
    );
    expect(response).toContain('shërbimet vendore të urgjencës');
    expect(response).toContain('Movement Clinic');
    expect(response).not.toMatch(/\+\d/);
  });
});
