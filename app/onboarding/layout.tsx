import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { createServerClient } from '@/lib/supabase/server';

export default async function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  return <div className="bg-background min-h-dvh">{children}</div>;
}
