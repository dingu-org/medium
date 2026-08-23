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
  postableMode,
  readSignupMessage,
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

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const session = readSignupMessage(event);
      if (session) sessionInfo.current = session;
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
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
          // Embedded Signup v4: `extras` is purposely empty. The flow version and
          // the coexistence intent now live in the Facebook Login for Business
          // configuration behind `configId` — the operator ticked "WhatsApp
          // Business app user onboarding" there on 2026-08-14 — so the v3-era
          // `featureType` / `sessionInfoVersion` keys are gone.
          // See docs/whatsapp/embedded-signup-v4-setup.md.
          extras: { setup: {} },
        });
      });

      if (cancelledRef.current) {
        setPending(false);
        return;
      }

      const code = loginResp.authResponse?.code;
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
        body: JSON.stringify({ code, phoneNumberId, wabaId, mode }),
      });

      if (res.ok) {
        // Leave `pending` true — the spinner stays up until the RSC re-renders
        // as 'active' and this component unmounts (no explainer flash).
        toast.success(t.settings.whatsappSuccess);
        router.refresh();
        return;
      }

      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setStatus(errorStatus(body.error));
      setPending(false);
    } catch {
      if (cancelledRef.current) return;
      setStatus(errorStatus(undefined));
      setPending(false);
    }
  }, [appId, configId, graphVersion, online, router]);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    abortRef.current?.abort();
    setPending(false);
    setStatus(null);
  }, []);

  if (pending) {
    return (
      <div className="flex flex-col items-center account-[90px] text-center">
        <div className="mb-[22px] inline-flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[var(--brand-50)]">
          <Loader2
            className="h-[30px] w-[30px] animate-spin text-primary"
            strokeWidth={3}
          />
        </div>
        <p className="font-heading text-[22px] font-bold tracking-[-0.025em] text-foreground">
          {t.settings.whatsappPendingTitle}
        </p>
        <p className="mt-[9px] max-w-[280px] text-sm leading-[1.55] text-ink-2">
          {t.settings.whatsappPendingBody}
        </p>
        <button
          type="button"
          onClick={handleCancel}
          className="mt-[26px] text-sm font-semibold text-ink-2"
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
            <div className="mt-2.5">
              <p className="text-ink-3 mb-2 font-mono text-[11px] font-bold tracking-[0.06em] uppercase">
                {t.settings.whatsappCommonReasons}
              </p>
              <ul className="space-y-1.5">
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
        className="flex h-[52px] w-full items-center justify-center gap-2.5 rounded-full bg-[#25D366] text-[15.5px] font-bold tracking-[-0.01em] text-white shadow-[0_10px_24px_-12px_rgba(37,211,102,0.5)] transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
      >
        <WhatsAppMark size={20} fill="#ffffff" />
        {variant === 'reconnect'
          ? t.settings.whatsappReconnectBusiness
          : t.settings.whatsappConnectBusiness}
      </button>
      {note && (
        <div className="flex items-center justify-center gap-1.5 text-xs text-ink-3">
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
