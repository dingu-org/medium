import { CalendarClock } from 'lucide-react';
import { EmptyState } from '@/components/states';
import { t } from '@/lib/i18n';

export const metadata = { title: 'Sot · Medium' };

// Placeholder — the exception-first Today home is built in Phase 13 Stage 2.
export default function TodayPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t.nav.today}</h1>
      <EmptyState
        icon={CalendarClock}
        title="Së shpejti"
        description="Faqja “Sot” po ndërtohet."
      />
    </div>
  );
}
