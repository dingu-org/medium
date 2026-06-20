'use client';

import { Download, RefreshCcw, Share, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
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
import { cn } from '@/lib/utils';

const INSTALL_DISMISSED_KEY = 'medium:pwa-install-dismissed-at';
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
  const [isIos, setIsIos] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

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
      toast.success('Pending change synced.');
      router.refresh();
    };
    const onFailed = () => {
      toast.error('A pending change needs attention.');
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

    const visits = Number(localStorage.getItem(DASHBOARD_VISITS_KEY) ?? '0') + 1;
    localStorage.setItem(DASHBOARD_VISITS_KEY, String(visits));
    if (visits >= 2 && !isInstallDismissed()) setShowInstall(true);

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
    if (!online) return "You're offline. Showing last loaded data.";
    if (counts.failed > 0) return `${counts.failed} changes need attention.`;
    if (counts.pending > 0) {
      return `${counts.pending} changes will sync when online.`;
    }
    return null;
  }, [counts.failed, counts.pending, online]);

  if (standalone) {
    return (
      <>
        <StatusBanner text={statusText} tone={counts.failed > 0 ? 'error' : 'default'} />
        <FailedMutationsBanner items={failedMutations} />
        <UpdateBanner worker={waitingWorker} />
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
    <div className="space-y-2 border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-xs">
      {items.slice(0, 3).map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-destructive">
              {formatMutationType(item.type)}
            </p>
            {item.lastError && (
              <p className="truncate text-muted-foreground">{item.lastError}</p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => retryMutation(item.id).catch(() => undefined)}
          >
            Retry
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => removeMutation(item.id).catch(() => undefined)}
          >
            Remove
          </Button>
        </div>
      ))}
      {items.length > 3 && (
        <p className="text-muted-foreground">
          {items.length - 3} more failed changes are still queued.
        </p>
      )}
    </div>
  );
}

function formatMutationType(type: string): string {
  if (type === 'message.send') return 'Message failed to sync';
  if (type.startsWith('appointment.')) return 'Appointment change failed';
  return 'Change failed to sync';
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
    <div
      className={cn(
        'border-b px-4 py-2 text-center text-xs',
        tone === 'error'
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-border bg-muted text-muted-foreground',
      )}
    >
      {text}
    </div>
  );
}

function UpdateBanner({ worker }: { worker: ServiceWorker | null }) {
  if (!worker) return null;
  return (
    <div className="flex items-center justify-center gap-2 border-b border-border bg-background px-4 py-2 text-xs">
      <span>New version available.</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => worker.postMessage({ type: 'SKIP_WAITING' })}
      >
        <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
        Refresh
      </Button>
    </div>
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
    <div className="flex items-center gap-3 border-b border-border bg-background px-4 py-2 text-xs">
      <Download className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-muted-foreground">
        {isIos
          ? 'Install from Safari: Share, then Add to Home Screen.'
          : 'Install Medium for faster access.'}
      </p>
      {isIos ? (
        <Share className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            await installEvent?.prompt();
            onDismiss();
          }}
        >
          Install
        </Button>
      )}
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground"
        aria-label="Dismiss install prompt"
        onClick={onDismiss}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function isInstallDismissed() {
  const dismissedAt = Number(localStorage.getItem(INSTALL_DISMISSED_KEY) ?? '0');
  return dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_MS;
}
