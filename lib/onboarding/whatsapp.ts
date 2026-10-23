import { screenHref } from './flow';

/** The two answers on the WhatsApp choice screen (MED-122). */
export const WHATSAPP_CHOICES = ['have', 'notYet'] as const;
export type WhatsappChoice = (typeof WHATSAPP_CHOICES)[number];

/** Validates a stored draft: anything else means "nothing chosen". */
export function isWhatsappChoice(value: unknown): value is WhatsappChoice {
  return (
    typeof value === 'string' &&
    (WHATSAPP_CHOICES as readonly string[]).includes(value)
  );
}

/** The two-path screen; the dashboard card (MED-124) links here. */
export const WHATSAPP_STEP_HREF = screenHref('whatsapp');

/** The guide is a nested route, so it gets its own history entry. */
export const WHATSAPP_GUIDE_HREF = `${WHATSAPP_STEP_HREF}/guide`;

/**
 * Where every leaving handler goes when a completed account reopened the
 * screen: flow actions are closed to it, so nothing is saved. `replace` keeps
 * the dashboard out of a back-and-forth loop.
 */
export const REOPEN_EXIT = {
  ok: true,
  next: '/today',
  replace: true,
} as const;

/** The main button's label key for a choice; `null` means no button at all. */
export function whatsappPrimaryLabel(
  choice: WhatsappChoice | null,
): 'connect' | 'showGuide' | null {
  if (choice === 'have') return 'connect';
  if (choice === 'notYet') return 'showGuide';
  return null;
}
