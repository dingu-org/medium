import { db, type DB } from '@/lib/db';
import { TenancyError } from './errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ServiceContext = { db: DB; accountId: string };

export function getServiceClient(accountId: string | undefined | null): ServiceContext {
  if (!accountId) {
    throw new TenancyError('getServiceClient requires a accountId');
  }
  if (!UUID_RE.test(accountId)) {
    throw new TenancyError(`getServiceClient: accountId is not a valid UUID (got ${accountId})`);
  }
  return { db, accountId };
}
