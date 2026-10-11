'use client';

import { AlertCircle, Clock, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AppBanner } from '@/components/ui/app-banner';
import { WhatsAppMark } from '@/components/ui/whatsapp-mark';
import { t } from '@/lib/i18n';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import {
  MAX_SIGNUP_MESSAGE_SUMMARIES,
  classifySignupRefusal,
  describeSignupMessage,
  postableMode,
  readSignupMessage,
  type SignupMessageSummary,
  type SignupSession,
} from './whatsapp-signup';

type Props = {
  appId: string;
  configId: string;
  graphVersion: string;
  /** Picks the CTA label; the revoked screen passes 'reconnect'. */
  variant?: 'connect' | 'reconnect';
  /** Clock helper line under the CTA. */
  note?: string;
  /** Explainer / warning card above the CTA; hidden while pending. */
  children?: ReactNode;
};

// Minimal slice of the Facebook JS SDK we depend on.
declare global {
  interface Window {
    FB?: {
      init(params: {
        appId: string;
        cookie?: boolean;
        xfbml?: boolean;
        version: string;
      }): void;
      login(
        cb: (resp: {
          authResponse?: { code?: string } | null;
          status?: string;
        }) => void,
        opts: Record<string, unknown>,
      ): void;
    };
    fbAsyncInit?: () => void;
  }
}

// Module-level so the SDK loads at most once across mounts.
let sdkPromise: Promise<void> | null = null;

function loadFbSdk(appId: string, version: string): Promise<void> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, cookie: true, xfbml: false, version });
      resolve();
    };
    const js = document.createElement('script');
    js.id = 'facebook-jssdk';
    js.src = 'https://connect.facebook.net/en_US/sdk.js';
    js.async = true;
    js.defer = true;
    js.crossOrigin = 'anonymous';
    js.onerror = () => reject(new Error('Failed to load the Facebook SDK'));
    document.body.appendChild(js);
  });
  return sdkPromise;
}

// Marks a signup in flight so a page that reloads mid-popup — losing every ref
// and state below — can tell on its next mount that an attempt was cut short.
const ATTEMPT_STORAGE_KEY = 'medium.wa-signup-attempt';

function readInterruptedAttempt(): string | null {
  try {
    const id = window.sessionStorage.getItem(ATTEMPT_STORAGE_KEY);
    if (id) window.sessionStorage.removeItem(ATTEMPT_STORAGE_KEY);
    return id;
  } catch {
    return null; // storage blocked — diagnostics only, never fatal
  }
}

function markAttempt(id: string | null): void {
  try {
    if (id) window.sessionStorage.setItem(ATTEMPT_STORAGE_KEY, id);
    else window.sessionStorage.removeItem(ATTEMPT_STORAGE_KEY);
  } catch {
    // storage blocked — diagnostics only, never fatal
  }
}

/**
 * Fire-and-forget report to the signup diagnostics endpoint. Nothing here may
 * affect the flow: no await at the call sites, every failure swallowed.
 * `keepalive` lets the report outlive a page that is unloading.
 */
function reportSignup(report: Record<string, unknown>): void {
  try {
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    void fetch('/api/auth/meta-embedded/diagnostics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({
        ...report,
        displayMode: standalone ? 'standalone' : 'browser',
      }),
    }).catch(() => undefined);
  } catch {
    // diagnostics only
  }
}

type WaStatus = {
  tone: 'warning' | 'danger';
  title: string;
  body: string;
  reasons?: readonly string[];
};

// Persistent status card per the canvas WAStatus states — an error from
// Meta shouldn't vanish with a toast.
function errorStatus(kind: unknown): WaStatus {
  switch (kind) {
    case 'duplicate_number':
      return {
        tone: 'danger',
        title: t.settings.whatsappErrDuplicateTitle,
        body: t.settings.whatsappErrDuplicate,
      };
    case 'rejected':
      return {
        tone: 'danger',
        title: t.settings.whatsappErrRejectedTitle,
        body: t.settings.whatsappErrRejected,
        reasons: t.settings.whatsappErrRejectedReasons,
      };
    case 'token_exchange_failed':
    default:
      return {
        tone: 'danger',
        title: t.settings.whatsappFailedTitle,
        body: t.settings.whatsappFailed,
      };
  }
}

