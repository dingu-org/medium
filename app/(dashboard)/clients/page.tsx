import { Users } from 'lucide-react';
import { EmptyState } from '@/components/states';
import { t } from '@/lib/i18n';

export const metadata = { title: 'Klientët · Medium' };

// Placeholder — the Clients directory is built in Phase 13 Stage 4.
export default function ClientsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t.nav.clients}</h1>
      <EmptyState
        icon={Users}
        title="Së shpejti"
        description="Lista e klientëve po ndërtohet."
      />
    </div>
  );
}
