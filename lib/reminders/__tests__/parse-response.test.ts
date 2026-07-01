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
  ] as const)('parses confirm keyword %s', (input, intent) => {
    expect(parseReminderResponse(input)).toBe(intent);
  });

  it.each([
    ['CANCEL', 'cancel'],
    ['ANULO', 'cancel'],
    ['no', 'cancel'],
    ['n', 'cancel'],
    ['annulla', 'cancel'],
    ['annuler', 'cancel'],
    ['cancelar', 'cancel'],
  ] as const)('parses cancel keyword %s', (input, intent) => {
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
