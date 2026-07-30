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
    // Short enough for the other particles, still a statement rather than a yes.
    'Po pyesja diçka',
    'Po flas seriozisht',
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
    ['Ok, stop', 'opt_out'],
  ] as const)(
    'reads %s by its explicit command, not its first word',
    (input, intent) => {
      expect(parseReminderResponse(input)).toBe(intent);
    },
  );

  // "Ok, anuloj" is "OK, I'm cancelling", not the confirmation a bare "Ok"
  // would be. Confirming it books a slot nobody will use and tells the patient
  // the appointment they just cancelled is on.
  it.each([
    'Ok anuloj',
    'Po anuloj',
    'po, anulo',
    'Dakord anuloj',
    'Ok, anuloj takimin',
  ])(
    'never downgrades the explicit cancel in %s to a confirmation',
    (input) => {
      expect(parseReminderResponse(input)).toBeNull();
    },
  );

  // A command that agrees with the particle in front of it is still obeyed.
  it('confirms when the particle and the command say the same thing', () => {
    expect(parseReminderResponse('Po konfirmo')).toBe('confirm');
  });

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

  // 'stop' is kept for the Meta convention — a message that IS "STOP" — not for
  // the English noun a modifier turns it into.
  it.each(['Full stop pls', 'non-stop'])(
    'does not unsubscribe on the English phrase %s',
    (input) => {
      expect(parseReminderResponse(input)).toBeNull();
    },
  );

  // Polite openers soften the request without changing it, so the command
  // behind one still resolves.
  it.each([
    ['Ju lutem aktivizoni kujtesat', 'opt_in'],
    ['Te lutem ndal kujtesat', 'opt_out'],
    ['Ju lutem anulo takimin', 'cancel'],
  ] as const)('reads past the polite opener in %s', (input, intent) => {
    expect(parseReminderResponse(input)).toBe(intent);
  });

  // The tokenizer's character class carries no combining marks, so composing
  // has to happen before the split or a decomposed "ë" breaks the word in two.
  it('normalises decomposed Albanian vowels before tokenising', () => {
    const decomposed = 'Të lutem ndal kujtesat'.normalize('NFD');
    expect(decomposed).not.toBe('Të lutem ndal kujtesat');
    expect(parseReminderResponse(decomposed)).toBe('opt_out');
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

  // The polite 2pl imperative is the register a patient writes a business in,
  // and both switches have to answer to it — an unrecognised AKTIVIZO leaves
  // the patient with no way back.
  it.each([
    ['Aktivizoni', 'opt_in'],
    ['aktivizoni kujtesat', 'opt_in'],
    ['Ndalo', 'opt_out'],
    ['ndalni', 'opt_out'],
  ] as const)('parses the polite imperative %s', (input, intent) => {
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
  it.each([
    'mos aktivizo',
    'mos ndal kujtesat',
    'nuk ricakto',
    'mos anulo',
    // A clitic pronoun between the negator and its verb is at least as
    // idiomatic as the bare form.
    'mos e ndal',
    'mos i ndal',
    'mos ma ndal',
    'mos e aktivizo',
    'mos e ndal kujtesat',
    // The everyday contraction of "nuk"; the apostrophe splits off a bare "s".
    "s'ndal",
    's’ndal',
  ])('does not obey the negated command %s', (input) => {
    expect(parseReminderResponse(input)).toBeNull();
  });

  // A patient describing something they are stopping is not asking us to stop
  // texting them: "Po e ndal" is "I'm stopping it", "do ta ndal" is "I'll stop
  // it". Unsubscribing them there loses every future reminder silently.
  it.each(['Po e ndal', 'do ta ndal'])(
    'does not unsubscribe on the declarative %s',
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
