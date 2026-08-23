'use client';

import { useEffect } from 'react';

/**
 * Root-layout error boundary. Only fires when the root layout itself throws,
 * so it must render its own <html>/<body> and must not depend on app chrome,
 * i18n dict modules, or any other context that assumes the layout rendered —
 * copy is inlined here rather than imported. Logs only `digest`/`errorName`,
 * never `error.message` (may echo server data).
 */
export default function GlobalError({
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
        event_name: 'route.global_error',
        digest: error.digest,
        errorName: error.name,
      }),
    );
  }, [error]);

  return (
    <html lang="sq">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: '#f3f3f0',
          color: '#1a1a18',
        }}
      >
        <div style={{ textAlign: 'center', padding: '16px', maxWidth: 360 }}>
          <p style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>
            Diçka shkoi keq
          </p>
          <p style={{ fontSize: 14, opacity: 0.75, margin: '0 0 20px' }}>
            Provo të ringarkosh faqen.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              border: 'none',
              borderRadius: 10,
              minHeight: 48,
              padding: '12px 20px',
              fontSize: 14,
              fontWeight: 600,
              background: '#1a1a18',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Provo sërish
          </button>
        </div>
      </body>
    </html>
  );
}
