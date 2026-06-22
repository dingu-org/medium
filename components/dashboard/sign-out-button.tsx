'use client';

import { useTransition } from 'react';
import { signOut } from '@/lib/auth/actions';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { t } from '@/lib/i18n';
import { clearPwaData } from '@/lib/pwa/client-store';

export function SignOutMenuItem() {
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenuItem asChild>
      <button
        type="button"
        className="w-full cursor-pointer text-left"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            await clearPwaData().catch(() => undefined);
            await signOut();
          });
        }}
      >
        {t.account.signOut}
      </button>
    </DropdownMenuItem>
  );
}
