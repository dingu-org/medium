'use client';

import {
  Car,
  Check,
  ChevronDown,
  ChevronUp,
  Lock,
  MapPin,
  Pencil,
  Plus,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { FieldError } from '@/components/onboarding/field-error';
import { StepShell } from '@/components/onboarding/step-shell';
import { useStepDraft } from '@/components/onboarding/use-step-draft';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RoundButton } from '@/components/ui/round-button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { t } from '@/lib/i18n';
import { formatLek } from '@/lib/i18n/number';
import type { ScreenContext } from '@/lib/onboarding/guard';
import { SERVICE_MODES, type ServiceMode } from '@/lib/services/modes';
import { cn } from '@/lib/utils';
import { saveServiceStep } from './actions';
import {
  DURATION_PRESETS,
  EMPTY_FORM,
  durationOf,
  isComplete,
  sanitizeForm,
  toForm,
  type ServiceCardData,
  type ServiceFormDraft,
  type ServicesDraft,
} from './form';

export type { ServiceFormDraft, ServicesDraft } from './form';

// Typed over the closed list: adding a mode fails to compile until it has an icon.
const MODE_ICONS: Record<ServiceMode, LucideIcon> = {
  at_business: MapPin,
  at_client: Car,
  online: Video,
};

export function ServicesStep({
  accountId,
  progress,
  backHref,
  services,
  canAddMore,
  initial,
}: ScreenContext & {
  services: ServiceCardData[];
  canAddMore: boolean;
  initial: ServicesDraft;
}) {
  const s = t.onboarding.services;
  const [draft, setDraft] = useStepDraft<ServicesDraft>(
    accountId,
    'services',
    initial,
  );
  // A stored "list" draft cannot hide the form while nothing is complete yet.
  const stored = draft?.form ? sanitizeForm(draft.form) : null;
  const form =
    stored ?? (services.some(isComplete) ? null : (initial.form ?? EMPTY_FORM));
  const update = (patch: Partial<ServiceFormDraft>) =>
    setDraft({ form: { ...(form ?? EMPTY_FORM), ...patch } });
  // null: follow the data (open when the service is hidden).
  const [moreOpen, setMoreOpen] = useState<boolean | null>(null);

  return (
    <StepShell
      screen="services"
      progress={progress}
      backHref={backHref}
      accountId={accountId}
      heading={s.title}
      subheading={form ? s.sub : s.subSaved}
      primary={{
        label: t.onboarding.flow.continue,
        onPress: () =>
          saveServiceStep(
            form
              ? {
                  id: form.id,
                  name: form.name,
                  durationMinutes: durationOf(form),
                  price: form.price,
                  mode: form.mode,
                  description: form.description,
                  active: form.active,
                }
              : null,
          ),
      }}
    >
      {({ fieldErrors }) => (
        <div className="flex flex-col gap-5">
          {form ? (
            <ServiceForm
              form={form}
              update={update}
              fieldErrors={fieldErrors}
              moreOpen={moreOpen}
              setMoreOpen={setMoreOpen}
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {services.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  onEdit={() => setDraft({ form: toForm(service) })}
                />
              ))}
            </ul>
          )}
          {!canAddMore ? (
            <button
              type="button"
              aria-disabled="true"
              aria-describedby="service-add-why"
              className="border-line text-ink-2 flex min-h-14 w-full items-center gap-3 rounded-md border border-dashed bg-[var(--neutral-100)] px-4 py-2.5 text-left"
            >
              <Lock className="size-[18px] flex-none" aria-hidden />
              <span className="flex min-w-0 flex-col">
                <span className="text-[15px] font-semibold">{s.add}</span>
                <span id="service-add-why" className="text-[13px]">
                  {s.freeLimit}
                </span>
              </span>
            </button>
          ) : (
            !form && (
              <button
                type="button"
                onClick={() => setDraft({ form: EMPTY_FORM })}
                className="border-line text-primary flex min-h-14 w-full items-center gap-3 rounded-md border border-dashed px-4 py-2.5 text-left text-[15px] font-semibold"
              >
                <Plus className="size-[18px] flex-none" aria-hidden />
                {s.add}
              </button>
            )
          )}
        </div>
      )}
    </StepShell>
  );
}

