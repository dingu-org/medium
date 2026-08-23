/**
 * Albanian (sq) UI dictionary — the canonical practitioner-facing copy, composed
 * from per-area modules in ./dict. Practitioner UI is informal ("ti"); AI→customer
 * copy stays formal ("Ju") and lives in the AI prompts, not here.
 *
 * One locale ships today, so screens import `t` directly (no runtime locale
 * switching). Date/number formatting helpers live in ./datetime.
 */
import { appointment } from './dict/appointment';
import { auth } from './dict/auth';
import { billing } from './dict/billing';
import { calendar, reminder, status } from './dict/calendar';
import { chat } from './dict/chat';
import { clients } from './dict/clients';
import { common } from './dict/common';
import { onboarding } from './dict/onboarding';
import { availability, settings } from './dict/settings';
import { pwa } from './dict/pwa';
import { today } from './dict/today';

export const sq = {
  ...common,
  auth,
  billing,
  onboarding,
  calendar,
  status,
  reminder,
  chat,
  appointment,
  settings,
  availability,
  pwa,
  clients,
  today,
} as const;

export type Dictionary = typeof sq;
