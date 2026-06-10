import { escalateConversationToHuman } from '@/lib/conversation/escalation';
import { withAuditLog } from '@/lib/tenancy';
import {
  toolSchemas,
  type ToolExecutionContext,
  type ToolName,
  type ToolResult,
} from './tools';

const STUB_APPOINTMENT_ID = '00000000-0000-4000-8000-000000000001';

function invalidInput(message: string): ToolResult {
  return {
    ok: false,
    error: { code: 'invalid_input', message, retryable: true },
  };
}

function stubAvailability(start: string, end: string) {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const candidates = [
    startMs + 60 * 60 * 1000,
    startMs + 24 * 60 * 60 * 1000,
    startMs + 48 * 60 * 60 * 1000,
  ];

  return candidates
    .filter((startsAt) => startsAt + 60 * 60 * 1000 <= endMs)
    .map((startsAt) => ({
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(startsAt + 60 * 60 * 1000).toISOString(),
    }));
}

async function executeTool(
  toolName: ToolName,
  input: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  if (toolName === 'get_availability') {
    return {
      ok: true,
      data: {
        slots: stubAvailability(input.start as string, input.end as string),
        stub: true,
      },
    };
  }

  if (toolName === 'list_upcoming_appointments') {
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return {
      ok: true,
      data: {
        appointments: [
          {
            appointment_id: STUB_APPOINTMENT_ID,
            starts_at: startsAt.toISOString(),
            service_type: 'Physical therapy session',
            status: 'pending',
          },
        ],
        stub: true,
      },
    };
  }

  if (toolName === 'book_appointment') {
    return {
      ok: true,
      data: {
        appointment_id: STUB_APPOINTMENT_ID,
        status: 'pending',
        confirmation_summary: `${input.service_type} on ${input.starts_at}`,
        stub: true,
      },
    };
  }

  if (toolName === 'reschedule_appointment') {
    return {
      ok: true,
      data: {
        appointment_id: input.appointment_id,
        starts_at: input.new_starts_at,
        status: 'rescheduled',
        stub: true,
      },
    };
  }

  if (toolName === 'cancel_appointment') {
    return {
      ok: true,
      data: {
        appointment_id: input.appointment_id,
        status: 'cancelled',
        reason: input.reason ?? null,
        stub: true,
      },
    };
  }

  const escalated = await escalateConversationToHuman(ctx);
  if (!escalated) {
    return {
      ok: false,
      error: {
        code: 'not_found',
        message: 'The conversation could not be escalated.',
        retryable: false,
      },
    };
  }
  return { ok: true, data: { ok: true } };
}

function auditTarget(toolName: ToolName): { table: string; targetId?: string } {
  if (toolName === 'get_availability') return { table: 'availability_rules' };
  if (toolName === 'escalate_to_human') return { table: 'conversations' };
  return { table: 'appointments' };
}

export async function dispatchTool(
  toolName: ToolName,
  input: unknown,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  const parsed = toolSchemas[toolName].safeParse(input);
  if (!parsed.success) {
    return invalidInput(
      'The tool input was invalid. Correct the fields and try again.',
    );
  }

  const target = auditTarget(toolName);
  try {
    return await withAuditLog(
      {
        ptId: ctx.ptId,
        actor: 'ai',
        action: `ai.tool.${toolName}`,
        targetTable: target.table,
        targetId: target.targetId,
      },
      () => executeTool(toolName, parsed.data as Record<string, unknown>, ctx),
    );
  } catch (error) {
    console.error('[ai-dispatcher] tool failed', {
      toolName,
      ptId: ctx.ptId,
      conversationId: ctx.conversationId,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return {
      ok: false,
      error: {
        code: 'internal_error',
        message: 'The scheduling action failed. Try again or offer human help.',
        retryable: true,
      },
    };
  }
}
