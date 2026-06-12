import type { AppointmentEventPayloads } from '@/lib/events/appointments';
import type { BackgroundEventPayloads } from '@/lib/events/background';

type AppointmentEvents = {
  [K in keyof AppointmentEventPayloads]: {
    data: AppointmentEventPayloads[K];
  };
};

type BackgroundEvents = {
  [K in keyof BackgroundEventPayloads]: {
    data: BackgroundEventPayloads[K];
  };
};

export type Events = BackgroundEvents & AppointmentEvents;
