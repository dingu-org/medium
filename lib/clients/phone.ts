export function normalizeManualPhone(value: string): string | null {
  let digits = value.replace(/\D/g, '');
  // '00' is the international dialing prefix (e.g. 0049 151…) — the E.164
  // equivalent of a leading '+'. Strip it so the stored number matches the
  // digits-only WhatsApp wa_id (which never carries the '00'); otherwise a
  // manually-added client can never link to their inbound conversation.
  if (digits.startsWith('00')) digits = digits.slice(2);
  return /^\d{8,15}$/.test(digits) ? `+${digits}` : null;
}
