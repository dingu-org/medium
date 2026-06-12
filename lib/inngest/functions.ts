import type { InngestFunction } from 'inngest';
import { bootstrapWaConnection } from './functions/bootstrap-wa-connection';
import { publishEventOutbox } from './functions/publish-event-outbox';

export const functions: InngestFunction.Like[] = [
  bootstrapWaConnection,
  publishEventOutbox,
];
