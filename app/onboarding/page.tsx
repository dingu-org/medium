import { Check, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PLANS } from '@/lib/billing/plans';
import { Button } from '@/components/ui/button';
import { formatLek, t } from '@/lib/i18n';
import { getOnboardingState } from '@/lib/onboarding/state';
import { getServices } from '@/lib/services/queries';
import { createServerClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import {
  confirmServices,
  continueSetup,
  dismissAndGo,
  skipPlanStep,
} from './actions';

/**
 * Compressed, skippable plan card (Phase 16 C6). Reads as optional — "Zgjidh
 * Solo" routes to /settings/billing (via continueSetup, which sets the setup
 * cookie so the dashboard gate lets the PT through); "Vazhdo me Falas" records
 * the skip. It never blocks reaching the dashboard.
 */
function PlanStep() {
  const free = PLANS.free;
  const solo = PLANS.solo;
  return (
    <section className="border-border bg-card mt-8 rounded-lg border p-5 text-left">
      <h2 className="text-lg font-semibold">{t.billing.onboardingTitle}</h2>
      <p className="text-muted-foreground mt-1 text-sm leading-6">
        {t.billing.onboardingSub}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="border-border rounded-md border p-4">
          <p className="font-heading font-semibold">{t.billing.planFree}</p>
          <ul className="text-ink-2 mt-2 space-y-1 text-[13px]">
            <li>{t.billing.featConversations(free.conversationsPerMonth)}</li>
            <li>{t.billing.featReminders(free.remindersPerMonth)}</li>
            <li>{t.billing.featOneService}</li>
          </ul>
        </div>
        <div className="rounded-md border border-[var(--brand-500)] bg-[var(--brand-50)] p-4">
          <div className="flex items-center justify-between">
            <p className="font-heading font-semibold">{t.billing.planSolo}</p>
            <span className="rounded-full bg-[var(--brand-500)] px-2 py-0.5 text-[11px] font-semibold text-white">
              {t.billing.landingSoloTag}
            </span>
          </div>
          <ul className="text-ink-2 mt-2 space-y-1 text-[13px]">
            <li>{t.billing.featConversations(solo.conversationsPerMonth)}</li>
            <li>{t.billing.featReminders(solo.remindersPerMonth)}</li>
            <li>{t.billing.featEverything}</li>
          </ul>
          {solo.price && (
            <p className="text-ink-3 mt-2 text-[12.5px] tabular-nums">
              {t.billing.priceMonthly(formatLek(solo.price.monthly))}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <form action={continueSetup}>
          <input type="hidden" name="href" value="/settings/billing" />
          <Button type="submit" className="w-full">
            {t.billing.onboardingChooseSolo}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </form>
        <form action={skipPlanStep}>
          <Button type="submit" variant="outline" className="w-full">
            {t.billing.onboardingContinueFree}
          </Button>
        </form>
      </div>
    </section>
  );
}

export const metadata = { title: t.onboarding.metaTitle };

type Step = {
  key: string;
  title: string;
  description: string;
  done: boolean;
  href?: string;
  cta?: string;
};

export default async function OnboardingPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const [state, configuredServices] = await Promise.all([
    getOnboardingState(user.id),
    getServices(user.id),
  ]);
  const steps: Step[] = [
    {
      key: 'profile',
      title: t.onboarding.steps.profileTitle,
      description: t.onboarding.steps.profileSub,
      done: state.profile,
      href: '/settings/profile',
      cta: t.onboarding.steps.profileCta,
    },
    {
      key: 'whatsapp',
      title: t.onboarding.steps.whatsappTitle,
      description: t.onboarding.steps.whatsappSub,
      done: state.whatsapp,
      href: '/settings/whatsapp',
      cta: t.onboarding.steps.whatsappCta,
    },
    {
      key: 'availability',
      title: t.onboarding.steps.availabilityTitle,
      description: t.onboarding.steps.availabilitySub,
      done: state.availability,
      href: '/settings/availability',
      cta: t.onboarding.steps.availabilityCta,
    },
    {
      key: 'services',
      title: t.onboarding.steps.servicesTitle,
      description: t.onboarding.steps.servicesSub,
      done: state.services,
      href: '/settings/services',
      cta: t.onboarding.steps.servicesCta,
    },
    {
      key: 'testMessage',
      title: t.onboarding.steps.testMessageTitle,
      description: t.onboarding.steps.testMessageSub,
      done: state.testMessage,
    },
  ];
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => !step.done),
  );
  const current = steps[currentIndex];

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-sm flex-col">
      <header className="pb-8 text-center">
        <Link
          href="/"
          className="font-heading text-primary text-xl font-semibold"
        >
          Medium
        </Link>
      </header>

      {state.complete ? (
        <div className="flex flex-1 flex-col justify-center text-center">
          <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--success-100)] text-[var(--success-700)]">
            <Check className="h-7 w-7" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold">{t.onboarding.allSetTitle}</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            {t.onboarding.allSetSub}
          </p>
          {!state.plan && <PlanStep />}
          <Button asChild className="mt-8 w-full">
            <Link href="/today">{t.onboarding.goToApp}</Link>
          </Button>
        </div>
      ) : (
        <>
          <div
            className="mb-10 flex items-center justify-center"
            aria-label={t.onboarding.progress(
              state.completedCount,
              state.total,
            )}
          >
            {steps.map((step, index) => (
              <div key={step.key} className="flex items-center">
                <span
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold tabular-nums',
                    step.done &&
                      'border-primary bg-primary text-primary-foreground',
                    !step.done &&
                      index === currentIndex &&
                      'border-primary text-primary',
                    !step.done &&
                      index !== currentIndex &&
                      'border-border text-muted-foreground',
                  )}
                >
                  {step.done ? (
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    index + 1
                  )}
                </span>
                {index < steps.length - 1 && (
                  <span
                    className={cn(
                      'h-px w-7',
                      step.done ? 'bg-primary' : 'bg-border',
                    )}
                  />
                )}
              </div>
            ))}
          </div>

          <main className="flex flex-1 flex-col">
            <p className="text-primary text-xs font-medium uppercase">
              {t.onboarding.stepOf(currentIndex + 1, steps.length)}
            </p>
            <h1 className="mt-2 text-2xl font-semibold">{current.title}</h1>
            <p className="text-muted-foreground mt-2 text-sm leading-6">
              {current.description}
            </p>

            {current.key === 'services' && (
              <div className="border-border bg-card mt-6 overflow-hidden rounded-md border text-sm">
                {configuredServices.map((service) => (
                  <div
                    key={service.id}
                    className="border-border flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
                  >
                    <span
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded border',
                        service.active
                          ? 'border-primary bg-primary text-white'
                          : 'border-border',
                      )}
                    >
                      {service.active && (
                        <Check className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </span>
                    {service.name} · {service.durationMinutes} min
                  </div>
                ))}
              </div>
            )}

            <div className="mt-auto space-y-3 pt-10">
              {current.key === 'services' ? (
                <>
                  <form action={confirmServices}>
                    <Button type="submit" className="w-full">
                      Vazhdo me këto shërbime
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </Button>
                  </form>
                  <form action={continueSetup}>
                    <input
                      type="hidden"
                      name="href"
                      value="/settings/services"
                    />
                    <Button type="submit" variant="outline" className="w-full">
                      {current.cta}
                    </Button>
                  </form>
                </>
              ) : current.href && current.cta ? (
                <form action={continueSetup}>
                  <input type="hidden" name="href" value={current.href} />
                  <Button type="submit" className="w-full">
                    {current.cta}
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </Button>
                </form>
              ) : (
                <Button asChild className="w-full">
                  <Link href="/onboarding">Kontrollo përsëri</Link>
                </Button>
              )}
              <form action={dismissAndGo} className="text-center">
                <input type="hidden" name="href" value="/today" />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                >
                  {t.onboarding.skip}
                </Button>
              </form>
              <p className="text-center">
                <Link
                  href="/help"
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  {t.onboarding.helpLink}
                </Link>
              </p>
            </div>

            {!state.plan && <PlanStep />}
          </main>
        </>
      )}
    </div>
  );
}
