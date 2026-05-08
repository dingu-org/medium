import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { BottomNav } from '@/components/dashboard/bottom-nav';
import { TopHeader } from '@/components/dashboard/top-header';
import { db } from '@/lib/db';
import { pts } from '@/lib/db/schema';
import { createServerClient } from '@/lib/supabase/server';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/sign-in');
  }

  const [pt] = await db
    .select({ practiceName: pts.practiceName, email: pts.email })
    .from(pts)
    .where(eq(pts.id, user.id));

  return (
    <div className="min-h-screen bg-muted/20">
      <TopHeader practiceName={pt?.practiceName ?? null} email={pt?.email ?? user.email ?? ''} />
      <main className="mx-auto max-w-md px-4 pt-4 pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
