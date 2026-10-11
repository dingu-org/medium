import type { ReminderTemplateDefinition } from '@/lib/inngest/functions/bootstrap-wa-connection';

/**
 * The business name for a reminder's `{{2}}` slot ("takimi juaj me {{2}}" /
 * "your appointment with {{2}}"), and for the Albanian copy of that reminder
 * stored on the thread.
 *
 * A business that never filled its name in gets a vertical-neutral stand-in in
 * the template's language. The Albanian one is accusative because the slot
 * follows "me"; that is why it is not `DEFAULT_BUSINESS_LABEL_SQ`
 * (`lib/conversation/customer-copy.ts`), which is dative.
 */
export function reminderBusinessName(
  name: string | null,
  language: ReminderTemplateDefinition['language'],
): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  return language === 'sq' ? 'biznesin' : 'the business';
}
