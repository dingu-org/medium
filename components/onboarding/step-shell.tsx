'use client';

import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { t } from '@/lib/i18n';
import { type FlowProgress, type FlowScreenId } from '@/lib/onboarding/flow';
import type { StepActionResult } from '@/lib/onboarding/step-result';
import { cn } from '@/lib/utils';
import { BottomBar } from './bottom-bar';
import { ProgressHeader } from './progress-header';
import { clearStepDraft } from './use-step-draft';
import { useVisualViewport } from './use-visual-viewport';

type Handler = () => Promise<StepActionResult>;

export type StepShellProps = {
  screen: FlowScreenId;
  /** `null`: no count (a completed account reopening a step). */
  progress: FlowProgress | null;
  /** `null`: no Back (first and Finish screens). */
  backHref: string | null;
  /** Keys unsaved drafts and the sign-out cleanup. */
  accountId: string;
  /** The shell renders the h1 and moves focus to it on every step. */
  heading: string;
  /** Rendered inside `main`, above the heading (e.g. a brand mark). */
  leading?: ReactNode;
  subheading?: ReactNode;
  align?: 'start' | 'center';
  /** `null` / omitted: no main button (the WhatsApp choice screen). */
  primary?: { label: string; onPress: Handler } | null;
  /** A text link under the button, never a second button. */
  skip?: { label: string; onPress: Handler };
  helper?: string;
  children:
    | ReactNode
    | ((state: {
        fieldErrors: Record<string, string>;
        pending: boolean;
      }) => ReactNode);
};

// Set by the browser's Back/Forward, read once by the next shell mount. Next's
// router restores those entries from its cache, so the mount refreshes them.
let lastNavigationWasPop = false;
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    lastNavigationWasPop = true;
  });
}

const markerKey = (href: string) => `onb:from:${href}`;

function readMarker(href: string): string | null {
  try {
    return window.sessionStorage.getItem(markerKey(href));
  } catch {
    return null;
  }
}

function writeMarker(href: string, from: string): void {
  try {
    window.sessionStorage.setItem(markerKey(href), from);
  } catch {
    // Storage blocked: Back falls back to replace.
  }
}

/**
 * The frame every guided-onboarding screen renders in: progress header, one
 * scrolling `main`, and the fixed bottom bar (see MED-115). Steps pass a
 * `primary` handler that saves and returns a `StepActionResult`; the shell owns
 * double-press protection, error display, retry, focus and history.
 */
export function StepShell({
  screen,
  progress,
  backHref,
  accountId,
  heading,
  leading,
  subheading,
  align = 'start',
  primary,
  skip,
  helper,
  children,
}: StepShellProps) {
  const router = useRouter();
  const f = t.onboarding.flow;
  const rootRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);
  const lastHandler = useRef<Handler | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [errorTick, setErrorTick] = useState(0);
  const [announcement, setAnnouncement] = useState('');

  useVisualViewport(rootRef);

  const label =
    progress === null
      ? null
      : progress.kind === 'complete'
        ? f.done
        : f.stepOf(progress.position, progress.total);

  useEffect(() => {
    headingRef.current?.focus();
    setAnnouncement(label ?? heading);
    if (lastNavigationWasPop) {
      lastNavigationWasPop = false;
      router.refresh();
    }
  }, [label, heading, router]);

  // After a rejected save, focus the first field the step marked invalid.
  useEffect(() => {
    if (errorTick === 0) return;
    rootRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [errorTick]);

  const run = useCallback(
    async (handler: Handler) => {
      if (inFlight.current) return;
      inFlight.current = true;
      lastHandler.current = handler;
      setPending(true);
      setFailed(false);
      setReason(null);
      setFieldErrors({});
      try {
        const result = await handler();
        if (result.ok) {
          const target = result.next;
          clearStepDraft(accountId, screen);
          if (target === window.location.pathname) {
            // Nothing to move to (e.g. the step is still the resume point):
            // show the fresh server state instead of hanging on "saving".
            router.refresh();
            inFlight.current = false;
            setPending(false);
            return;
          }
          // Keyed by the real URL, so a nested sub-screen has its own marker.
          writeMarker(target, window.location.pathname);
          lastNavigationWasPop = false;
          // Stay pending until the next screen replaces this one, so a second
          // press cannot fire while the route is changing.
          if (result.replace) router.replace(target);
          else router.push(target);
          return;
        }
        setFieldErrors(result.fieldErrors ?? {});
        setReason(result.reason ?? f.fixErrors);
        setErrorTick((tick) => tick + 1);
      } catch {
        // Thrown or rejected (including a network failure): the step state is
        // untouched, so everything the user typed is still on screen.
        setFailed(true);
      }
      inFlight.current = false;
      setPending(false);
    },
    [accountId, f.fixErrors, router, screen],
  );

  const onBack = () => {
    if (!backHref) return;
    // Pushed from the previous screen: step back through history, so system
    // Back and this icon agree. Otherwise (resumed here) replace, never push
    // a "backwards" entry that system Back would then walk forward through.
    if (readMarker(window.location.pathname) === backHref) router.back();
    else router.replace(backHref);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (primary) void run(primary.onPress);
  };

  return (
    <form
      ref={rootRef}
      noValidate
      onSubmit={onSubmit}
      className="bg-background fixed inset-x-0 flex flex-col"
      style={{ top: 'var(--ob-vvtop, 0px)', height: 'var(--ob-vvh, 100dvh)' }}
    >
      <ProgressHeader
        progress={progress}
        showBack={backHref != null}
        onBack={onBack}
      />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <main
        className={cn(
          'mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col overflow-y-auto px-4 pt-4 pb-6',
          // Auto margins centre when there is room and start at the top when
          // there is not; `justify-center` would clip the top of the content.
          align === 'center' &&
            'items-center text-center [&>:first-child]:mt-auto [&>:last-child]:mb-auto',
        )}
      >
        {leading}
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-heading text-[29px] leading-tight font-semibold tracking-[-0.03em] outline-none"
        >
          {heading}
        </h1>
        {subheading && (
          <div className="text-ink-2 mt-2 text-[14.5px] leading-normal">
            {subheading}
          </div>
        )}
        <div className={cn('mt-6 w-full', align === 'center' && 'mt-4')}>
          {typeof children === 'function'
            ? children({ fieldErrors, pending })
            : children}
        </div>
      </main>
      <div className="mx-auto w-full max-w-md">
        <BottomBar
          primaryLabel={primary?.label ?? null}
          skipLabel={skip?.label ?? null}
          helper={helper ?? f.helper}
          pending={pending}
          failed={failed}
          reason={reason}
          onRetry={() => {
            if (lastHandler.current) void run(lastHandler.current);
          }}
          onSkip={() => {
            if (skip) void run(skip.onPress);
          }}
        />
      </div>
    </form>
  );
}
