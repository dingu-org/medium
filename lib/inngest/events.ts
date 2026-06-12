import type { AppointmentEventPayloads } from '@/lib/events/appointments';

type ExistingEvents = {
  'message.received': {
    data: { messageId: string; ptId: string; conversationId: string };
  };
  'wa.connection.created': {
    data: {
      ptId: string;
      connectionId: string;
      phoneNumberId: string;
      wabaId: string;
    };
  };
  'wa.connection.revoked': {
    data: {
      ptId: string;
      connectionId: string;
      reason: 'unauthorized' | 'forbidden';
    };
  };
  'wa.template.approved': {
    data: { ptId: string; templateId: string; metaId: string };
  };
};

type AppointmentEvents = {
  [K in keyof AppointmentEventPayloads]: {
    data: AppointmentEventPayloads[K];
  };
};

export type Events = ExistingEvents & AppointmentEvents;
