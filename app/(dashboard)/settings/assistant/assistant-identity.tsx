'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { SetField } from '@/components/settings/set-field';
import { Button } from '@/components/ui/button';
import { GroupedList, GroupedListRow } from '@/components/ui/grouped-list';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { SettingsState } from '../constants';
import { updateAssistantIdentity } from './actions';

type Field = 'name' | 'greeting';

type Values = {
  aiName: string;
  aiGreeting: string;
};

const initialState: SettingsState = {
  error: null,
  success: false,
  fieldErrors: null,
};

const FIELD_CONFIG = {
  name: {
    name: 'aiName',
    title: t.settings.aiName,
    help: t.settings.assistantNameHelp,
    multiline: false,
    placeholder: undefined,
    valueOf: (v: Values) => v.aiName,
  },
  greeting: {
    name: 'aiGreeting',
    title: t.settings.assistantGreetingRow,
    help: t.settings.assistantGreetingHelp,
    multiline: true,
    placeholder: t.settings.aiGreetingPlaceholder,
    valueOf: (v: Values) => v.aiGreeting,
  },
} as const;

function LockHint() {
  return (
    <span className="flex shrink-0 items-center gap-1 text-[12px] text-ink-3">
      <Lock className="h-3.5 w-3.5" aria-hidden />
      {t.billing.gateLockedHint}
    </span>
  );
}

export function AssistantIdentity({
  aiName,
  aiGreeting,
  customAssistantIdentity,
}: {
  aiName: string;
  aiGreeting: string;
  customAssistantIdentity: boolean;
}) {
  const online = useOnlineStatus();
  const [editing, setEditing] = useState<Field | null>(null);

  // On Free the name/greeting are plan-locked (shown, not editable).
  const locked = !customAssistantIdentity;
  const open = (field: Field) => () => setEditing(field);
  const editable = () => online && !locked;

  return (
    <>
      <GroupedList
        title={t.settings.assistantIdentityGroup}
        className={cn(!online && 'pointer-events-none opacity-55')}
      >
        <GroupedListRow
          title={t.settings.aiName}
          titleWeight="medium"
          value={locked ? undefined : aiName || t.settings.assistantValueUnset}
          accessory={locked ? <LockHint /> : undefined}
          onClick={editable() ? open('name') : undefined}
        />
        <GroupedListRow
          title={t.settings.assistantGreetingRow}
          titleWeight="medium"
          description={aiGreeting || t.settings.assistantValueUnset}
          accessory={locked ? <LockHint /> : undefined}
          onClick={editable() ? open('greeting') : undefined}
        />
      </GroupedList>

      {locked && (
        <div className="border-line rounded-lg border bg-card p-4 shadow-[var(--shadow-card)]">
          <p className="text-ink-2 text-[13px] leading-5">
            {t.billing.gateIdentity}
          </p>
          <Button asChild className="mt-3 w-full shadow-none">
            <Link href="/settings/billing">{t.billing.gateCta}</Link>
          </Button>
        </div>
      )}

      <AssistantIdentitySheet
        field={editing}
        open={editing !== null}
        online={online}
        values={{ aiName, aiGreeting }}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </>
  );
}

function AssistantIdentitySheet({
  field,
  open,
  online,
  values,
  onOpenChange,
}: {
  field: Field | null;
  open: boolean;
  online: boolean;
  values: Values;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [fieldError, setFieldError] = useState<string | undefined>();
  // Keep the last non-null field so content stays rendered during the
  // close animation (`field` goes null the moment the sheet starts closing).
  const [lastField, setLastField] = useState<Field | null>(field);
  if (field !== null && field !== lastField) setLastField(field);
  const activeField = field ?? lastField;
  const cfg = activeField ? FIELD_CONFIG[activeField] : null;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        // Stale errors must not leak into the next field's sheet.
        if (!o) setFieldError(undefined);
        onOpenChange(o);
      }}
    >
      <SheetContent
        side="bottom"
        className="mx-auto max-w-md"
        aria-describedby={undefined}
      >
        <SheetHeader>
          <SheetTitle>{cfg?.title}</SheetTitle>
        </SheetHeader>
        {cfg && (
          <form
            key={activeField}
            className="space-y-4 px-4 pb-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!online) {
                toast.error(t.settings.settingsRequireConnection);
                return;
              }
              // One named field only → the action partial-updates one column.
              const formData = new FormData(event.currentTarget);
              setFieldError(undefined);
              startTransition(async () => {
                const result = await updateAssistantIdentity(
                  initialState,
                  formData,
                );
                if (result.success) {
                  toast.success(t.settings.savedToast);
                  onOpenChange(false);
                  return;
                }
                const errs = result.fieldErrors?.[cfg.name];
                setFieldError(errs?.[0] ?? result.error ?? undefined);
              });
            }}
          >
            <SetField
              label={cfg.title}
              name={cfg.name}
              defaultValue={cfg.valueOf(values)}
              placeholder={cfg.placeholder}
              help={cfg.help}
              error={fieldError}
              multiline={cfg.multiline}
              rows={cfg.multiline ? 3 : undefined}
            />
            <Button type="submit" className="w-full" disabled={pending || !online}>
              {pending ? t.actions.saving : t.actions.save}
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
