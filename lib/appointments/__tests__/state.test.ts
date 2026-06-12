import { describe, expect, it } from 'vitest';
import { AppointmentError } from '../errors';
import { assertAppointmentTransition } from '../state';

describe('appointment state transitions', () => {
  it.each([
    ['pending', 'confirmed'],
    ['pending', 'cancelled'],
    ['pending', 'completed'],
    ['pending', 'no_show'],
    ['confirmed', 'cancelled'],
    ['confirmed', 'completed'],
    ['confirmed', 'no_show'],
    ['rescheduled', 'confirmed'],
  ] as const)('allows %s -> %s', (current, next) => {
    expect(() => assertAppointmentTransition(current, next)).not.toThrow();
  });

  it('treats a same-state transition as idempotent', () => {
    expect(() =>
      assertAppointmentTransition('confirmed', 'confirmed'),
    ).not.toThrow();
  });

  it.each([
    ['cancelled', 'confirmed'],
    ['completed', 'cancelled'],
    ['no_show', 'confirmed'],
    ['confirmed', 'pending'],
    ['pending', 'rescheduled'],
  ] as const)('rejects %s -> %s', (current, next) => {
    expect(() => assertAppointmentTransition(current, next)).toThrow(
      AppointmentError,
    );
  });
});
