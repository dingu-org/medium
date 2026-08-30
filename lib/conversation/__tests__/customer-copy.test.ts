import { describe, expect, it } from 'vitest';
import {
  businessLabel,
  escalationMessage,
  handoffOfferMessage,
  nonTextNoticeMessage,
  DEFAULT_BUSINESS_LABEL_SQ,
} from '../customer-copy';

const ALL = [
  handoffOfferMessage('Studio Elira'),
  escalationMessage('Studio Elira'),
  nonTextNoticeMessage('Studio Elira'),
];

describe('customer copy', () => {
  it('asks a plain question and names no answer word', () => {
    expect(handoffOfferMessage('Studio Elira')).toBe(
      "Mund të ndihmoj vetëm me takimet. Dëshironi t'ia kaloj këtë pyetje Studio Elira?",
    );
  });

  it('says a person has the conversation, and promises no time', () => {
    expect(escalationMessage('Studio Elira')).toBe(
      "Këtë bisedë ia kalova Studio Elira — do t'ju përgjigjen personalisht sa më shpejt.",
    );
  });

  it('tells a customer who sent media both halves: what happened, and what to do', () => {
    const notice = nonTextNoticeMessage('Studio Elira');
    // What happened to what they sent...
    expect(notice).toContain('ia kalova Studio Elira');
    // ...and how to get an appointment anyway.
    expect(notice).toContain('me tekst');
  });

  /**
   * The escalation sentence is sent for a model escalation, an accepted offer, a
   * crashed turn AND a billing cap. The customer must not be able to tell which:
   * a cap is the business's problem and a crash is ours, and neither is
   * something they can act on. This is the tripwire against a well-meant
   * "we have reached our monthly limit" being added back.
   */
  it.each(['limit', 'kufi', 'plan', 'gabim', 'problem', 'teknik', 'sistem'])(
    'never mentions %j in any customer sentence',
    (word) => {
      for (const message of ALL) {
        expect(message.toLowerCase()).not.toContain(word);
      }
    },
  );

  // Medium books appointments for barbers and nail salons as much as for
  // physiotherapists, and it is not an emergency channel.
  it.each(ALL)('stays vertical-neutral in %j', (message) => {
    expect(message.toLowerCase()).not.toMatch(
      /fizioterap|terapi|mjek|klinik|urgjenc|spital|ambulanc|shëndet/,
    );
  });

  it('falls back to a neutral label when the business has no name', () => {
    expect(businessLabel(null)).toBe(DEFAULT_BUSINESS_LABEL_SQ);
    expect(businessLabel('   ')).toBe(DEFAULT_BUSINESS_LABEL_SQ);
    expect(businessLabel('Studio Elira')).toBe('Studio Elira');
    // The label is dative, so it has to read correctly inside every sentence.
    expect(escalationMessage(DEFAULT_BUSINESS_LABEL_SQ)).toContain(
      'ia kalova biznesit',
    );
  });
});
