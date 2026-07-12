/** Whole-Lekë price grouped with non-breaking spaces (U+00A0) to match the
 *  design (`3 000`) without wrapping mid-number. Read-only display only —
 *  the editable field submits a plain integer. */
export function formatLek(value: number): string {
  return String(Math.trunc(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
