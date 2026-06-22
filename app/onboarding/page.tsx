import { Check, PartyPopper } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { t } from '@/lib/i18n';
import { getOnboardingState } from '@/lib/onboarding/state';
import { createServerClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { dismissAndGo } from './actions';

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
      key: 'testMessage',
      title: t.onboarding.steps.testMessageTitle,
      description: t.onboarding.steps.testMessageSub,
      done: state.testMessage,
    },
  ];

  const progress = Math.round((state.completedCount / state.total) * 100);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t.onboarding.welcomeTitle}</h1>
        <p className="text-muted-foreground">
          {t.onboarding.welcomeSub}
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={state.completedCount}
            aria-valuemin={0}
            aria-valuemax={state.total}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t.onboarding.progress(state.completedCount, state.total)}
        </p>
      </div>

      {state.complete ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PartyPopper className="h-5 w-5" aria-hidden="true" />
              {t.onboarding.allSetTitle}
            </CardTitle>
            <CardDescription>
              {t.onboarding.allSetSub}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/today">{t.onboarding.goToApp}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {steps.map((step, i) => (
            <li
              key={step.key}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-4"
            >
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-medium',
                  step.done
                    ? 'bg-emerald-500 text-white'
                    : 'bg-muted text-muted-foreground',
                )}
                aria-hidden="true"
              >
                {step.done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{step.title}</p>
                <p className="text-sm text-muted-foreground">
                  {step.description}
                </p>
                {!step.done && step.href && step.cta && (
                  <form action={dismissAndGo} className="mt-2">
                    <input type="hidden" name="href" value={step.href} />
                    <Button type="submit" size="sm" variant="outline">
                      {step.cta}
                    </Button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!state.complete && (
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
      )}
    </div>
  );
}
