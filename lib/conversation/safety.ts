export type SafetyEscalationReason =
  | 'human_requested'
  | 'urgent_health_concern'
  | 'legal_or_billing'
  | 'insurance_question'
  | 'high_frustration';

const HUMAN_PATTERNS = [
  /\breal person\b/i,
  /\b(?:speak|talk|connect)\b.{0,24}\b(?:human|person|therapist|physio|pt)\b/i,
  /\b(?:human|person)\b.{0,24}\b(?:please|now)\b/i,
  /\b(?:person|njeri|fizioterapist|terapist)\s+(?:real|të vërtetë)\b/i,
  /\b(?:dua|flas|lidhni|më lidhni)\b.{0,24}\b(?:dikë|person|fizioterapist|terapist)\b/i,
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
  /\b(?:urgjencë|ambulancë|dhimbje gjoksi|vështirësi në frymëmarrje|dhimbje të forta)\b/i,
  /\b(?:nuk mund|s'mund)\b.{0,16}\b(?:të ec|të qëndroj|të marr frymë)\b/i,
];

const LEGAL_BILLING_PATTERNS = [
  /\b(?:lawyer|legal action|lawsuit|sue|solicitor)\b/i,
  /\b(?:bill|billing|invoice|refund|charge|payment dispute)\b/i,
  /\b(?:avokat|ligjor|faturë|rimbursim|pagesë)\b/i,
];

const INSURANCE_PATTERNS = [
  /\b(?:insurance|insurer|reimbursement)\b/i,
  /\b(?:health|medical)\s+(?:plan|policy)\b/i,
  /\b(?:plan|policy)\s+coverage\b/i,
  /\bcovered by (?:my|the|an?) (?:insurance|health plan|medical plan|policy)\b/i,
  /\b(?:sigurim|siguracion|mbulim shëndetësor)\b/i,
];

const FRUSTRATION_PATTERNS = [
  /\bthis isn'?t working\b/i,
  /\byou(?:'re| are) not (?:understanding|listening)\b/i,
  /\bthis is useless\b/i,
  /\b(?:very|really|extremely) frustrated\b/i,
  /\b(?:nuk funksionon|nuk po kupton|jam shumë i frustruar|jam shumë e frustruar)\b/i,
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
