export function getPostgresErrorCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current != null; depth++) {
    if (
      typeof current === 'object' &&
      'code' in current &&
      typeof (current as { code?: unknown }).code === 'string'
    ) {
      return (current as { code: string }).code;
    }
    current =
      typeof current === 'object' && 'cause' in current
        ? (current as { cause?: unknown }).cause
        : null;
  }
  return null;
}
