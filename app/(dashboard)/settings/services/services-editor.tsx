'use client';

import { ChevronRight, Plus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { AddDashed } from '@/components/settings/add-dashed';
import { DURATION_PRESETS, DurChips } from '@/components/settings/dur-chips';
import { OfflineNote } from '@/components/settings/offline-note';
import { SetField } from '@/components/settings/set-field';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { GroupedList } from '@/components/ui/grouped-list';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import { formatLek, t } from '@/lib/i18n';
import type { ServiceRecord } from '@/lib/services/queries';
import { cn } from '@/lib/utils';
import {
  createService,
  deleteService,
  setServiceActive,
  updateService,
} from './actions';

export function ServicesEditor({ services }: { services: ServiceRecord[] }) {
  const online = useOnlineStatus();
  const [editing, setEditing] = useState<ServiceRecord | 'new' | null>(null);
  const [pending, startTransition] = useTransition();
  const activeCount = services.filter((s) => s.active).length;

  function toggle(service: ServiceRecord, active: boolean) {
    if (!online) return toast.error(t.settings.serviceOnlineOnly);
    startTransition(async () => {
      const result = await setServiceActive(service.id, active);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="space-y-4 px-4 pt-2 pb-4">
      <OfflineNote />

      {services.length === 0 ? (
        <EmptyState
          icon={Plus}
          title={t.settings.serviceEmpty}
          description={t.settings.serviceEmptySub}
          action={
            <Button onClick={() => setEditing('new')} disabled={!online}>
              <Plus className="h-4 w-4" aria-hidden />
              {t.settings.serviceAdd}
            </Button>
          }
        />
      ) : (
        <>
          <GroupedList title={t.settings.serviceActiveCount(activeCount)}>
            {services.map((service) => (
              <div
                key={service.id}
                className={cn(
                  'flex min-h-[60px] items-center gap-3 px-4 py-3',
                  !service.active && 'opacity-55',
                )}
              >
                <button
                  type="button"
                  onClick={() => setEditing(service)}
                  disabled={!online}
                  aria-label={`${t.settings.serviceEdit}: ${service.name}`}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold tracking-[-0.005em] text-foreground">
                      {service.name}
                    </span>
                    <span className="mt-1 block text-[12.5px] text-ink-3 tabular-nums">
                      {t.settings.serviceMeta(
                        service.durationMinutes,
                        service.priceLek != null
                          ? formatLek(service.priceLek)
                          : null,
                      )}
                    </span>
                  </span>
                </button>
                <Switch
                  checked={service.active}
                  onCheckedChange={(active) => toggle(service, active)}
                  disabled={!online || pending}
                  aria-label={`${service.name}: ${t.settings.serviceActive}`}
                />
                <ChevronRight
                  className="h-[17px] w-[17px] shrink-0 text-ink-3/70"
                  aria-hidden
                />
              </div>
            ))}
          </GroupedList>

          <AddDashed onClick={() => setEditing('new')} disabled={!online}>
            {t.settings.serviceAdd}
          </AddDashed>

          <p className="px-4 pt-1 text-[12.5px] leading-[1.5] text-ink-3">
            {t.settings.serviceListFooter}
          </p>
        </>
      )}

      <ServiceSheet
        service={editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </div>
  );
}

function ServiceSheet({
  service,
  open,
  onOpenChange,
}: {
  service: ServiceRecord | 'new' | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = service !== 'new' && service !== null;
  const title = isEdit ? service.name : t.settings.serviceAdd;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-lg">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">
            {t.settings.servicesIntro}
          </SheetDescription>
        </SheetHeader>
        {service !== null && (
          <ServiceForm
            key={isEdit ? service.id : 'new'}
            service={service}
            onDone={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function isPreset(m: number) {
  return (DURATION_PRESETS as readonly number[]).includes(m);
}

function ServiceForm({
  service,
  onDone,
}: {
  service: ServiceRecord | 'new';
  onDone: () => void;
}) {
  const online = useOnlineStatus();
  const [pending, startTransition] = useTransition();
  const isEdit = service !== 'new';
  const initialMinutes = isEdit ? service.durationMinutes : 30;

  const [minutes, setMinutes] = useState(String(initialMinutes));
  const [custom, setCustom] = useState(
    isEdit ? !isPreset(service.durationMinutes) : false,
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online) return toast.error(t.settings.serviceOnlineOnly);
    const data = new FormData(event.currentTarget);
    const priceRaw = String(data.get('price') ?? '').trim();
    const input = {
      name: String(data.get('name') ?? ''),
      durationMinutes: Number(minutes),
      priceLek: priceRaw === '' ? null : Number(priceRaw),
    };
    startTransition(async () => {
      const result = isEdit
        ? await updateService(service.id, input)
        : await createService(input);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t.settings.serviceSaved);
      onDone();
    });
  }

  function handleDelete() {
    if (!isEdit) return;
    if (!online) return toast.error(t.settings.serviceOnlineOnly);
    startTransition(async () => {
      const result = await deleteService(service.id);
      // HAS_APPOINTMENTS error text suggests deactivating instead.
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t.settings.serviceDeleted);
      onDone();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 px-4 pb-4"
    >
      <OfflineNote />

      <SetField
        label={t.settings.serviceName}
        name="name"
        defaultValue={isEdit ? service.name : ''}
        disabled={!online}
      />

      <div className="flex flex-col gap-2">
        <label className="text-[13px] font-semibold tracking-[-0.005em] text-[#303744]">
          {t.settings.serviceDuration}
        </label>
        <DurChips
          minutes={Number(minutes)}
          custom={custom}
          disabled={!online}
          onPreset={(m) => {
            setCustom(false);
            setMinutes(String(m));
          }}
          onCustom={() => setCustom(true)}
        />
      </div>

      {custom && (
        <SetField
          label={t.settings.serviceMinutesLabel}
          type="number"
          value={minutes}
          onChange={setMinutes}
          suffix={t.settings.serviceMinutesSuffix}
          help={t.settings.serviceMinutesHelp}
          disabled={!online}
        />
      )}

      <SetField
        label={t.settings.servicePriceLabel}
        name="price"
        type="number"
        defaultValue={
          isEdit && service.priceLek != null ? String(service.priceLek) : ''
        }
        suffix={t.settings.servicePriceSuffix}
        disabled={!online}
      />

      <div className="flex flex-col gap-2 pt-2">
        <Button type="submit" className="w-full" disabled={pending || !online}>
          {pending ? t.actions.saving : t.settings.serviceSave}
        </Button>
        {isEdit && (
          <Button
            type="button"
            variant="ghost-danger"
            className="w-full"
            onClick={handleDelete}
            disabled={pending || !online}
          >
            {t.settings.serviceDelete}
          </Button>
        )}
      </div>
    </form>
  );
}
