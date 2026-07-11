'use client';

import { Bell, Download, RefreshCcw, Share, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AppBanner } from '@/components/ui/app-banner';
import { Button } from '@/components/ui/button';
import {
  listPendingMutations,
  type PendingMutation,
  PWA_ENGAGEMENT_EVENT,
  PWA_MUTATION_FAILED_EVENT,
  PWA_MUTATION_SYNCED_EVENT,
  replayPendingMutations,
  removeMutation,
  retryMutation,
  subscribeToQueueChanges,
} from '@/lib/pwa/client-store';
import {
  getPushPermissionState,
  isPushSupported,
  subscribeToPush,
} from '@/lib/pwa/push-client';
import { t } from '@/lib/i18n';
import { recordPwaInstalled } from '@/app/(dashboard)/pwa-install-actions';

const INSTALL_DISMISSED_KEY = 'medium:pwa-install-dismissed-at';
const PUSH_DISMISSED_KEY = 'medium:pwa-push-dismissed-at';
const DASHBOARD_VISITS_KEY = 'medium:pwa-dashboard-visits';
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export function PwaProvider() {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [counts, setCounts] = useState({ pending: 0, failed: 0, total: 0 });
  const [failedMutations, setFailedMutations] = useState<PendingMutation[]>([]);
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showPush, setShowPush] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(
    null,
  );

  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => {
      setOnline(true);
      replayPendingMutations().catch(() => undefined);
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    if (navigator.onLine) replayPendingMutations().catch(() => undefined);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    const refreshCounts = () =>
      listPendingMutations()
        .then((items) => {
          const pending = items.filter((m) => m.status === 'pending').length;
          const failed = items.filter((m) => m.status === 'failed');
          setCounts({ pending, failed: failed.length, total: items.length });
          setFailedMutations(failed);
        })
        .catch(() => undefined);
    refreshCounts();
    const unsubscribe = subscribeToQueueChanges(refreshCounts);
    return unsubscribe;
  }, []);

  useEffect(() => {
    const onSynced = () => {
      toast.success(t.pwa.pendingChangeSynced);
      router.refresh();
    };
    const onFailed = () => {
      toast.error(t.pwa.pendingChangeFailed);
      router.refresh();
    };
    window.addEventListener(PWA_MUTATION_SYNCED_EVENT, onSynced);
    window.addEventListener(PWA_MUTATION_FAILED_EVENT, onFailed);
    return () => {
      window.removeEventListener(PWA_MUTATION_SYNCED_EVENT, onSynced);
      window.removeEventListener(PWA_MUTATION_FAILED_EVENT, onFailed);
    };
  }, [router]);

  useEffect(() => {
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsIos(ios);
    setStandalone(standaloneMode);

    const visits =
      Number(localStorage.getItem(DASHBOARD_VISITS_KEY) ?? '0') + 1;
    localStorage.setItem(DASHBOARD_VISITS_KEY, String(visits));
    if (visits >= 2 && !isInstallDismissed()) setShowInstall(true);
    if (
      visits >= 2 &&
      !isPushDismissed() &&
      isPushSupported() &&
      getPushPermissionState() === 'default'
    ) {
      setShowPush(true);
    }

    const onEngaged = () => {
      if (!isInstallDismissed()) setShowInstall(true);
    };
    window.addEventListener(PWA_ENGAGEMENT_EVENT, onEngaged);
    return () => window.removeEventListener(PWA_ENGAGEMENT_EVENT, onEngaged);
  }, []);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      if (!isInstallDismissed()) setShowInstall(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let reloading = false;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        if (registration.waiting) setWaitingWorker(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (
              installing.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              setWaitingWorker(installing);
            }
          });
        });
      })
      .catch(() => undefined);

    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'MEDIUM_PWA_REPLAY_MUTATIONS') return;
      replayPendingMutations().catch(() => undefined);
    };
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      onControllerChange,
    );
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        onControllerChange,
      );
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, []);

  const statusText = useMemo(() => {
    if (!online) {
      return counts.pending > 0
        ? t.pwa.offline(counts.pending)
        : t.pwa.offlineNoChanges;
    }
    if (counts.failed > 0) return t.pwa.failedTitle(counts.failed);
    if (counts.pending > 0) {
      return t.pwa.pendingSync(counts.pending);
    }
    return null;
  }, [counts.failed, counts.pending, online]);

  const dismissPush = () => {
    localStorage.setItem(PUSH_DISMISSED_KEY, String(Date.now()));
    setShowPush(false);
  };

  if (standalone) {
    return (
      <>
        <StatusBanner
          text={statusText}
          tone={counts.failed > 0 ? 'error' : 'default'}
        />
        <FailedMutationsBanner items={failedMutations} />
        <UpdateBanner worker={waitingWorker} />
        {showPush && <PushPromptBanner onDismiss={dismissPush} />}
      </>
    );
  }

  return (
    <>
      <StatusBanner
        text={statusText}
        tone={counts.failed > 0 ? 'error' : 'default'}
      />
      <FailedMutationsBanner items={failedMutations} />
      <UpdateBanner worker={waitingWorker} />
      {showPush && <PushPromptBanner onDismiss={dismissPush} />}
      {showInstall && (
        <InstallBanner
          installEvent={installEvent}
          isIos={isIos}
          onDismiss={() => {
            localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()));
            setShowInstall(false);
          }}
        />
      )}
    </>
  );
}