function ServiceCard({
  service,
  onEdit,
}: {
  service: ServiceCardData;
  onEdit: () => void;
}) {
  const s = t.onboarding.services;
  return (
    <li
      className={cn(
        'border-line bg-card flex items-center gap-3 rounded-md border p-4 shadow-[var(--shadow-card)]',
        !service.active && 'opacity-70',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{service.name}</p>
        <p className="text-ink-2 text-[13px]">
          {t.settings.serviceMeta(
            service.durationMinutes,
            service.priceLek != null ? formatLek(service.priceLek) : null,
          )}
          {!service.active && ` ${s.hiddenTag}`}
        </p>
      </div>
      <RoundButton
        type="button"
        aria-label={s.editLabel(service.name)}
        onClick={onEdit}
      >
        <Pencil aria-hidden />
      </RoundButton>
    </li>
  );
}

function ServiceForm({
  form,
  update,
  fieldErrors,
  moreOpen,
  setMoreOpen,
}: {
  form: ServiceFormDraft;
  update: (patch: Partial<ServiceFormDraft>) => void;
  fieldErrors: Record<string, string>;
  moreOpen: boolean | null;
  setMoreOpen: (open: boolean) => void;
}) {
  const s = t.onboarding.services;
  const durationError = fieldErrors.duration;
  const modeError = fieldErrors.mode;
  // An invalid optional field is always shown so the shell can focus it.
  const open = Boolean(fieldErrors.active) || (moreOpen ?? !form.active);
  const chip = (pressed: boolean) =>
    cn(
      'min-h-11 rounded-[14px] border px-4 py-2 text-[13px] tabular-nums transition-colors',
      pressed
        ? 'border-primary bg-primary text-primary-foreground font-bold'
        : 'border-input bg-card text-ink-2 font-medium',
      durationError && !pressed && 'border-destructive',
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="service-name">{s.nameLabel}</Label>
        <Input
          id="service-name"
          value={form.name}
          onChange={(event) => update({ name: event.target.value })}
          placeholder={s.namePlaceholder}
          maxLength={80}
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={fieldErrors.name ? 'service-name-error' : undefined}
        />
        <FieldError id="service-name-error" message={fieldErrors.name} />
      </div>

      <div className="flex flex-col gap-2">
        <p id="service-duration-label" className="text-[14px] font-medium">
          {s.durationLabel}
        </p>
        <div
          role="group"
          aria-labelledby="service-duration-label"
          aria-describedby={
            durationError ? 'service-duration-error' : undefined
          }
          aria-invalid={
            durationError && !form.customDuration ? true : undefined
          }
          tabIndex={-1}
          className="flex flex-wrap gap-2 outline-none"
        >
          {DURATION_PRESETS.map((m) => {
            const pressed = !form.customDuration && form.duration === m;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={pressed}
                onClick={() => update({ duration: m, customDuration: false })}
                className={chip(pressed)}
              >
                {s.durationChip(m)}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={form.customDuration}
            onClick={() => update({ customDuration: true })}
            className={chip(form.customDuration)}
          >
            {t.settings.serviceDurationOther}
          </button>
        </div>
        {form.customDuration && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="service-minutes">
              {t.settings.serviceMinutesLabel}
            </Label>
            <div className="relative">
              <Input
                id="service-minutes"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={form.customMinutes}
                onChange={(event) =>
                  update({ customMinutes: event.target.value })
                }
                className="pr-14"
                aria-invalid={durationError ? true : undefined}
                aria-describedby={
                  durationError
                    ? 'service-minutes-help service-minutes-unit service-duration-error'
                    : 'service-minutes-help service-minutes-unit'
                }
              />
              <span
                id="service-minutes-unit"
                className="text-ink-2 pointer-events-none absolute inset-y-0 right-4 flex items-center text-[15px]"
              >
                {t.settings.serviceMinutesSuffix}
              </span>
            </div>
            <p id="service-minutes-help" className="text-ink-2 text-[12.5px]">
              {t.settings.serviceMinutesHelp}
            </p>
          </div>
        )}
        <FieldError id="service-duration-error" message={durationError} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="service-price">{s.priceLabel}</Label>
        <div className="relative">
          <Input
            id="service-price"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={form.price}
            onChange={(event) => update({ price: event.target.value })}
            placeholder={s.pricePlaceholder}
            className="pr-16"
            aria-invalid={fieldErrors.price ? true : undefined}
            aria-describedby={
              fieldErrors.price
                ? 'service-price-unit service-price-error'
                : 'service-price-unit'
            }
          />
          <span
            id="service-price-unit"
            className="text-ink-2 pointer-events-none absolute inset-y-0 right-4 flex items-center text-[15px]"
          >
            {s.priceSuffix}
          </span>
        </div>
        <FieldError id="service-price-error" message={fieldErrors.price} />
      </div>

      <div className="flex flex-col gap-2">
        <p id="service-mode-label" className="text-[14px] font-medium">
          {s.modeLabel}
        </p>
        {/* Above the rows so it is visible without scrolling the list. */}
        <FieldError id="service-mode-error" message={modeError} />
        <div
          role="radiogroup"
          aria-labelledby="service-mode-label"
          aria-describedby={modeError ? 'service-mode-error' : undefined}
          aria-required="true"
          aria-invalid={modeError ? true : undefined}
          tabIndex={-1}
          className="flex flex-col gap-2 outline-none"
        >
          {SERVICE_MODES.map((mode) => {
            const Icon = MODE_ICONS[mode];
            const checked = form.mode === mode;
            return (
              <label
                key={mode}
                className={cn(
                  'border-line bg-card relative flex min-h-14 cursor-pointer scroll-my-4 items-center gap-3 rounded-md border py-2.5 pr-4 pl-3 shadow-[var(--shadow-card)]',
                  'has-[:focus-visible]:border-ring has-[:focus-visible]:ring-ring/20 has-[:focus-visible]:ring-3',
                  modeError && !checked && 'border-destructive',
                  checked &&
                    'border-primary shadow-[0_0_0_1px_var(--primary),var(--shadow-card)]',
                )}
              >
                <input
                  type="radio"
                  name="service-mode"
                  value={mode}
                  checked={checked}
                  onChange={() => update({ mode })}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className={cn(
                    'flex size-9 flex-none items-center justify-center rounded-[12px] bg-[var(--neutral-100)] text-[var(--neutral-600)]',
                    checked && 'bg-[var(--brand-50)] text-[var(--brand-600)]',
                  )}
                >
                  <Icon className="size-[19px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-[1.35] font-semibold tracking-[-0.005em]">
                    {s.modes[mode].title}
                  </span>
                  <span className="text-ink-2 block text-[13px] leading-snug">
                    {s.modes[mode].sub}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={cn(
                    'bg-card flex size-[22px] flex-none items-center justify-center rounded-full border-[1.5px] border-[var(--neutral-400)] text-[var(--neutral-0)]',
                    checked && 'border-primary bg-primary',
                  )}
                >
                  {checked && <Check className="size-3.5" strokeWidth={3} />}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="service-description">{s.descriptionLabel}</Label>
        <Textarea
          id="service-description"
          rows={3}
          value={form.description}
          onChange={(event) => update({ description: event.target.value })}
          placeholder={s.descriptionPlaceholder}
          maxLength={500}
          aria-invalid={fieldErrors.description ? true : undefined}
          aria-describedby={
            fieldErrors.description
              ? 'service-description-help service-description-error'
              : 'service-description-help'
          }
        />
        <p id="service-description-help" className="text-ink-2 text-[12.5px]">
          {s.descriptionHelp}
        </p>
        <FieldError
          id="service-description-error"
          message={fieldErrors.description}
        />
      </div>

      {/* type="button": inside the shell form a default button would submit. */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls="service-more"
        onClick={() => setMoreOpen(!open)}
        className="text-primary -my-2 inline-flex h-11 items-center gap-1.5 self-start px-1 text-[15px] font-semibold tracking-[-0.01em]"
      >
        {t.onboarding.business.more}
        {open ? (
          <ChevronUp className="size-[18px]" aria-hidden />
        ) : (
          <ChevronDown className="size-[18px]" aria-hidden />
        )}
      </button>
      {/* Kept mounted when closed so the choice persists. */}
      <div id="service-more" hidden={!open} className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="service-active">
            {s.activeLabel}
            <span className="text-ink-2 font-normal">
              {' '}
              {t.onboarding.business.optionalTag}
            </span>
          </Label>
          <Switch
            id="service-active"
            checked={form.active}
            onCheckedChange={(active) => update({ active })}
            aria-invalid={fieldErrors.active ? true : undefined}
            aria-describedby={
              fieldErrors.active
                ? 'service-active-help service-active-error'
                : 'service-active-help'
            }
          />
        </div>
        <p id="service-active-help" className="text-ink-2 text-[12.5px]">
          {s.activeHelp}
        </p>
        <FieldError id="service-active-error" message={fieldErrors.active} />
      </div>
    </div>
  );
}
