import { describe, expect, it } from 'vitest';
import { parseReminderResponse } from '../parse-response';

describe('parseReminderResponse', () => {
  it.each([
    ['KONFIRMO', 'confirm'],
    ['konfirmoj', 'confirm'],
    ['ok', 'confirm'],
    ['Okay.', 'confirm'],
    ['dakord', 'confirm'],
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
    ['Ricakto takimin per javen tjeter', 'reschedule'],
  ] as const)(
    'resolves the explicit command %s regardless of message length',
    (input, intent) => {
      expect(parseReminderResponse(input)).toBe(intent);
    },
  );

  // Albanian-only: the German/Italian/French/Spanish/English sets are gone,
  // because nothing else in the product speaks those languages and 'si'/'ja'
  // collided head-on with everyday Albanian words.
  it.each([
    'yes',
    'y',
    'sure',
    'ja',
    'bestätige',
    'sì',
    'confermo grazie',
    'oui',
    'sí',
    'no',
    'n',
    'nein',
    'annulla',
    'annuler',
    'cancelar',
    'verschieben',
    'sposta',
    'déplacer',
    'cambiar',
    'CONFIRM',
    'CANCEL',
    'RESCHEDULE',
    'change it',
    'move please',
  ])('no longer recognises the non-Albanian keyword %s', (input) => {
    expect(parseReminderResponse(input)).toBeNull();
  });

  // A bare yes/no particle speaks only for a message that IS that answer. A
  // comma cannot separate "Po, do të vij" from "Po, por a mund ta zhvendos?",
  // so anything longer goes to the AI turn rather than risk cancelling or
  // confirming a real appointment on a misread.
  it.each([
    'Jo, nuk dua ta anuloj, thjesht dua ta ndryshoj orën',
    'jo, jo në atë orë por të nesërmen',
    'Po, por a mund ta zhvendos me një orë më vonë?',
    'Po, do të vij nesër patjetër',
    'Dakord, por a mund ta ndryshoj orën nesër?',
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
    ['ANULO', 'cancel'],
    ['anuloj', 'cancel'],
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
    ['Jo, ndal kujtesat', 'opt_out'],
    ['Po, aktivizo kujtesat', 'opt_in'],
  ] as const)(
    'reads %s by its explicit command, not its first word',
    (input, intent) => {
      expect(parseReminderResponse(input)).toBe(intent);
    },
  );

  it.each([
    ['RICAKTO', 'reschedule'],
    ['ricaktoj', 'reschedule'],
  ] as const)('parses reschedule keyword %s', (input, intent) => {
    expect(parseReminderResponse(input)).toBe(intent);
  });

  it('treats STOP as opt-out instead of cancellation', () => {
    expect(parseReminderResponse('STOP')).toBe('opt_out');
    expect(parseReminderResponse('stop please')).toBe('opt_out');
    expect(parseReminderResponse('NDAL')).toBe('opt_out');
    expect(parseReminderResponse('Ndal kujtesat ju lutem')).toBe('opt_out');
  });

  // The patient's own way back into reminders: NDAL is only reversible by the
  // patient, so AKTIVIZO has to resolve as reliably as NDAL does.
  it.each([
    ['AKTIVIZO', 'opt_in'],
    ['aktivizo', 'opt_in'],
    ['Aktivizoj', 'opt_in'],
    ['aktivizo kujtesat', 'opt_in'],
    ['Aktivizo kujtesat e takimeve ju lutem', 'opt_in'],
  ] as const)('parses opt-in keyword %s', (input, intent) => {
    expect(parseReminderResponse(input)).toBe(intent);
  });

  it.each([
    'A mund ta aktivizoj sërish llogarinë time në aplikacion?',
    'Doja të pyesja nëse duhet ta aktivizoj kartën para seancës',
  ])('does not opt in on the long unrelated message %s', (input) => {
    expect(parseReminderResponse(input)).toBeNull();
  });

  // A negated command means the opposite of itself. Out-of-position matching is
  // what makes "Jo, ndal kujtesat" work, and it is exactly what would otherwise
  // read "mos ndal kujtesat" ("do NOT stop the reminders") as an opt-out.
  it.each(['mos aktivizo', 'mos ndal kujtesat', 'nuk ricakto', 'mos anulo'])(
    'does not obey the negated command %s',
    (input) => {
      expect(parseReminderResponse(input)).toBeNull();
    },
  );

  it.each(['maybe', '', '   !!!', 'Ju lutem konfirmoni takimin tim'])(
    'falls through when %s does not start with a keyword',
    (input) => {
      expect(parseReminderResponse(input)).toBeNull();
    },
  );
});
