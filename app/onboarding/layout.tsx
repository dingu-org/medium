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

  return (
    <div className="bg-background min-h-screen">
      <main className="mx-auto max-w-md px-4 py-8">{children}</main>
    </div>
  );
}
