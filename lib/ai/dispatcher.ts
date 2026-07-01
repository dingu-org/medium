import {
  AppointmentError,
  bookAppointment,
  cancelAppointment,
  getFreeSlots,
  listUpcomingAppointments,
  rescheduleAppointment,
} from '@/lib/appointments';
import { escalateConversationToHuman } from '@/lib/conversation/escalation';
import { withAuditLog } from '@/lib/tenancy';
import { getActiveServiceByName } from '@/lib/services/queries';
import {
  toolSchemas,
  type ToolExecutionContext,
  type ToolName,
  type ToolResult,
} from './tools';

function invalidInput(message: string): ToolResult {
  return {
    ok: false,
    error: { code: 'invalid_input', message, retryable: true },
  };
}

async function executeTool(
  toolName: ToolName,
  input: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  if (toolName === 'get_availability') {
    const requestedName = input.service_type as string | undefined;
    const service = requestedName
      ? await getActiveServiceByName(ctx.ptId, requestedName)
      : null;
    if (requestedName && !service) {
      return invalidInput('Ky shërbim nuk është i disponueshëm.');
    }
    const availability = await getFreeSlots({
      ptId: ctx.ptId,
      start: new Date(input.start as string),
      end: new Date(input.end as string),
      durationMinutes: service?.durationMinutes ?? 60,
      serviceType: service?.name,
    });
    return {
      ok: true,
      data: {
        timezone: availability.timezone,
        slots: availability.slots.map((slot) => ({
          starts_at: slot.startsAt,
          ends_at: slot.endsAt,
        })),
      },
    };
  }

  if (toolName === 'list_upcoming_appointments') {
    const upcoming = await listUpcomingAppointments({
      ptId: ctx.ptId,
      patientId: ctx.patientId,
    });
    return {
      ok: true,
      data: {
        appointments: upcoming.map((appointment) => ({
          appointment_id: appointment.id,
          starts_at: appointment.startsAt.toISOString(),
          ends_at: appointment.endsAt.toISOString(),
          service_type: appointment.serviceType,
          status: appointment.status,
        })),
      },
    };
  }

  if (toolName === 'book_appointment') {
    const service = await getActiveServiceByName(
      ctx.ptId,
      input.service_type as string,
    );
    if (!service) {
      return invalidInput('Ky shërbim nuk është i disponueshëm.');
    }
    const appointment = await bookAppointment({
      ptId: ctx.ptId,
      patientId: ctx.patientId,
      startsAt: new Date(input.starts_at as string),
      serviceType: service.name,
      durationMinutes: service.durationMinutes,
      notes: input.notes as string | undefined,
    });
    return {
      ok: true,
      data: {
        appointment_id: appointment.id,
        starts_at: appointment.startsAt.toISOString(),
        ends_at: appointment.endsAt.toISOString(),
        status: appointment.status,
        confirmation_summary: `${appointment.serviceType ?? 'Takim'} më ${appointment.startsAt.toISOString()}`,
      },
    };
  }

  if (toolName === 'reschedule_appointment') {
    const appointment = await rescheduleAppointment({
      ptId: ctx.ptId,
      patientId: ctx.patientId,
      appointmentId: input.appointment_id as string,
      newStartsAt: new Date(input.new_starts_at as string),
    });
    return {
      ok: true,
      data: {
        appointment_id: appointment.id,
        starts_at: appointment.startsAt.toISOString(),
        ends_at: appointment.endsAt.toISOString(),
        status: appointment.status,
      },
    };
  }

  if (toolName === 'cancel_appointment') {
    const appointment = await cancelAppointment({
      ptId: ctx.ptId,
      patientId: ctx.patientId,
      appointmentId: input.appointment_id as string,
      reason: input.reason as string | undefined,
      cancelledBy: ctx.cancellationActor ?? 'ai',
    });
    return {
      ok: true,
      data: {
        appointment_id: appointment.id,
        status: appointment.status,
        reason: appointment.cancellationReason,
      },
    };
  }

  const escalated = await escalateConversationToHuman(ctx);
  if (!escalated) {
    return {
      ok: false,
      error: {
        code: 'not_found',
        message: 'Biseda nuk mund të eskalohej.',
        retryable: false,
      },
    };
  }
  return { ok: true, data: { ok: true } };
}

function auditTarget(
  toolName: ToolName,
  input: Record<string, unknown>,
): { table: string; targetId?: string } {
  if (toolName === 'get_availability') return { table: 'availability_rules' };
  if (toolName === 'escalate_to_human') return { table: 'conversations' };
  return {
    table: 'appointments',
    targetId:
      typeof input.appointment_id === 'string'
        ? input.appointment_id
        : undefined,
  };
}

function appointmentErrorResult(error: AppointmentError): ToolResult {
  if (error.code === 'invalid_input') {
    return {
      ok: false,
      error: {
        code: 'invalid_input',
        message: 'Të dhënat e takimit nuk janë të vlefshme.',
        retryable: true,
      },
    };
  }
  if (error.code === 'not_found') {
    return {
      ok: false,
      error: {
        code: 'not_found',
        message: 'Takimi nuk u gjet.',
        retryable: false,
      },
    };
  }
  if (error.code === 'invalid_transition') {
    return {
      ok: false,
      error: {
        code: 'conflict',
        // The appointment is in a terminal state (cancelled/completed/no_show),
        // not a booking conflict — don't tell the patient the slot is taken.
        message: 'Ky takim nuk mund të ndryshohet më.',
        retryable: false,
      },
    };
  }
  return {
    ok: false,
    error: {
      code: 'conflict',
      message: 'Ky orar nuk është më i lirë.',
      retryable: error.code === 'conflict' || error.code === 'unavailable',
    },
  };
}

export async function dispatchTool(
  toolName: ToolName,
  input: unknown,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  const parsed = toolSchemas[toolName].safeParse(input);
  if (!parsed.success) {
    return invalidInput(
      'Të dhënat e veprimit nuk janë të vlefshme. Korrigjoji dhe provo sërish.',
    );
  }

  const target = auditTarget(toolName, parsed.data as Record<string, unknown>);
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
    if (error instanceof AppointmentError) {
      return appointmentErrorResult(error);
    }
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
        message:
          'Veprimi i rezervimit dështoi. Provo sërish ose ofro ndihmë njerëzore.',
        retryable: true,
      },
    };
  }
}
