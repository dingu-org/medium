import { db, type DB } from '@/lib/db';
import { TenancyError } from './errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ServiceContext = { db: DB; ptId: string };

export function getServiceClient(ptId: string | undefined | null): ServiceContext {
  if (!ptId) {
    throw new TenancyError('getServiceClient requires a ptId');
  }
  if (!UUID_RE.test(ptId)) {
    throw new TenancyError(`getServiceClient: ptId is not a valid UUID (got ${ptId})`);
  }
  return { db, ptId };
}
