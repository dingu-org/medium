import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ONBOARDING_SKIP_COOKIE } from '@/app/onboarding/constants';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { PwaProvider } from '@/components/pwa/pwa-provider';
import { Toaster } from '@/components/ui/sonner';
import { db } from '@/lib/db';
import { pts } from '@/lib/db/schema';
import { getNotificationData } from '@/lib/notifications/query';
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

  // Push fresh PTs through onboarding unless they've dismissed it. Onboarding
  // lives outside this layout, so redirecting here can't loop.
  const skipped = (await cookies()).get(ONBOARDING_SKIP_COOKIE)?.value === '1';
  if (!skipped) {
    const onboarding = await getOnboardingState(user.id);
    if (!onboarding.complete) redirect('/onboarding');
  }

  const [[pt], notifications, unreadChats] = await Promise.all([
    db
      .select({ practiceName: pts.practiceName, email: pts.email })
      .from(pts)
      .where(eq(pts.id, user.id)),
    getNotificationData(user.id),
    getUnreadChatCount(user.id),
  ]);

  return (
    <DashboardChrome
      ptId={user.id}
      practiceName={pt?.practiceName ?? null}
      email={pt?.email ?? user.email ?? ''}
      notificationCount={notifications.unreadCount}
      notifications={notifications.items}
      unreadChats={unreadChats}
    >
      <PwaProvider />
      {children}
      <Toaster />
    </DashboardChrome>
  );
}
