export const NOTIFICATION_PREF_KEYS = [
  'booking',
  'cancellation',
  'reschedule',
  'escalation',
  'manualReply',
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
    name?: string[];
    fullName?: string[];
    title?: string[];
    address?: string[];
    timezone?: string[];
    aiName?: string[];
    aiGreeting?: string[];
    retentionDays?: string[];
  } | null;
};