function FailedMutationsBanner({ items }: { items: PendingMutation[] }) {
  if (items.length === 0) return null;
  return (
    <div className="border-destructive/20 bg-destructive/5 space-y-2 border-b px-4 py-2 text-xs">
      {items.slice(0, 3).map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-destructive font-medium">
              {formatMutationType(item.type)}
            </p>
            {item.lastError && (
              <p className="text-muted-foreground truncate">{item.lastError}</p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => retryMutation(item.id).catch(() => undefined)}
          >
            {t.pwa.retry}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => removeMutation(item.id).catch(() => undefined)}
          >
            {t.pwa.remove}
          </Button>
        </div>
      ))}
      {items.length > 3 && (
        <p className="text-muted-foreground">
          {t.pwa.moreFailedChanges(items.length - 3)}
        </p>
      )}
    </div>
  );
}

function formatMutationType(type: string): string {
  if (type === 'message.send') return t.pwa.mutationMessageFailed;
  if (type.startsWith('appointment.')) return t.pwa.mutationAppointmentFailed;
  return t.pwa.mutationChangeFailed;
}

function StatusBanner({
  text,
  tone,
}: {
  text: string | null;
  tone: 'default' | 'error';
}) {
  if (!text) return null;
  return (
    <AppBanner
      tone={tone === 'error' ? 'danger' : 'neutral'}
      className="border-x-0 border-t-0 px-4 py-2 text-center text-xs"
    >
      {text}
    </AppBanner>
  );
}

function UpdateBanner({ worker }: { worker: ServiceWorker | null }) {
  if (!worker) return null;
  return (
    <AppBanner
      tone="info"
      icon={RefreshCcw}
      className="border-x-0 border-t-0 px-4 py-2 text-xs"
      action={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => worker.postMessage({ type: 'SKIP_WAITING' })}
        >
          {t.pwa.refresh}
        </Button>
      }
    >
      {t.pwa.updateAvailable}
    </AppBanner>
  );
}

function InstallBanner({
  installEvent,
  isIos,
  onDismiss,
}: {
  installEvent: BeforeInstallPromptEvent | null;
  isIos: boolean;
  onDismiss: () => void;
}) {
  if (!installEvent && !isIos) return null;
  return (
    <AppBanner
      tone="info"
      icon={isIos ? Share : Download}
      className="border-x-0 border-t-0 px-4 py-2 text-xs"
      action={
        <div className="flex items-center gap-2">
          {!isIos && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                await installEvent?.prompt();
                const choice = await installEvent?.userChoice;
                if (choice?.outcome === 'accepted') {
                  await recordPwaInstalled().catch(() => undefined);
                }
                onDismiss();
              }}
            >
              {t.pwa.install}
            </Button>
          )}
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            aria-label={t.pwa.dismissInstall}
            onClick={onDismiss}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      }
    >
      {isIos ? t.pwa.installIos : t.pwa.installAndroid}
    </AppBanner>
  );
}

function isInstallDismissed() {
  const dismissedAt = Number(
    localStorage.getItem(INSTALL_DISMISSED_KEY) ?? '0',
  );
  return dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_MS;
}

function PushPromptBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <AppBanner
      tone="info"
      icon={Bell}
      className="border-x-0 border-t-0 px-4 py-2 text-xs"
      action={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const result = await subscribeToPush();
                if (result === 'granted') {
                  toast.success(t.settings.pushEnabledToast);
                } else if (result === 'denied') {
                  toast.error(t.settings.pushBlockedToast);
                }
              } catch {
                toast.error(t.settings.pushErrorToast);
              } finally {
                onDismiss();
              }
            }}
          >
            {t.pwa.pushEnable}
          </Button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            aria-label={t.pwa.dismissPush}
            onClick={onDismiss}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      }
    >
      {t.pwa.pushPrompt}
    </AppBanner>
  );
}

function isPushDismissed() {
  const dismissedAt = Number(localStorage.getItem(PUSH_DISMISSED_KEY) ?? '0');
  return dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_MS;
}
