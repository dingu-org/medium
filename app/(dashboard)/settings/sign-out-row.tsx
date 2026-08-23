'use client';

import { LogOut } from 'lucide-react';
import { useTransition } from 'react';
import { GroupedListRow } from '@/components/ui/grouped-list';
import { signOut } from '@/lib/auth/actions';
import { t } from '@/lib/i18n';
import { clearPwaData } from '@/lib/pwa/client-store';
import { unsubscribeFromPush } from '@/lib/pwa/push-client';

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
          // Revoke push first: it needs the still-valid session, and leaving the
          // subscription alive keeps customer names arriving on a signed-out
          // device.
          await unsubscribeFromPush().catch(() => undefined);
          await clearPwaData().catch(() => undefined);
          await signOut();
        });
      }}
    />
  );
}