export function ConnectWhatsApp({
  appId,
  configId,
  graphVersion,
  variant = 'connect',
  note,
  children,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<WaStatus | null>(null);
  const online = useOnlineStatus();
  // Meta delivers the finish event + phone_number_id + waba_id via a postMessage
  // during the popup, separately from the FB.login auth code — capture it here.
  // The event name is what says which mode the PT actually onboarded in.
  const sessionInfo = useRef<SignupSession>({});
  // Honest cancel scope: we cannot force-close Meta's browser-owned popup, but
  // cancel discards the pending result (and aborts an in-flight POST). If the
  // server persisted before the abort landed, the DB is the source of truth —
  // the next server render shows connected.
  const cancelledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  // Diagnostic trail for the attempt in flight (null between attempts): what
  // the popup posted, including the events and origins readSignupMessage drops.
  const attemptRef = useRef<{
    id: string;
    startedAt: number;
    messages: SignupMessageSummary[];
  } | null>(null);

  /** Report the attempt's terminal outcome and close it. */
  const finishAttempt = useCallback(
    (outcome: string, extra: Record<string, unknown> = {}) => {
      const attempt = attemptRef.current;
      if (!attempt) return;
      attemptRef.current = null;
      markAttempt(null);
      reportSignup({
        attemptId: attempt.id,
        outcome,
        messages: attempt.messages,
        elapsedMs: Date.now() - attempt.startedAt,
        ...extra,
      });
    },
    [],
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const attempt = attemptRef.current;
      if (attempt && attempt.messages.length < MAX_SIGNUP_MESSAGE_SUMMARIES) {
        const summary = describeSignupMessage(event);
        if (summary) attempt.messages.push(summary);
      }
      const session = readSignupMessage(event);
      if (session) sessionInfo.current = session;
    }
    // The page going away mid-signup is the one outcome no code path below can
    // observe. `pagehide` also fires for a page entering the bfcache, so the
    // attempt is reported but left open: if the page survives, its real
    // terminal outcome still follows.
    function onPageHide() {
      const attempt = attemptRef.current;
      if (!attempt) return;
      reportSignup({
        attemptId: attempt.id,
        outcome: 'page_unloaded',
        messages: attempt.messages,
        elapsedMs: Date.now() - attempt.startedAt,
      });
    }
    window.addEventListener('message', onMessage);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  // A leftover marker means the previous page instance died mid-signup. Without
  // this the PT lands on a bare Connect button with no explanation at all.
  useEffect(() => {
    const interrupted = readInterruptedAttempt();
    if (!interrupted) return;
    reportSignup({ attemptId: interrupted, outcome: 'resumed_after_reload' });
    setStatus({
      tone: 'warning',
      title: t.settings.whatsappIncompleteTitle,
      body: t.settings.whatsappIncomplete,
    });
  }, []);

  const handleClick = useCallback(async () => {
    if (!online) {
      toast.error(t.settings.whatsappRequiresConnection);
      return;
    }
    if (!appId || !configId) {
      toast.error(t.settings.whatsappNotConfigured);
      return;
    }
    // Facebook blocks FB.login on http:// pages. Local dev is http://localhost,
    // so signup must be exercised over HTTPS (Vercel preview or an HTTPS tunnel).
    if (window.location.protocol !== 'https:') {
      toast.error(t.settings.whatsappRequiresHttps);
      return;
    }
    setPending(true);
    setStatus(null);
    cancelledRef.current = false;
    sessionInfo.current = {};
    const attemptId = crypto.randomUUID();
    attemptRef.current = { id: attemptId, startedAt: Date.now(), messages: [] };
    markAttempt(attemptId);
    reportSignup({ attemptId, outcome: 'started' });
    try {
      await loadFbSdk(appId, graphVersion);
      const fb = window.FB;
      if (!fb) throw new Error('FB SDK unavailable');

      const loginResp = await new Promise<{
        authResponse?: { code?: string } | null;
        status?: string;
      }>((resolve) => {
        fb.login((resp) => resolve(resp), {
          config_id: configId,
          response_type: 'code',
          override_default_response_type: true,
          // Embedded Signup v4. `featureType` selects the onboarding branch and
          // must still be sent even though the Facebook Login for Business
          // configuration behind `configId` also has "WhatsApp Business app user
          // onboarding" ticked (2026-08-14): the 2026-09-04 live test proved the
          // config toggle alone is not enough — Meta opened the standard Cloud
          // API number picker and rejected the operator's existing Business-app
          // number. Meta's current v4 + Coexistence docs still require this key.
          // `setup: {}` is the v4 payload shape; the v3-era `sessionInfoVersion`
          // stays gone. See docs/features/whatsapp-connection.md.
          extras: {
            featureType: 'whatsapp_business_app_onboarding',
            setup: {},
          },
        });
      });

      const code = loginResp.authResponse?.code;
      const login = { loginStatus: loginResp.status, hasCode: Boolean(code) };
      const refusal = classifySignupRefusal({
        cancelled: cancelledRef.current,
        hasCode: Boolean(code),
        session: sessionInfo.current,
      });
      if (refusal) finishAttempt(refusal, login);

      if (cancelledRef.current) {
        setPending(false);
        return;
      }

      const { phoneNumberId, wabaId } = sessionInfo.current;
      const mode = postableMode(sessionInfo.current);
      if (!code || !mode) {
        setStatus({
          tone: 'warning',
          title: t.settings.whatsappIncompleteTitle,
          body: t.settings.whatsappIncomplete,
        });
        setPending(false);
        return;
      }

      abortRef.current = new AbortController();
      const res = await fetch('/api/auth/meta-embedded', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        signal: abortRef.current.signal,
        body: JSON.stringify({ code, phoneNumberId, wabaId, mode, attemptId }),
      });

      if (res.ok) {
        finishAttempt('post_ok', { ...login, httpStatus: res.status });
        // Leave `pending` true — the spinner stays up until the RSC re-renders
        // as 'active' and this component unmounts (no explainer flash).
        toast.success(t.settings.whatsappSuccess);
        router.refresh();
        return;
      }

      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        traceId?: string;
      };
      finishAttempt('post_failed', {
        ...login,
        httpStatus: res.status,
        errorKind: body.error,
        serverTraceId: body.traceId,
      });
      setStatus(errorStatus(body.error));
      setPending(false);
    } catch (err) {
      finishAttempt(cancelledRef.current ? 'cancelled_by_user' : 'threw', {
        errorName: err instanceof Error ? err.name : typeof err,
        errorMessage: (err instanceof Error ? err.message : String(err)).slice(
          0,
          200,
        ),
      });
      if (cancelledRef.current) return;
      setStatus(errorStatus(undefined));
      setPending(false);
    }
  }, [appId, configId, finishAttempt, graphVersion, online, router]);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    abortRef.current?.abort();
    finishAttempt('cancelled_by_user');
    setPending(false);
    setStatus(null);
  }, [finishAttempt]);

  if (pending) {
    return (
      <div className="flex flex-col items-center pt-24 text-center">
        <div className="mb-5 inline-flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[var(--brand-50)]">
          <Loader2
            className="text-primary h-[30px] w-[30px] animate-spin"
            strokeWidth={3}
          />
        </div>
        <p className="font-heading text-foreground text-[22px] font-bold tracking-[-0.025em]">
          {t.settings.whatsappPendingTitle}
        </p>
        <p className="text-ink-2 mt-2 max-w-[280px] text-sm leading-[1.55]">
          {t.settings.whatsappPendingBody}
        </p>
        <button
          type="button"
          onClick={handleCancel}
          className="text-ink-2 mt-4 inline-flex min-h-11 items-center px-4 text-sm font-semibold"
        >
          {t.actions.cancel}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {children}
      {status && (
        <AppBanner
          tone={status.tone}
          icon={status.tone === 'danger' ? X : AlertCircle}
          title={status.title}
        >
          <p>{status.body}</p>
          {status.reasons && (
            <div className="mt-3">
              <p className="text-ink-3 mb-2 font-mono text-[11px] font-bold tracking-[0.06em] uppercase">
                {t.settings.whatsappCommonReasons}
              </p>
              <ul className="space-y-2">
                {status.reasons.map((reason) => (
                  <li key={reason} className="flex gap-2 text-[13px]">
                    <span className="text-destructive" aria-hidden>
                      •
                    </span>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </AppBanner>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={pending || !appId || !configId || !online}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#25D366] text-[15.5px] font-bold tracking-[-0.01em] text-white shadow-[0_10px_24px_-12px_rgba(37,211,102,0.5)] transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
      >
        <WhatsAppMark size={20} fill="#ffffff" />
        {variant === 'reconnect'
          ? t.settings.whatsappReconnectBusiness
          : t.settings.whatsappConnectBusiness}
      </button>
      {note && (
        <div className="text-ink-3 flex items-center justify-center gap-2 text-xs">
          <Clock className="h-[13px] w-[13px]" aria-hidden />
          {note}
        </div>
      )}
      {!online && (
        <p className="text-ink-3 text-center text-xs">
          {t.settings.whatsappRequiresConnection}
        </p>
      )}
    </div>
  );
}
