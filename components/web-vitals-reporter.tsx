'use client';

import { useReportWebVitals } from 'next/web-vitals';

/**
 * Perf-budget signal (Phase 11): samples 25% of Core Web Vitals reports and
 * beacons them to a cheap, unauthenticated sink (`/api/metrics/vitals`) for
 * launch-period review. No PII — just metric name/value/path.
 */
export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (Math.random() >= 0.25) return;
    const body = JSON.stringify({
      name: metric.name,
      value: metric.value,
      path: window.location.pathname,
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/metrics/vitals', body);
    } else {
      fetch('/api/metrics/vitals', {
        method: 'POST',
        body,
        keepalive: true,
      }).catch(() => undefined);
    }
  });

  return null;
}
