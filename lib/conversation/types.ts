export type InboundMessage = {
  id: string;
  conversationId: string;
  ptId: string;
  patientId: string;
  content: string;
  channel: string;
  externalId: string | null;
  occurredAt: Date;
};

export type OutboundMessage = {
  id: string;
  conversationId: string;
  replyToMessageId: string;
  content: string;
  channel: string;
};

export type ReminderTurnContext = {
  reason: 'unclear_reply' | 'reschedule_followup' | 'ambiguous_reminders';
  appointmentId?: string;
  appointmentStartsAt?: string;
  timezone?: string;
  practiceName?: string | null;
};
