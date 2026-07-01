import { LoadingState } from '@/components/states';
import { Skeleton } from '@/components/ui/skeleton';

export default function ClientsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-10 w-full" />
      <LoadingState rows={5} />
    </div>
  );
}
