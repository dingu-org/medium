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

  // Albanian typed on a phone loses 'ë'/'ç' and gains U+2019 for the
  // apostrophe, and WhatsApp messages wrap across lines. None of that may
  // change the classification of an emergency.
  it.each([
    ['NDIHME', 'human_requested'],
    ['ndihme', 'human_requested'],
    ['nuk mund te marr fryme', 'urgent_health_concern'],
    ['Kam veshtiresi ne frymemarrje', 'urgent_health_concern'],
    ['Dua te flas me fizioterapistet', 'human_requested'],
    ['Do te flas me avokatin', 'legal_or_billing'],
    ['S’mund të ec', 'urgent_health_concern'],
    ['I can’t walk', 'urgent_health_concern'],
    ['Nuk mund\ntë marr frymë', 'urgent_health_concern'],
    ['Kam dhimbje\nnë gjoks', 'urgent_health_concern'],
  ] as const)('classifies unaccented or wrapped %s', (content, reason) => {
    expect(detectSafetyEscalation(content, 'HUMAN')).toBe(reason);
  });

  // A patient in an emergency writes the natural form, not the one the regex
  // was built around: singular agreement, an intensifier between noun and
  // adjective, and 'në gjoks' rather than the genitive 'gjoksi'.
  it.each([
    ['Kam dhimbje e fortë', 'urgent_health_concern'],
    ['Kam dhimbje shumë të forta', 'urgent_health_concern'],
    ['Kam dhimbje në gjoks', 'urgent_health_concern'],
    ['Kam dhimbje gjoksi', 'urgent_health_concern'],
    ['Kam dhimbje në kraharor', 'urgent_health_concern'],
    ['Është urgjente!', 'urgent_health_concern'],
    ['Faturimi është i gabuar', 'legal_or_billing'],
    ['Më keni faturuar gabim', 'legal_or_billing'],
    ['Asgjë nuk funksionon me ju', 'high_frustration'],
    ['Nuk funksionon fare!', 'high_frustration'],
  ] as const)('classifies natural Albanian phrasing %s', (content, reason) => {
    expect(detectSafetyEscalation(content, 'HUMAN')).toBe(reason);
  });

  // 'rimbursim' is Albanian for both refund and reimbursement, so the two
  // languages must land on the same canned reply.
  it('routes refund and reimbursement the same way in both languages', () => {
    for (const content of [
      'I want a refund',
      'I want a reimbursement',
      'Dua rimbursim',
    ]) {
      expect(detectSafetyEscalation(content, 'HUMAN')).toBe('legal_or_billing');
    }
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
      // 'në lidhje me' is standard Albanian for "regarding", so an open 'lidh'
      // stem escalated the most ordinary reschedule request there is.
      'Në lidhje me takimin me fizioterapistin, a mund ta ndryshoj?',
      'Në lidhje me pagesën',
      // Declining a proposed slot is not frustration.
      'E marta nuk funksionon, a keni të mërkurën?',
      'Ora 10 nuk funksionon për mua',
      'Linku nuk funksionon',
      // 'ambulancë' also means outpatient clinic.
      'Ku ndodhet ambulanca juaj?',
      // Negated severity must not read as severe pain.
      'Kam dhimbje jo të forta',
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
