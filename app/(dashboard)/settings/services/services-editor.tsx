'use client';

import { Pencil, Plus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import { t } from '@/lib/i18n';
import type { ServiceRecord } from '@/lib/services/queries';
import { createService, setServiceActive, updateService } from './actions';

const DURATIONS = [15, 30, 45, 60, 75, 90, 120];

export function ServicesEditor({ services }: { services: ServiceRecord[] }) {
  const online = useOnlineStatus();
  const [editing, setEditing] = useState<ServiceRecord | 'new' | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(service: ServiceRecord, active: boolean) {
    if (!online) return toast.error(t.settings.serviceOnlineOnly);
    startTransition(async () => {
      const result = await setServiceActive(service.id, active);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <>
      {!online && (
        <p className="rounded-md border border-[var(--warning-200)] bg-[var(--warning-50)] px-3 py-2 text-sm text-[var(--warning-700)]">
          {t.settings.serviceOnlineOnly}
        </p>
      )}

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
        <div className="border-border bg-card overflow-hidden rounded-md border">
          {services.map((service) => (
            <div
              key={service.id}
              className="border-border flex min-h-16 items-center gap-3 border-b px-4 py-3 last:border-b-0"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => setEditing(service)}
                disabled={!online}
              >
                <span className="block truncate text-sm font-medium">
                  {service.name}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {service.durationMinutes} min ·{' '}
                  {service.active
                    ? t.settings.serviceActive
                    : t.settings.serviceInactive}
                </span>
              </button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => setEditing(service)}
                disabled={!online}
                aria-label={`${t.settings.serviceEdit}: ${service.name}`}
              >
                <Pencil className="h-4 w-4" aria-hidden />
              </Button>
              <Switch
                checked={service.active}
                onCheckedChange={(active) => toggle(service, active)}
                disabled={!online || pending}
                aria-label={`${service.name}: ${t.settings.serviceActive}`}
              />
            </div>
          ))}
        </div>
      )}

      {services.length > 0 && (
        <Button
          className="w-full"
          onClick={() => setEditing('new')}
          disabled={!online}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t.settings.serviceAdd}
        </Button>
      )}

      <ServiceSheet
        service={editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </>
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
  const [pending, startTransition] = useTransition();
  const key = service === 'new' || service === null ? 'new' : service.id;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-lg">
        <SheetHeader>
          <SheetTitle>
            {service === 'new' ? t.settings.serviceAdd : t.settings.serviceEdit}
          </SheetTitle>
          <SheetDescription>{t.settings.servicesIntro}</SheetDescription>
        </SheetHeader>
        <form
          key={key}
          className="space-y-4 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const input = {
              name: String(data.get('name') ?? ''),
              durationMinutes: Number(data.get('duration')),
            };
            startTransition(async () => {
              const result =
                service === 'new' || service === null
                  ? await createService(input)
                  : await updateService(service.id, input);
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success(t.settings.serviceSaved);
              onOpenChange(false);
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="service-name">{t.settings.serviceName}</Label>
            <Input
              id="service-name"
              name="name"
              defaultValue={
                service === 'new' || service === null ? '' : service.name
              }
              required
              maxLength={80}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="service-duration">
              {t.settings.serviceDuration}
            </Label>
            <select
              id="service-duration"
              name="duration"
              defaultValue={
                service === 'new' || service === null
                  ? 30
                  : service.durationMinutes
              }
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
            >
              {DURATIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} min
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? t.calendar.saving : t.settings.serviceSave}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
