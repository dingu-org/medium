/**
 * The single patient-facing rendering of an appointment instant. Reminders, the
 * deterministic reminder replies and the appointment event copy all quote the
 * same booking, so they have to name it identically — two formatters read as two
 * different times to a patient comparing the messages.
 */
export function formatAppointmentTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('sq-AL', {
    timeZone: timezone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date);
}
