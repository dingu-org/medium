'use client';

import { AlertCircle, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AppBanner } from '@/components/ui/app-banner';
import { WhatsAppMark } from '@/components/ui/whatsapp-mark';
import { t } from '@/lib/i18n';
import { useOnlineStatus } from '@/lib/hooks/realtime';

type Props = {
  appId: string;
  configId: string;
  graphVersion: string;
  connected: boolean;
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
  connected,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<WaStatus | null>(null);
  const online = useOnlineStatus();
  // Meta delivers phone_number_id + waba_id via a postMessage during the popup,
  // separately from the FB.login auth code — capture it here.
  const sessionInfo = useRef<{ phoneNumberId?: string; wabaId?: string }>({});

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!event.origin.endsWith('facebook.com')) return;
      let data: {
        type?: string;
        event?: string;
        data?: Record<string, unknown>;
      };
      try {
        data =
          typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return; // non-JSON message — ignore
      }
      if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
      // FINISH carries phone_number_id + waba_id; FINISH_ONLY_WABA omits the number.
      if (typeof data.event === 'string' && data.event.startsWith('FINISH')) {
        sessionInfo.current = {
          phoneNumberId: data.data?.phone_number_id as string | undefined,
          wabaId: data.data?.waba_id as string | undefined,
        };
      }
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
          extras: {
            setup: {},
            featureType: 'whatsapp_business_app_onboarding',
            sessionInfoVersion: '3',
          },
        });
      });

      const code = loginResp.authResponse?.code;
      const { phoneNumberId, wabaId } = sessionInfo.current;
      if (!code || !wabaId) {
        setStatus({
          tone: 'warning',
          title: t.settings.whatsappIncompleteTitle,
          body: t.settings.whatsappIncomplete,
        });
        return;
      }

      const res = await fetch('/api/auth/meta-embedded', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          code,
          phoneNumberId,
          wabaId,
          mode: 'coexistence',
        }),
      });

      if (res.ok) {
        toast.success(t.settings.whatsappSuccess);
        router.refresh();
        return;
      }

      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setStatus(errorStatus(body.error));
    } catch {
      setStatus(errorStatus(undefined));
    } finally {
      setPending(false);
    }
  }, [appId, configId, graphVersion, online, router]);

  return (
    <div className="space-y-3">
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
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#25D366] text-[15px] font-bold tracking-[-0.01em] text-white transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
      >
        <WhatsAppMark size={18} fill="#ffffff" />
        {pending
          ? t.settings.whatsappConnecting
          : connected
            ? t.settings.whatsappReconnectBusiness
            : t.settings.whatsappConnectBusiness}
      </button>
      {!online && (
        <p className="text-ink-3 text-xs">
          {t.settings.whatsappRequiresConnection}
        </p>
      )}
    </div>
  );
}
