export function normalizeManualPhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  return /^\d{8,15}$/.test(digits) ? `+${digits}` : null;
}
