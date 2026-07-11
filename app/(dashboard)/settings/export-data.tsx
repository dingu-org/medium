'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import { exportPt } from './actions';

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ExportData() {
  const [pending, startTransition] = useTransition();
  const online = useOnlineStatus();

  function onExport() {
    startTransition(async () => {
      try {
        const result = await exportPt();
        if (!result.ok) {
          toast.error(t.settings.exportFailed);
          return;
        }
        downloadJson(result.data, `medium-export-${Date.now()}.json`);
      } catch {
        toast.error(t.settings.exportFailed);
      }
    });
  }

  return (
    <Button
      variant="outline"
      className="w-full"
      onClick={onExport}
      disabled={pending || !online}
    >
      {pending ? t.settings.exporting : t.settings.exportRun}
    </Button>
  );
}
