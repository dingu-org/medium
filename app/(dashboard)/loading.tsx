import { LoadingState } from '@/components/states';

// Fallback for PUSHED routes only (/settings/*, /clients/new, /clients/[id],
// /admin): DashboardChrome pads only the top-level branch of <main>, so a
// pushed screen owns its own margin. Every top-level route has its own
// loading.tsx for the same reason.
export default function DashboardLoading() {
  return (
    <div className="px-4 pt-2 pb-4">
      <LoadingState />
    </div>
  );
}
