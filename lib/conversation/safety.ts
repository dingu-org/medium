export type SafetyEscalationReason =
  | 'human_requested'
  | 'urgent_health_concern'
  | 'legal_or_billing'
  | 'insurance_question'
  | 'high_frustration';

// Albanian patterns must not use `\b`: it is ASCII-only, so a boundary next to
// 'ë'/'ç' never matches and /\burgjencë\b/ can never fire. They use Unicode
// letter lookarounds plus `\p{L}*` to absorb Albanian inflection
// ('urgjencë' → 'urgjencën', 'avokat' → 'avokatin') under the `u` flag.
//
// The human nouns are the exception: an open `\p{L}*` on 'person' also swallows
// the unrelated adjective ('terapi personale'), so they take an explicit
// declension set closed by a letter boundary — 'fizioterapistin' still matches,
// 'personale' no longer does. The verb must be an explicit talk/connect one too:
// with 'dua' in the alternation, 'Dua një takim me fizioterapistin' — the single
// most common booking phrasing — escalated instead of reaching the model.
const HUMAN_PATTERNS = [
  /\breal person\b/i,
  /\b(?:speak|talk|connect)\b.{0,24}\b(?:human|person|therapist|physio|pt)\b/i,
  /\b(?:human|person)\b.{0,24}\b(?:please|now)\b/i,
  /(?<![\p{L}\p{N}])(?:person|njeri|fizioterapist|terapist)(?:i|in|it|ë|ët|e|et)?(?![\p{L}\p{N}])\s+(?:real|të vërtet)\p{L}*/iu,
  /(?<![\p{L}\p{N}])(?:flas|lidh)\p{L}*.{0,24}(?<![\p{L}\p{N}])(?:dikë|person|njeri|fizioterapist|terapist)(?:i|in|it|ë|ët|e|et)?(?![\p{L}\p{N}])/iu,
];

const URGENT_PATTERNS = [
  /\bemergency\b/i,
  /\bambulance\b/i,
  /\bchest pain\b/i,
  /\b(?:can'?t|cannot|unable to)\s+(?:walk|stand|breathe)\b/i,
  /\bdifficulty breathing\b/i,
  /\bsevere pain\b/i,
  /\b(?:just|recently|today|yesterday)\s+(?:fell|had a fall)\b/i,
  /\b(?:fell|had a fall)\b.{0,32}\b(?:hurt|injured|pain|bleeding|dizzy|can'?t|cannot|unable)\b/i,
  /(?<![\p{L}\p{N}])(?:urgjenc|ambulanc)\p{L}*/iu,
  /(?<![\p{L}\p{N}])dhimbje\s+(?:gjoksi|të fort)\p{L}*/iu,
  /(?<![\p{L}\p{N}])vështirësi\p{L}*\s+(?:në\s+)?frymëmarrje\p{L}*/iu,
  /(?<![\p{L}\p{N}])(?:nuk mund|s'mund)(?![\p{L}\p{N}]).{0,16}(?<![\p{L}\p{N}])(?:të ec|të qëndroj|të marr frymë)\p{L}*/iu,
];

// Scoped to genuine disputes only. Bare price words (bill/charge/faturë/pagesë)
// used to land here and switch the assistant off, even though the prompt
// carries each service's price and is told to quote it — a plain "how much do
// you charge?" must reach the model.
const LEGAL_BILLING_PATTERNS = [
  /\b(?:lawyer|legal action|lawsuit|sue|solicitor)\b/i,
  /\b(?:payment dispute|billing dispute|refund|chargeback|overcharged|wrong(?:ly)? charged|dispute the (?:bill|invoice|charge))\b/i,
  /(?<![\p{L}\p{N}])(?:avokat|ligjor|rimbursim)\p{L}*/iu,
  /(?<![\p{L}\p{N}])(?:fatur|pages)\p{L}*\s+(?:e|të)\s+gabuar\p{L}*/iu,
];

const INSURANCE_PATTERNS = [
  /\b(?:insurance|insurer|reimbursement)\b/i,
  /\b(?:health|medical)\s+(?:plan|policy)\b/i,
  /\b(?:plan|policy)\s+coverage\b/i,
  /\bcovered by (?:my|the|an?) (?:insurance|health plan|medical plan|policy)\b/i,
  /(?<![\p{L}\p{N}])(?:sigurim|siguracion)\p{L}*/iu,
  /(?<![\p{L}\p{N}])mbulim\p{L}*\s+shëndetësor\p{L}*/iu,
];

const FRUSTRATION_PATTERNS = [
  /\bthis isn'?t working\b/i,
  /\byou(?:'re| are) not (?:understanding|listening)\b/i,
  /\bthis is useless\b/i,
  /\b(?:very|really|extremely) frustrated\b/i,
  /(?<![\p{L}\p{N}])(?:nuk funksionon|nuk po kupton|jam shumë [ie] frustruar)\p{L}*/iu,
];

export function detectSafetyEscalation(
  content: string,
  escalationKeyword: string | null,
): SafetyEscalationReason | null {
  const normalized = content.trim();
  const keyword = escalationKeyword?.trim();
  if (
    normalized.toUpperCase() === 'HELP' ||
    normalized.toLocaleUpperCase('sq') === 'NDIHMË' ||
    (keyword &&
      normalized.localeCompare(keyword, undefined, {
        sensitivity: 'accent',
      }) === 0) ||
    HUMAN_PATTERNS.some((pattern) => pattern.test(normalized))
  ) {
    return 'human_requested';
  }
  if (URGENT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'urgent_health_concern';
  }
  if (LEGAL_BILLING_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'legal_or_billing';
  }
  if (INSURANCE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'insurance_question';
  }
  if (FRUSTRATION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'high_frustration';
  }
  return null;
}

export function safetyEscalationResponse(
  reason: SafetyEscalationReason,
  practiceName: string,
): string {
  if (reason === 'urgent_health_concern') {
    return `Nuk mund të vlerësoj shqetësime urgjente mjekësore. Ju lutem kontaktoni menjëherë shërbimet vendore të urgjencës. Këtë bisedë ia kalova edhe ${practiceName}.`;
  }
  if (reason === 'human_requested') {
    return `Patjetër. Këtë bisedë ia kalova ${practiceName}; do t'ju përgjigjen sapo të jenë të lirë.`;
  }
  if (reason === 'insurance_question') {
    return `Nuk kam qasje në informacionin për mbulimin e sigurimit. Këtë bisedë ia kalova ${practiceName} që t'ju ndihmojnë.`;
  }
  if (reason === 'legal_or_billing') {
    return `Mund të ndihmoj vetëm me caktimin e takimeve. Për këtë kërkesë, bisedën ia kalova ${practiceName}.`;
  }
  return `Dua të sigurohem që të merrni ndihmën e duhur. Këtë bisedë ia kalova ${practiceName}; do t'ju përgjigjen sapo të jenë të lirë.`;
}
