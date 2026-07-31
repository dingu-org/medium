export { getFreeSlots } from './availability';
export { bookAppointment } from './book';
export { cancelAppointment } from './cancel';
export { AppointmentError } from './errors';
export { listUpcomingAppointments } from './queries';
export { rescheduleAppointment } from './reschedule';
export { assertAppointmentTransition, transitionAppointment } from './state';
export type {
  AppointmentMutationResult,
  AppointmentRecord,
  AppointmentStatus,
  FreeSlot,
} from './types';
