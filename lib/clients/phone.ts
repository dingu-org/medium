// Albania is the only market, so a number typed the local way ('069 234 5678')
// belongs to +355. Exported for the directory search, which has to match the
// same trunk-prefix input against stored E.164 numbers.
export const DEFAULT_COUNTRY_CODE = '355';

export function normalizeManualPhone(value: string): string | null {
  let digits = value.replace(/\D/g, '');
  // '00' is the international dialing prefix (e.g. 0049 151…) — the E.164
  // equivalent of a leading '+'. Strip it so the stored number matches the
  // digits-only WhatsApp wa_id (which never carries the '00'); otherwise a
  // manually-added client can never link to their inbound conversation.
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (!value.includes('+') && /^0\d{8,14}$/.test(digits)) {
    // A single leading '0' is the national trunk prefix, the way Albanian
    // numbers are written down. E.164 country codes never start with '0', so
    // storing '+069…' would leave the row permanently unmatchable against the
    // wa_id — rewrite the trunk prefix to the country code instead.
    digits = `${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
  }
  // Leading '0' is still possible ('+069…', '000355…') and is never valid E.164.
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}
