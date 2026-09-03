'use client';

import { useTransition } from 'react';
import { signOut } from '@/lib/auth/actions';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { t } from '@/lib/i18n';
import { clearPwaData } from '@/lib/pwa/client-store';
import { unsubscribeFromPush } from '@/lib/pwa/push-client';

export function SignOutMenuItem() {
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenuItem
      disabled={pending}
      // onSelect (not the child button's onClick) — Radix closes/unmounts
      // the menu on pointerup before the click event would otherwise reach
      // an asChild button, so a nested onClick handler silently never fires.
      onSelect={() => {
        startTransition(async () => {
          // Same order as the settings row: revoke push while the session is
          // still valid, then drop local data.
          await unsubscribeFromPush().catch(() => undefined);
          await clearPwaData().catch(() => undefined);
          await signOut();
        });
      }}
    >
      {t.account.signOut}
    </DropdownMenuItem>
  );
}
