'use client';

import { sendOrQueueMutation, type QueueReason } from './client-store';

export type QueueMutationResult =
  | { status: 'sent'; response: unknown; clientMutationId: string }
  | { status: 'queued'; clientMutationId: string; reason: QueueReason }
  | { status: 'failed'; error: string; clientMutationId: string };

export async function queueMessageSend(input: {
  clientMutationId?: string;
  conversationId: string;
  body: string;
}): Promise<QueueMutationResult> {
  const clientMutationId = input.clientMutationId ?? crypto.randomUUID();
  return normalize(
    clientMutationId,
    await sendOrQueueMutation({
      id: clientMutationId,
      type: 'message.send',
      endpoint: '/api/pwa/mutations/message',
      body: {
        clientMutationId,
        conversationId: input.conversationId,
        body: input.body,
      },
    }),
  );
}

export type AppointmentMutationInput =
  | {
      action: 'manual_book';
      patientId?: string;
      newPatient?: { name: string; phone: string };
      date: string;
      time: string;
      serviceId?: string;
      serviceType?: string;
      notes?: string;
    }
  | { action: 'cancel'; appointmentId: string; reason?: string }
  | { action: 'reschedule'; appointmentId: string; newStartsAt: string }
  | {
      action: 'transition';
      appointmentId: string;
      nextStatus: 'confirmed' | 'completed' | 'no_show';
    }
  | { action: 'notes'; appointmentId: string; notes: string };

export async function queueAppointmentMutation(
  input: AppointmentMutationInput & { clientMutationId?: string },
): Promise<QueueMutationResult> {
  const clientMutationId = input.clientMutationId ?? crypto.randomUUID();
  const { clientMutationId: ignoredClientMutationId, ...body } = input;
  void ignoredClientMutationId;
  return normalize(
    clientMutationId,
    await sendOrQueueMutation({
      id: clientMutationId,
      type: `appointment.${body.action}`,
      endpoint: '/api/pwa/mutations/appointment',
      body: { clientMutationId, ...body },
    }),
  );
}

function normalize(
  clientMutationId: string,
  result: Awaited<ReturnType<typeof sendOrQueueMutation>>,
): QueueMutationResult {
  if (result.status === 'sent') {
    return { status: 'sent', response: result.response, clientMutationId };
  }
  if (result.status === 'queued') {
    return { status: 'queued', clientMutationId, reason: result.reason };
  }
  return { status: 'failed', error: result.error, clientMutationId };
}
