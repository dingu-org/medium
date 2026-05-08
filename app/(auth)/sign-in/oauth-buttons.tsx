'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createBrowserClient } from '@/lib/supabase/browser';

export function GoogleSignInButton({ label = 'Continue with Google' }: { label?: string }) {
  const [pending, setPending] = useState(false);

  const handleClick = async () => {
    setPending(true);
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setPending(false);
      console.error('Google sign-in error:', error);
    }
    // On success the browser is redirected by Supabase before this resolves.
  };

  return (
    <Button type="button" variant="outline" className="w-full" onClick={handleClick} disabled={pending}>
      {pending ? 'Redirecting…' : label}
    </Button>
  );
}
