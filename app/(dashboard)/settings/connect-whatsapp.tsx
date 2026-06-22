'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
      init(params: { appId: string; cookie?: boolean; xfbml?: boolean; version: string }): void;
      login(
        cb: (resp: { authResponse?: { code?: string } | null; status?: string }) => void,
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

function errorMessage(kind: unknown): string {
  switch (kind) {
    case 'duplicate_number':
      return 'That number is already connected to another provider. Disconnect it there, then retry.';
    case 'rejected':
      return 'Meta could not verify the business. Check your details and try again.';
    case 'token_exchange_failed':
    default:
      return 'Could not complete the connection. Please try again.';
  }
}

export function ConnectWhatsApp({ appId, configId, graphVersion, connected }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const online = useOnlineStatus();
  // Meta delivers phone_number_id + waba_id via a postMessage during the popup,
  // separately from the FB.login auth code — capture it here.
  const sessionInfo = useRef<{ phoneNumberId?: string; wabaId?: string }>({});

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!event.origin.endsWith('facebook.com')) return;
      let data: { type?: string; event?: string; data?: Record<string, unknown> };
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
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
        toast.info(t.settings.whatsappIncomplete);
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
      toast.error(errorMessage(body.error));
    } catch {
      toast.error(t.settings.whatsappFailed);
    } finally {
      setPending(false);
    }
  }, [appId, configId, graphVersion, online, router]);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        onClick={handleClick}
        disabled={pending || !appId || !configId || !online}
      >
        {pending
          ? 'Connecting…'
          : connected
            ? 'Reconnect WhatsApp Business app'
            : 'Connect WhatsApp Business app'}
      </Button>
      {!online && (
        <p className="text-xs text-muted-foreground">
          WhatsApp signup requires a connection.
        </p>
      )}
    </div>
  );
}
