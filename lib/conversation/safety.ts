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
];

const LEGAL_BILLING_PATTERNS = [
  /\b(?:lawyer|legal action|lawsuit|sue|solicitor)\b/i,
  /\b(?:bill|billing|invoice|refund|charge|payment dispute)\b/i,
];

const INSURANCE_PATTERNS = [
  /\b(?:insurance|insurer|reimbursement)\b/i,
  /\b(?:health|medical)\s+(?:plan|policy)\b/i,
  /\b(?:plan|policy)\s+coverage\b/i,
  /\bcovered by (?:my|the|an?) (?:insurance|health plan|medical plan|policy)\b/i,
];

const FRUSTRATION_PATTERNS = [
  /\bthis isn'?t working\b/i,
  /\byou(?:'re| are) not (?:understanding|listening)\b/i,
  /\bthis is useless\b/i,
  /\b(?:very|really|extremely) frustrated\b/i,
];

export function detectSafetyEscalation(
  content: string,
  escalationKeyword: string | null,
): SafetyEscalationReason | null {
  const normalized = content.trim();
  const keyword = escalationKeyword?.trim();
  if (
    normalized.toUpperCase() === 'HELP' ||
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
    return `I can't assess urgent medical concerns. Please contact your local emergency services now. I've also handed this conversation to ${practiceName}.`;
  }
  if (reason === 'human_requested') {
    return `Of course. I've handed this conversation to ${practiceName}, and they'll respond when available.`;
  }
  if (reason === 'insurance_question') {
    return `I don't have access to insurance coverage information. I've handed this conversation to ${practiceName} so they can help.`;
  }
  if (reason === 'legal_or_billing') {
    return `I can only help with appointment scheduling. I've handed this conversation to ${practiceName} for this request.`;
  }
  return `I want to make sure you get the right help. I've handed this conversation to ${practiceName}, and they'll respond when available.`;
}
