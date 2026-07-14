export const NOTIFICATION_PREF_KEYS = [
  'booking',
  'cancellation',
  'reschedule',
  'escalation',
  'reminderFailure',
  'connection',
  'resumeOffer',
  'billing',
] as const;

export type NotificationPrefs = Record<
  (typeof NOTIFICATION_PREF_KEYS)[number],
  boolean
>;

export const RETENTION_OPTIONS = [30, 60, 90, 180, 365] as const;

export type SettingsState = {
  error: string | null;
  success: boolean;
  fieldErrors: {
    practiceName?: string[];
    fullName?: string[];
    title?: string[];
    address?: string[];
    timezone?: string[];
    aiName?: string[];
    aiGreeting?: string[];
    aiEscalationKeyword?: string[];
    retentionDays?: string[];
  } | null;
};
