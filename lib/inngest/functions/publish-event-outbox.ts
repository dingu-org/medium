import { publishDueOutboxEvents } from '@/lib/events/outbox';
import { inngest } from '../client';

export async function publishEventOutboxCore() {
  return publishDueOutboxEvents(50);
}

export const publishEventOutbox = inngest.createFunction(
  {
    id: 'publish-event-outbox',
    retries: 2,
    concurrency: 1,
  },
  { cron: '* * * * *' },
  async ({ step }) =>
    step.run('publish-due-events', () => publishEventOutboxCore()),
);
