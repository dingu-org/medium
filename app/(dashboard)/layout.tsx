import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  allowsOnboardingBypass,
  ONBOARDING_SKIP_COOKIE,
} from '@/app/onboarding/constants';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { PwaProvider } from '@/components/pwa/pwa-provider';
import { RealtimeRefresher } from '@/components/realtime-refresher';
import { WebVitalsReporter } from '@/components/web-vitals-reporter';
import { Toaster } from '@/components/ui/sonner';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { getNotificationData } from '@/lib/notifications/query';
import { guidedGateRedirect } from '@/lib/onboarding/gate';
import { getOnboardingState } from '@/lib/onboarding/state';
import { createServerClient } from '@/lib/supabase/server';
import { getUnreadChatCount } from '@/lib/chat/queries';

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/sign-in');
  }

  const [account] = await db
    .select({
      name: accounts.name,
      email: accounts.email,
      onboardingFlow: accounts.onboardingFlow,
      onboardingCompletedAt: accounts.onboardingCompletedAt,
    })
    .from(accounts)
    .where(eq(accounts.id, user.id));

  // Guided accounts (new since MED-115) stay in the onboarding flow until
  // Finish marks it complete; the skip cookie does not apply to them.
  // Onboarding lives outside this layout, so redirecting here can't loop.
  const guided = guidedGateRedirect(account);
  if (guided === 'legacy') {
    // Push fresh PTs through the old checklist unless they've dismissed it.
    const onboardingCookie = (await cookies()).get(
      ONBOARDING_SKIP_COOKIE,
    )?.value;
    const skipped = allowsOnboardingBypass(onboardingCookie, user.id);
    if (!skipped) {
      const onboarding = await getOnboardingState(user.id);
      if (!onboarding.complete) redirect('/onboarding');
    }
  } else if (guided) {
    redirect(guided);
  }

  const [notifications, unreadChats] = await Promise.all([
    getNotificationData(user.id),
    getUnreadChatCount(user.id),
  ]);

  return (
    <DashboardChrome
      accountId={user.id}
      name={account?.name ?? null}
      email={account?.email ?? user.email ?? ''}
      notificationCount={notifications.unreadCount}
      notifications={notifications.items}
      unreadChats={unreadChats}
    >
      <PwaProvider />
      {/* App-wide: keeps the bottom-nav unread chat badge fresh on screens
          without their own conversations subscription (calendar, settings).
          Every inbound customer message bumps conversations.last_inbound_at. */}
      <RealtimeRefresher
        table="conversations"
        filter={`account_id=eq.${user.id}`}
      />
      <WebVitalsReporter />
      {children}
      <Toaster />
    </DashboardChrome>
  );
}
