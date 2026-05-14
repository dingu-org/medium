import { Inngest, EventSchemas } from 'inngest';
import type { Events } from './events';

if (!process.env.INNGEST_EVENT_KEY) {
  throw new Error('INNGEST_EVENT_KEY is required');
}

export const inngest = new Inngest({
  id: 'medium',
  schemas: new EventSchemas().fromRecord<Events>(),
});
