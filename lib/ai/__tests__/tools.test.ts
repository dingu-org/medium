import { describe, expect, it } from 'vitest';
import { toolSchemas } from '../tools';

describe('AI tool schemas', () => {
  it('accepts a valid availability window', () => {
    expect(
      toolSchemas.get_availability.safeParse({
        start: '2026-06-11T09:00:00+02:00',
        end: '2026-06-12T17:00:00+02:00',
      }).success,
    ).toBe(true);
  });

  it('rejects an inverted availability window', () => {
    expect(
      toolSchemas.get_availability.safeParse({
        start: '2026-06-12T17:00:00+02:00',
        end: '2026-06-11T09:00:00+02:00',
      }).success,
    ).toBe(false);
  });

  it('keeps patient and tenant IDs out of booking input', () => {
    const parsed = toolSchemas.book_appointment.safeParse({
      starts_at: '2026-06-12T10:00:00+02:00',
      service_type: 'Initial consultation',
      patient_id: '11111111-2222-3333-4444-555555555555',
      pt_id: '66666666-7777-8888-9999-000000000000',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty('patient_id');
      expect(parsed.data).not.toHaveProperty('pt_id');
    }
  });

  it('requires UUID appointment identifiers for mutations', () => {
    expect(
      toolSchemas.cancel_appointment.safeParse({ appointment_id: 'not-an-id' })
        .success,
    ).toBe(false);
    expect(
      toolSchemas.reschedule_appointment.safeParse({
        appointment_id: 'not-an-id',
        new_starts_at: '2026-06-12T10:00:00+02:00',
      }).success,
    ).toBe(false);
  });
});
