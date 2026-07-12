'use client';

import { LogOut } from 'lucide-react';
import { useTransition } from 'react';
import { GroupedListRow } from '@/components/ui/grouped-list';
import { signOut } from '@/lib/auth/actions';
import { t } from '@/lib/i18n';
import { clearPwaData } from '@/lib/pwa/client-store';

/** Hub danger row; same sign-out sequence as the header menu item. */
export function SignOutRow() {
  const [pending, startTransition] = useTransition();

  return (
    <GroupedListRow
      icon={LogOut}
      title={t.settings.signOut}
      danger
      onClick={() => {
        if (pending) return;
        startTransition(async () => {
          await clearPwaData().catch(() => undefined);
          await signOut();
        });
      }}
    />
  );
}
