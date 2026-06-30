import { Check, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { getOnboardingState } from '@/lib/onboarding/state';
import { createServerClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { continueSetup, dismissAndGo } from './actions';

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

  const state = await getOnboardingState(user.id);
  const steps: Step[] = [
    {
      key: 'profile',
      title: t.onboarding.steps.profileTitle,
      description: t.onboarding.steps.profileSub,
      done: state.profile,
      href: '/settings',
      cta: t.onboarding.steps.profileCta,
    },
    {
      key: 'whatsapp',
      title: t.onboarding.steps.whatsappTitle,
      description: t.onboarding.steps.whatsappSub,
      done: state.whatsapp,
      href: '/settings',
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
                {[
                  'Vlerësim i parë · 45 min',
                  'Seancë vijuese · 30 min',
                  'Terapi manuale · 60 min',
                ].map((preset, index) => (
                  <div
                    key={preset}
                    className="border-border flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
                  >
                    <span
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded border',
                        index < 2
                          ? 'border-primary bg-primary text-white'
                          : 'border-border',
                      )}
                    >
                      {index < 2 && (
                        <Check className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </span>
                    {preset}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-auto space-y-3 pt-10">
              {current.href && current.cta ? (
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
            </div>
          </main>
        </>
      )}
    </div>
  );
}
