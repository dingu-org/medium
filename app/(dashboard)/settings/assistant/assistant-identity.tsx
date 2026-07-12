'use client';

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

type Field = 'name' | 'greeting' | 'keyword';

type Values = {
  aiName: string;
  aiGreeting: string;
  aiEscalationKeyword: string;
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
  keyword: {
    name: 'aiEscalationKeyword',
    title: t.settings.assistantKeywordRow,
    help: t.settings.aiEscalationHint,
    multiline: false,
    placeholder: t.ops.help,
    valueOf: (v: Values) => v.aiEscalationKeyword,
  },
} as const;

export function AssistantIdentity({
  aiName,
  aiGreeting,
  aiEscalationKeyword,
}: {
  aiName: string;
  aiGreeting: string;
  aiEscalationKeyword: string;
}) {
  const online = useOnlineStatus();
  const [editing, setEditing] = useState<Field | null>(null);

  const open = (field: Field) => () => setEditing(field);

  return (
    <>
      <GroupedList
        title={t.settings.assistantIdentityGroup}
        footer={t.settings.assistantIdentityFooter}
        className={cn(!online && 'pointer-events-none opacity-55')}
      >
        <GroupedListRow
          title={t.settings.aiName}
          titleWeight="medium"
          value={aiName || t.settings.assistantValueUnset}
          onClick={online ? open('name') : undefined}
        />
        <GroupedListRow
          title={t.settings.assistantGreetingRow}
          titleWeight="medium"
          description={aiGreeting || t.settings.assistantValueUnset}
          onClick={online ? open('greeting') : undefined}
        />
        <GroupedListRow
          title={t.settings.assistantKeywordRow}
          titleWeight="medium"
          value={aiEscalationKeyword || t.ops.help}
          valueMono
          onClick={online ? open('keyword') : undefined}
        />
      </GroupedList>

      <AssistantIdentitySheet
        field={editing}
        open={editing !== null}
        online={online}
        values={{ aiName, aiGreeting, aiEscalationKeyword }}
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
            className="space-y-4 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
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
