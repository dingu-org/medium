import { LoadingState } from '@/components/states';
import { Skeleton } from '@/components/ui/skeleton';

export default function ChatLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-[38px] w-full rounded-full" />
      <LoadingState rows={5} />
    </div>
  );
}
