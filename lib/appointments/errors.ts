export type AppointmentErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'conflict'
  | 'unavailable'
  | 'invalid_transition';

export class AppointmentError extends Error {
  constructor(
    public readonly code: AppointmentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppointmentError';
  }
}
