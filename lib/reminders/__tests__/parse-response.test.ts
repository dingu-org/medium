import { describe, expect, it } from 'vitest';
import { parseReminderResponse } from '../parse-response';

describe('parseReminderResponse', () => {
  it.each([
    ['CONFIRM', 'confirm'],
    ['yes thanks', 'confirm'],
    ['!CONFIRM', 'confirm'],
    ['KONFIRMO', 'confirm'],
    ['ok', 'confirm'],
    ['sure.', 'confirm'],
    ['ja', 'confirm'],
    ['bestätige', 'confirm'],
    ['sì', 'confirm'],
    ['confermo grazie', 'confirm'],
    ['oui', 'confirm'],
    ['sí', 'confirm'],
    ['po', 'confirm'],
    ['Po, vij', 'confirm'],
    // Explicit command words are unambiguous, so length does not gate them.
    ['Konfirmo takimin per neser ju lutem', 'confirm'],
  ] as const)('parses confirm keyword %s', (input, intent) => {
    expect(parseReminderResponse(input)).toBe(intent);
  });

  it.each([
    ['ANULO', 'cancel'],
    ['Anulo takimin te lutem', 'cancel'],
    ['reschedule please', 'reschedule'],
  ] as const)(
    'resolves the explicit command %s regardless of message length',
    (input, intent) => {
      expect(parseReminderResponse(input)).toBe(intent);
    },
  );

  // A bare yes/no particle speaks only for a message that IS that answer. A
  // comma cannot separate "Po, do të vij" from "Po, por a mund ta zhvendos?",
  // so anything longer goes to the AI turn rather than risk cancelling or
  // confirming a real appointment on a misread.
  it.each([
    'Jo, nuk dua ta anuloj, thjesht dua ta ndryshoj orën',
    'jo, jo në atë orë por të nesërmen',
    'Po, por a mund ta zhvendos me një orë më vonë?',
    'Po, do të vij nesër patjetër',
  ])('leaves the ambiguous reply %s to the AI turn', (input) => {
    expect(parseReminderResponse(input)).toBeNull();
  });

  it.each(['si', 'Si mund ta ndryshoj orën?'])(
    'does not read the Albanian interrogative %s as a confirmation',
    (input) => {
      expect(parseReminderResponse(input)).toBeNull();
    },
  );

  it.each([
    'Po pyesja sa kushton seanca?',
    'Po ju shkruaj për diçka tjetër',
    'Po dërgoj foton e recetës',
  ])(
    'does not read the Albanian progressive particle in %s as a confirmation',
    (input) => {
      expect(parseReminderResponse(input)).toBeNull();
    },
  );

  it.each([
    ['CANCEL', 'cancel'],
    ['ANULO', 'cancel'],
    ['no', 'cancel'],
    ['n', 'cancel'],
    ['annulla', 'cancel'],
    ['annuler', 'cancel'],
    ['cancelar', 'cancel'],
    ['jo', 'cancel'],
    ['jo.', 'cancel'],
  ] as const)('parses cancel keyword %s', (input, intent) => {
    expect(parseReminderResponse(input)).toBe(intent);
  });

  // Cancelling destroys the booking, so a bare particle only cancels when the
  // message IS that particle. Keywords cannot tell "Jo, nuk mundem" ("no, I
  // can't") from "Jo, ndryshoj orën" ("no, I'll change the time"), so both go to
  // the AI turn rather than risk cancelling an appointment the patient is moving.
  it.each(['Jo, nuk mundem', 'Jo, ndryshoj orën', 'Jo, dua ricaktim'])(
    'does not cancel on the qualified negative %s',
    (input) => {
      expect(parseReminderResponse(input)).toBeNull();
    },
  );

  // An explicit command anywhere in a short reply outranks the leading particle.
  it.each([
    ['Jo, ricakto nesër', 'reschedule'],
    ['no, reschedule please', 'reschedule'],
    ['Jo, ndal kujtesat', 'opt_out'],
  ] as const)('reads %s by its explicit command, not its first word', (
    input,
    intent,
  ) => {
    expect(parseReminderResponse(input)).toBe(intent);
  });

  it.each([
    ['RESCHEDULE', 'reschedule'],
    ['RICAKTO', 'reschedule'],
    ['change it', 'reschedule'],
    ['move please', 'reschedule'],
    ['verschieben', 'reschedule'],
    ['sposta', 'reschedule'],
    ['déplacer', 'reschedule'],
    ['cambiar', 'reschedule'],
  ] as const)('parses reschedule keyword %s', (input, intent) => {
    expect(parseReminderResponse(input)).toBe(intent);
  });

  it('treats STOP as opt-out instead of cancellation', () => {
    expect(parseReminderResponse('STOP')).toBe('opt_out');
    expect(parseReminderResponse('stop please')).toBe('opt_out');
  });

  it.each(['I confirm', 'please cancel', 'maybe', '', '   !!!'])(
    'falls through when %s does not start with a keyword',
    (input) => {
      expect(parseReminderResponse(input)).toBeNull();
    },
  );
});
