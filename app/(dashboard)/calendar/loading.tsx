import { LoadingState } from '@/components/states';
import { Skeleton } from '@/components/ui/skeleton';

// Top-level route: DashboardChrome's <main> already supplies the 16px screen
// margin, so this fallback adds none of its own (see (dashboard)/loading.tsx,
// which is the pushed-route fallback and carries the margin itself).
export default function CalendarLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-32" />
      <LoadingState rows={5} />
    </div>
  );
}
