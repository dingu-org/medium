'use client';

import { ArrowRight, Check, Clock, Lock } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  GroupedList,
  GroupedListRow,
} from '@/components/ui/grouped-list';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { t } from '@/lib/i18n';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import { cn } from '@/lib/utils';
import { exportPt } from '../actions';
import { RETENTION_OPTIONS } from '../constants';
import { updateRetention } from './actions';

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

/** "Të dhënat" group: retention bottom-sheet picker + GDPR JSON export. */
export function DataGroup({
  retentionDays,
  retentionMaxDays,
}: {
  retentionDays: number;
  /** Plan cap: options above this are visible but plan-locked (Phase 16 C6). */
  retentionMaxDays: number;
}) {
  const online = useOnlineStatus();
  const [days, setDays] = useState(retentionDays);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function openSheet() {
    if (!online) {
      toast.error(t.settings.settingsRequireConnection);
      return;
    }
    setSheetOpen(true);
  }

  function onExport() {
    if (!online) {
      toast.error(t.settings.settingsRequireConnection);
      return;
    }
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

  function onPick(opt: number) {
    if (opt === days) {
      setSheetOpen(false);
      return;
    }
    const prev = days;
    setDays(opt); // optimistic
    setSheetOpen(false);
    startTransition(async () => {
      try {
        await updateRetention(opt);
        toast.success(t.settings.savedToast);
      } catch {
        setDays(prev);
        toast.error(t.settings.retentionFailed);
      }
    });
  }

  return (
    <>
      <GroupedList
        title={t.settings.dataSection}
        footer={t.settings.dataFooter}
      >
        <GroupedListRow
          icon={Clock}
          title={t.settings.retentionRow}
          titleWeight="medium"
          value={t.settings.retentionDays(days)}
          onClick={openSheet}
          className={cn(!online && 'opacity-55')}
        />
        <GroupedListRow
          icon={ArrowRight}
          title={t.settings.exportData}
          titleWeight="medium"
          description={t.settings.exportSub}
          onClick={onExport}
          className={cn(!online && 'opacity-55')}
        />
      </GroupedList>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-w-md rounded-t-lg"
          aria-describedby={undefined}
        >
          <SheetHeader>
            <SheetTitle>{t.settings.retentionRow}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col pb-2">
            {RETENTION_OPTIONS.map((opt) => {
              const locked = opt > retentionMaxDays;
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={pending || locked}
                  onClick={() => !locked && onPick(opt)}
                  className="flex items-center justify-between px-4 py-3 text-left text-[15px] disabled:opacity-55"
                >
                  <span className="tabular-nums">
                    {t.settings.retentionDays(opt)}
                  </span>
                  {locked ? (
                    <span className="flex items-center gap-1 text-[12px] text-ink-3">
                      <Lock className="h-3.5 w-3.5" aria-hidden />
                      {t.billing.gateLockedHint}
                    </span>
                  ) : (
                    opt === days && (
                      <Check
                        className="h-[18px] w-[18px] text-primary"
                        aria-hidden
                      />
                    )
                  )}
                </button>
              );
            })}
            {RETENTION_OPTIONS.some((opt) => opt > retentionMaxDays) && (
              <Link
                href="/settings/billing"
                className="mx-4 mt-2 rounded-lg bg-[var(--brand-50)] px-3 py-2.5 text-center text-[13px] font-medium text-[var(--brand-600)]"
                onClick={() => setSheetOpen(false)}
              >
                {t.billing.gateRetention}
              </Link>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
