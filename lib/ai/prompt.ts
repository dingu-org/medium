import { SCHEDULING_ASSISTANT_PROMPT } from './prompts/scheduling-assistant';

export type PromptContext = {
  practiceName: string | null;
  timezone: string;
  aiName: string | null;
  aiGreeting: string | null;
  escalationKeyword: string | null;
  title: string | null;
  address: string | null;
  retentionDays: number;
  configuredServices?: Array<{
    name: string;
    durationMinutes: number;
    priceLek?: number | null;
  }>;
  now?: Date;
};

function formatPracticeLocalTime(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat('sq-AL', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(now);
}

export function buildSystemPrompt(context: PromptContext): string {
  const practiceName =
    context.practiceName?.trim() || 'praktika e fizioterapisë';
  const aiName = context.aiName?.trim() || 'asistenti i rezervimeve';
  const greeting =
    context.aiGreeting?.trim() ||
    `Përshëndetje! Jam asistenti i rezervimeve për ${practiceName}. Mund t'ju ndihmoj të rezervoni, ricaktoni ose anuloni një takim.`;
  const escalationKeyword = context.escalationKeyword?.trim() || 'NDIHMË';
  const now = context.now ?? new Date();

  const title = context.title?.trim();
  const address = context.address?.trim();
  const titleLine = title ? `- Practitioner title: ${title}\n` : '';
  const addressLine = address ? `- Practice address: ${address}\n` : '';

  const serviceLines = (context.configuredServices ?? [])
    .map((service) => {
      const price =
        service.priceLek != null ? `, ${service.priceLek} Lekë` : '';
      return `- ${service.name}: ${service.durationMinutes} minuta${price}`;
    })
    .join('\n');

  return `${SCHEDULING_ASSISTANT_PROMPT}

## Practice context

- Practice: ${practiceName}
${titleLine}${addressLine}- Assistant name: ${aiName}
- Timezone: ${context.timezone}
- Current time: ${now.toISOString()}
- Practice-local current time: ${formatPracticeLocalTime(now, context.timezone)}
- Human escalation keyword: ${escalationKeyword}
- Configured message retention: ${context.retentionDays} days
- Greeting for a new conversation: ${greeting}
- Available services (use these exact names only):
${serviceLines || '- No active services are configured; do not offer or book a service.'}

Only state the practice address, practitioner title, or a service price if it is listed above, and quote it exactly; if a service has no price listed, tell the patient it is not available rather than guessing. Never invent a public phone number, insurance policy, address, price, or any other detail that is not present above.`;
}
