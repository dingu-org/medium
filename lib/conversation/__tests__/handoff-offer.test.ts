import { describe, expect, it } from 'vitest';
import {
  businessLabel,
  handoffAcceptedMessage,
  handoffOfferMessage,
  isHandoffAcceptance,
  DEFAULT_BUSINESS_LABEL_SQ,
} from '../handoff-offer';

describe('isHandoffAcceptance', () => {
  it.each(['PO', 'po', 'Po', 'pO', '  po  ', 'po\n'])(
    'accepts %j as the offered word',
    (content) => {
      expect(isHandoffAcceptance(content)).toBe(true);
    },
  );

  // Everything below is why the match is whole-message. 'po' is Albanian for
  // "yes" and the single most common thing a patient types, so a leading- or
  // contained-'po' rule would switch the assistant off mid-booking.
  it.each([
    'Po, e dua atë orar',
    'po ju lutem',
    'Po pyesja për orarin',
    'PO.',
    'jo',
    'ok',
    'Po? ',
    '',
  ])('leaves %j to the normal turn', (content) => {
    expect(isHandoffAcceptance(content)).toBe(false);
  });
});

describe('handoff offer copy', () => {
  it('names the business and the word the patient has to send back', () => {
    expect(handoffOfferMessage('Studio Elira')).toBe(
      "Mund të ndihmoj vetëm me takimet. Nëse dëshironi t'ia kaloj këtë pyetje Studio Elira, përgjigjuni me PO.",
    );
    expect(handoffAcceptedMessage('Studio Elira')).toContain('Studio Elira');
  });

  // The product books appointments for barbers and nail salons as well as
  // physiotherapists, so neither sentence may name a discipline or offer
  // emergency guidance.
  it.each([
    handoffOfferMessage('Studio Elira'),
    handoffAcceptedMessage('Studio Elira'),
    handoffOfferMessage(DEFAULT_BUSINESS_LABEL_SQ),
  ])('stays vertical-neutral in %j', (message) => {
    expect(message.toLowerCase()).not.toMatch(
      /fizioterap|terapi|mjek|klinik|urgjenc|shëndet/,
    );
  });

  it('falls back to a neutral label when the practice has no name', () => {
    expect(businessLabel(null)).toBe(DEFAULT_BUSINESS_LABEL_SQ);
    expect(businessLabel('   ')).toBe(DEFAULT_BUSINESS_LABEL_SQ);
    expect(businessLabel('Studio Elira')).toBe('Studio Elira');
  });
});
