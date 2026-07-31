import { jsonSchema, tool } from 'ai';
import { z } from 'zod';

const isoDateTime = z.iso.datetime({ offset: true });

export const toolSchemas = {
  get_availability: z
    .object({
      start: isoDateTime.describe(
        'Start of the requested search window as an ISO timestamp.',
      ),
      end: isoDateTime.describe(
        'End of the requested search window as an ISO timestamp.',
      ),
      service_type: z.string().trim().min(1).max(120).optional(),
    })
    .refine(({ start, end }) => new Date(end) > new Date(start), {
      message: 'end must be after start',
      path: ['end'],
    }),
  list_upcoming_appointments: z.object({}),
  book_appointment: z.object({
    starts_at: isoDateTime,
    service_type: z.string().trim().min(1).max(120),
    notes: z.string().trim().max(500).optional(),
  }),
  reschedule_appointment: z.object({
    appointment_id: z.uuid(),
    new_starts_at: isoDateTime,
  }),
  cancel_appointment: z.object({
    appointment_id: z.uuid(),
    reason: z.string().trim().max(500).optional(),
  }),
  escalate_to_human: z.object({
    reason: z.string().trim().min(1).max(500),
  }),
} as const;

export type ToolName = keyof typeof toolSchemas;
export type ToolInput<TName extends ToolName> = z.infer<
  (typeof toolSchemas)[TName]
>;

/**
 * An appointment change the conversation engine can confirm deterministically.
 * Read out of the step's tool result, never rendered by the model.
 */
export type AppointmentMutationEffect = {
  kind: 'booked' | 'rescheduled' | 'cancelled';
  appointmentId: string;
  /** New start for booked/rescheduled; the cancelled appointment's own start. */
  startsAt: string;
  serviceType: string | null;
};

export type ToolResult<T = unknown> =
  // `effect` is a sibling of `data`, not a field inside it: `data` is the
  // documented result shape each tool promises, and the effect is engine
  // plumbing that must not become part of it.
  | { ok: true; data: T; effect?: AppointmentMutationEffect }
  | {
      ok: false;
      error: {
        code: 'invalid_input' | 'not_found' | 'conflict' | 'internal_error';
        message: string;
        retryable: boolean;
      };
    };

export type ToolExecutionContext = {
  ptId: string;
  patientId: string;
  conversationId: string;
  cancellationActor?: 'ai' | 'patient';
};

type Dispatch = (
  toolName: ToolName,
  input: unknown,
  ctx: ToolExecutionContext,
) => Promise<ToolResult>;

function dispatchableSchema<T>(schema: z.ZodType<T>) {
  // The model receives the full JSON schema, while the dispatcher owns runtime
  // validation so malformed calls become recoverable tool results.
  const schemaJson = z.toJSONSchema(schema) as Parameters<typeof jsonSchema>[0];
  return jsonSchema<T>(schemaJson, {
    validate: (value) => ({ success: true, value: value as T }),
  });
}

export function createConversationTools(
  ctx: ToolExecutionContext,
  dispatch: Dispatch,
) {
  return {
    get_availability: tool({
      description:
        'Find available appointment slots in a requested time window.',
      inputSchema: dispatchableSchema(toolSchemas.get_availability),
      execute: (input) => dispatch('get_availability', input, ctx),
    }),
    list_upcoming_appointments: tool({
      description:
        "List the patient's upcoming appointments before choosing one to cancel or reschedule.",
      inputSchema: dispatchableSchema(toolSchemas.list_upcoming_appointments),
      execute: (input) => dispatch('list_upcoming_appointments', input, ctx),
    }),
    book_appointment: tool({
      description:
        'Book a slot only after the patient has selected it and confirmed the appointment details.',
      inputSchema: dispatchableSchema(toolSchemas.book_appointment),
      execute: (input) => dispatch('book_appointment', input, ctx),
    }),
    reschedule_appointment: tool({
      description:
        'Move one identified upcoming appointment to a new time selected by the patient.',
      inputSchema: dispatchableSchema(toolSchemas.reschedule_appointment),
      execute: (input) => dispatch('reschedule_appointment', input, ctx),
    }),
    cancel_appointment: tool({
      description:
        "Cancel one identified upcoming appointment at the patient's request.",
      inputSchema: dispatchableSchema(toolSchemas.cancel_appointment),
      execute: (input) => dispatch('cancel_appointment', input, ctx),
    }),
    escalate_to_human: tool({
      description:
        'Hand the conversation to the PT when the patient requests a human or scheduling cannot be resolved safely.',
      inputSchema: dispatchableSchema(toolSchemas.escalate_to_human),
      execute: (input) => dispatch('escalate_to_human', input, ctx),
    }),
  };
}
