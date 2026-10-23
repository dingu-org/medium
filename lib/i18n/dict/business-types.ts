import type { BusinessType } from '../../business-types';

/** Business type labels (MED-117). Drafts from the canvas, pending copy review. */
export const businessTypes = {
  psychologist: 'Psikolog',
  physiotherapist: 'Fizioterapist',
  dentist: 'Dentist',
  beauty_salon: 'Sallon bukurie',
  personal_trainer: 'Trajner personal',
  barber_hairdresser: 'Berber / parukier',
  massage_therapist: 'Masazhues',
  nutritionist: 'Nutricionist',
  coach_tutor: 'Trajner / mësues',
  consultant: 'Konsulent',
  other_professional: 'Profesionist tjetër',
} as const satisfies Record<BusinessType, string>;
