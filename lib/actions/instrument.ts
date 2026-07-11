import { unstable_rethrow } from 'next/navigation';
import { logger, newTraceId, serializeError } from '@/lib/log';

/**
 * Wrap a Server Action so any thrown error is visible in platform logs with a
 * trace id and no PII (Phase 11 acceptance criterion 1).
 *
 * `unstable_rethrow` (from `next/navigation`) re-throws Next's router
 * control-flow errors — `redirect()`/`notFound()`/`forbidden()`, including via
 * `error.cause` — before we log, so an intentional `redirect('/sign-in')` inside
 * an action (e.g. `requirePtId()`) passes through un-logged as a non-error.
 * Everything else is logged as `action.error` and re-thrown unchanged.
 *
 * v1 takes no `ptId` extractor: every wrapped action's first arg is a
 * conversation/appointment id, not a pt id (the pt id is derived *inside* the
 * action via `requirePtId()`), so `pt_id` is not derivable at this boundary.
 * `trace_id` is the join key — deeper logs (engine/tenancy/graph) already carry
 * `pt_id`, and both share the trace when correlated by time/pt.
 */
export function instrumentedAction<TArgs extends unknown[], TReturn>(
  name: string,
  fn: (...args: TArgs) => Promise<TReturn>,
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    const trace_id = newTraceId();
    try {
      return await fn(...args);
    } catch (error) {
      unstable_rethrow(error);
      logger.error('action.error', name, {
        trace_id,
        action: name,
        ...serializeError(error),
      });
      throw error;
    }
  };
}
