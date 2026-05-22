import type { InngestFunction } from 'inngest';
import { bootstrapWaConnection } from './functions/bootstrap-wa-connection';

export const functions: InngestFunction.Like[] = [bootstrapWaConnection];
