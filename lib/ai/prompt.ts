import { SCHEDULING_ASSISTANT_PROMPT } from './prompts/scheduling-assistant';

export type PromptContext = {
  practiceName: string | null;
  timezone: string;
  aiName: string | null;
  aiGreeting: string | null;
  escalationKeyword: string | null;
  retentionDays: number;
  now?: Date;
};

function formatPracticeLocalTime(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(now);
}

export function buildSystemPrompt(context: PromptContext): string {
  const practiceName =
    context.practiceName?.trim() || 'the physical therapy practice';
  const aiName = context.aiName?.trim() || 'the scheduling assistant';
  const greeting =
    context.aiGreeting?.trim() ||
    `Hello! I'm the scheduling assistant for ${practiceName}. I can help you book, reschedule, or cancel an appointment.`;
  const escalationKeyword = context.escalationKeyword?.trim() || 'HELP';
  const now = context.now ?? new Date();

  return `${SCHEDULING_ASSISTANT_PROMPT}

## Practice context

- Practice: ${practiceName}
- Assistant name: ${aiName}
- Timezone: ${context.timezone}
- Current time: ${now.toISOString()}
- Practice-local current time: ${formatPracticeLocalTime(now, context.timezone)}
- Human escalation keyword: ${escalationKeyword}
- Configured message retention: ${context.retentionDays} days
- Greeting for a new conversation: ${greeting}

Do not invent a clinic address, public phone number, insurance policy, price, or service detail that is not present above.`;
}
