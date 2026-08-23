import { describe, expect, it } from 'vitest';
import { parseReplyIntent } from '@/lib/language/reply-intent';
import {
  businessLabel,
  handoffAcceptedMessage,
  handoffOfferMessage,
  isHandoffAcceptance,
  DEFAULT_BUSINESS_LABEL_SQ,
} from '../handoff-offer';

describe('isHandoffAcceptance', () => {
  it.each([
    'PO',
    'po',
    'Po',
    'pO',
    '  po  ',
    'po\n',
    // Punctuation and the everyday variants of yes. This is where the offer
    // used to disagree with the reminder: it demanded exact equality with PO,
    // so all of these fell into the gap between the two definitions.
    'PO.',
    'Po? ',
    'ok',
    'okay',
    'dakord',
    'po faleminderit',
  ])('accepts %j', (content) => {
    expect(isHandoffAcceptance(content)).toBe(true);
  });

  // 'po' is Albanian for "yes" and the single most common thing a customer
  // types, including to take a proposed time slot, so the parse still refuses
  // anything that is not essentially the bare answer — a contained 'po' would
  // switch the assistant off mid-booking. What bounds the rest is the caller:
  // only the message directly after the offer can accept it at all.
  it.each([
    'Po, e dua atë orar',
    'po ju lutem',
    // The progressive particle: "I was asking about the hours" is a question.
    'Po pyesja për orarin',
    'Po pyesja për oraret',
    'jo',
    'Ok anuloj',
    '',
  ])('leaves %j to the normal turn', (content) => {
    expect(isHandoffAcceptance(content)).toBe(false);
  });

  /**
   * The seam. Both subsystems have to mean the same thing by "yes", or the
   * most-recent-question-wins rule in `resolveInboundClaim` never sees the
   * messages that fall between two definitions — which is exactly how
   * "po faleminderit" confirmed an appointment nobody had asked about while the
   * customer's real question was dropped.
   */
  it.each([
    'po',
    'PO.',
    'dakord',
    'ok',
    'okay',
    'po faleminderit',
    'Po pyesja për oraret',
    'Ok anuloj',
    'anulo',
    'jo',
  ])('accepts exactly what the reminder confirms, for %j', (content) => {
    expect(isHandoffAcceptance(content)).toBe(
      parseReplyIntent(content) === 'confirm',
    );
  });
});

describe('handoff offer copy', () => {
  it('names the business and the word the customer has to send back', () => {
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
