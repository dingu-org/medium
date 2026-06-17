import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ONBOARDING_SKIP_COOKIE } from '@/app/onboarding/constants';
import { BottomNav } from '@/components/dashboard/bottom-nav';
import { TopHeader } from '@/components/dashboard/top-header';
import { Toaster } from '@/components/ui/sonner';
import { db } from '@/lib/db';
import { pts } from '@/lib/db/schema';
import { getNotificationData } from '@/lib/notifications/query';
import { getOnboardingState } from '@/lib/onboarding/state';
import { createServerClient } from '@/lib/supabase/server';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/sign-in');
  }

  // Push fresh PTs through onboarding unless they've dismissed it. Onboarding
  // lives outside this layout, so redirecting here can't loop.
  const skipped =
    (await cookies()).get(ONBOARDING_SKIP_COOKIE)?.value === '1';
  if (!skipped) {
    const onboarding = await getOnboardingState(user.id);
    if (!onboarding.complete) redirect('/onboarding');
  }

  const [[pt], notifications] = await Promise.all([
    db
      .select({ practiceName: pts.practiceName, email: pts.email })
      .from(pts)
      .where(eq(pts.id, user.id)),
    getNotificationData(user.id),
  ]);

  return (
    <div className="min-h-screen bg-muted/20">
      <TopHeader
        ptId={user.id}
        practiceName={pt?.practiceName ?? null}
        email={pt?.email ?? user.email ?? ''}
        unreadCount={notifications.unreadCount}
        notifications={notifications.items}
      />
      <main className="mx-auto max-w-md px-4 pt-4 pb-20">{children}</main>
      <BottomNav />
      <Toaster />
    </div>
  );
}
