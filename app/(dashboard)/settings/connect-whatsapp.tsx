'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

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
      return 'That number is already connected elsewhere. Disconnect it from regular WhatsApp first, then retry.';
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
  // Meta delivers phone_number_id + waba_id via a postMessage during the popup,
  // separately from the FB.login auth code — capture it here.
  const sessionInfo = useRef<{ phoneNumberId?: string; wabaId?: string }>({});

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!event.origin.endsWith('facebook.com')) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'WA_EMBEDDED_SIGNUP' && data?.event === 'FINISH') {
          sessionInfo.current = {
            phoneNumberId: data.data?.phone_number_id,
            wabaId: data.data?.waba_id,
          };
        }
      } catch {
        // Unrelated or non-JSON message — ignore.
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const handleClick = useCallback(async () => {
    if (!appId || !configId) {
      toast.error('WhatsApp signup is not configured.');
      return;
    }
    // Facebook blocks FB.login on http:// pages. Local dev is http://localhost,
    // so signup must be exercised over HTTPS (Vercel preview or an HTTPS tunnel).
    if (window.location.protocol !== 'https:') {
      toast.error(
        'WhatsApp signup requires HTTPS — Facebook blocks it on http:// pages. Open the app over HTTPS (the Vercel preview or an HTTPS tunnel).',
      );
      return;
    }
    setPending(true);
    sessionInfo.current = {};
    try {
      await loadFbSdk(appId, graphVersion);
      const fb = window.FB;
      if (!fb) throw new Error('FB SDK unavailable');

      const authResponse = await new Promise<{ code?: string } | null>((resolve) => {
        fb.login((resp) => resolve(resp.authResponse ?? null), {
          config_id: configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
        });
      });

      const code = authResponse?.code;
      const { phoneNumberId, wabaId } = sessionInfo.current;
      if (!code || !phoneNumberId || !wabaId) {
        toast.info('Connection incomplete — you can resume anytime.');
        return;
      }

      const res = await fetch('/api/auth/meta-embedded', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ code, phoneNumberId, wabaId }),
      });

      if (res.ok) {
        toast.success('WhatsApp connected.');
        router.refresh();
        return;
      }

      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(errorMessage(body.error));
    } catch (err) {
      console.error('[connect-whatsapp]', err);
      toast.error('Something went wrong connecting WhatsApp. Please try again.');
    } finally {
      setPending(false);
    }
  }, [appId, configId, graphVersion, router]);

  return (
    <Button type="button" onClick={handleClick} disabled={pending || !appId || !configId}>
      {pending ? 'Connecting…' : connected ? 'Reconnect WhatsApp' : 'Connect WhatsApp'}
    </Button>
  );
}
