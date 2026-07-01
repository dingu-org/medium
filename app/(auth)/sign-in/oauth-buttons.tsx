'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { createBrowserClient } from '@/lib/supabase/browser';
import { t } from '@/lib/i18n';

export function GoogleSignInButton({
  label = t.auth.signIn.google,
}: {
  label?: string;
}) {
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
      toast.error(t.auth.errors.oauthFailed);
    }
    // On success the browser is redirected by Supabase before this resolves.
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={handleClick}
      disabled={pending}
    >
      {pending ? t.auth.signIn.redirecting : label}
    </Button>
  );
}
