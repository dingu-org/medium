'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

/**
 * Route-segment error boundary. Logs only `digest`/`errorName` client-side —
 * `error.message` can echo server-thrown data (including data that reached the
 * client via a thrown Error), so it never goes into the client console line.
 * Full server-side detail (with message + stack) is already captured by
 * `instrumentedAction`/route-handler logging before this boundary ever renders.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      JSON.stringify({
        level: 'error',
        event_name: 'route.error_boundary',
        digest: error.digest,
        errorName: error.name,
      }),
    );
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <ErrorState
        action={
          <Button onClick={reset} className="mt-1">
            {t.actions.tryAgain}
          </Button>
        }
      />
    </div>
  );
}
