'use client';

import {
  Apple,
  Brain,
  Briefcase,
  Check,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  Flower2,
  GraduationCap,
  Hand,
  PersonStanding,
  Scissors,
  Smile,
  User,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { FieldError } from '@/components/onboarding/field-error';
import { StepShell } from '@/components/onboarding/step-shell';
import { useStepDraft } from '@/components/onboarding/use-step-draft';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  BUSINESS_TYPES,
  isBusinessType,
  type BusinessType,
} from '@/lib/business-types';
import { t } from '@/lib/i18n';
import type { ScreenContext } from '@/lib/onboarding/guard';
import { cn } from '@/lib/utils';
import { saveBusiness } from './actions';

export type BusinessDraft = {
  name: string;
  businessType: BusinessType | null;
  fullName: string;
  title: string;
  tagline: string;
};

// Typed over the closed list: adding a type fails to compile until it has an icon.
const ICONS: Record<BusinessType, LucideIcon> = {
  psychologist: Brain,
  physiotherapist: PersonStanding,
  dentist: Smile,
  beauty_salon: Flower2,
  personal_trainer: Dumbbell,
  barber_hairdresser: Scissors,
  massage_therapist: Hand,
  nutritionist: Apple,
  coach_tutor: GraduationCap,
  consultant: Briefcase,
  other_professional: User,
};

export function BusinessStep({
  accountId,
  progress,
  backHref,
  initial,
}: ScreenContext & { initial: BusinessDraft }) {
  const b = t.onboarding.business;
  const [draft, setDraft] = useStepDraft<BusinessDraft>(
    accountId,
    'business',
    initial,
  );
  // A stale or tampered stored draft can never select a type outside the list.
  const businessType = isBusinessType(draft.businessType)
    ? draft.businessType
    : null;
  const update = (patch: Partial<BusinessDraft>) =>
    setDraft({ ...draft, ...patch });
  // null: follow the data (open when any optional value is filled).
  const [moreOpen, setMoreOpen] = useState<boolean | null>(null);

  return (
    <StepShell
      screen="business"
      progress={progress}
      backHref={backHref}
      accountId={accountId}
      heading={b.title}
      subheading={b.sub}
      primary={{
        label: t.onboarding.flow.continue,
        onPress: () => saveBusiness({ ...draft, businessType }),
      }}
    >
      {({ fieldErrors }) => {
        const optionalInvalid = Boolean(
          fieldErrors.fullName || fieldErrors.title || fieldErrors.tagline,
        );
        // An invalid optional field is always shown so the shell can focus it.
        const open =
          optionalInvalid ||
          (moreOpen ?? Boolean(draft.fullName || draft.title || draft.tagline));
        const typeError = fieldErrors.businessType;
        const optionalTag = (
          <span className="text-ink-2 font-normal"> {b.optionalTag}</span>
        );
        return (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="business-name">
                {t.settings.profilePracticeLabel}
              </Label>
              <Input
                id="business-name"
                value={draft.name}
                onChange={(event) => update({ name: event.target.value })}
                placeholder={b.namePlaceholder}
                autoComplete="organization"
                maxLength={120}
                aria-invalid={fieldErrors.name ? true : undefined}
                aria-describedby={
                  fieldErrors.name ? 'business-name-error' : undefined
                }
              />
              <FieldError id="business-name-error" message={fieldErrors.name} />
            </div>

            <div className="flex flex-col gap-2">
              <p id="business-type-label" className="text-[14px] font-medium">
                {b.typeLabel}
              </p>
              <p
                id="business-type-help"
                className="text-ink-2 -mt-1 text-[12.5px]"
              >
                {b.typeHelp}
              </p>
              {/* Above the rows so it is visible without scrolling the list. */}
              <FieldError id="business-type-error" message={typeError} />
              <div
                role="radiogroup"
                aria-labelledby="business-type-label"
                aria-describedby={
                  typeError
                    ? 'business-type-help business-type-error'
                    : 'business-type-help'
                }
                aria-required="true"
                aria-invalid={typeError ? true : undefined}
                tabIndex={-1}
                className="flex flex-col gap-2 outline-none"
              >
                {BUSINESS_TYPES.map((type) => {
                  const Icon = ICONS[type];
                  const checked = businessType === type;
                  return (
                    <label
                      key={type}
                      className={cn(
                        'border-line bg-card relative flex min-h-14 cursor-pointer scroll-my-4 items-center gap-3 rounded-md border py-2.5 pr-4 pl-3 shadow-[var(--shadow-card)]',
                        'has-[:focus-visible]:border-ring has-[:focus-visible]:ring-ring/20 has-[:focus-visible]:ring-3',
                        typeError && !checked && 'border-destructive',
                        checked &&
                          'border-primary shadow-[0_0_0_1px_var(--primary),var(--shadow-card)]',
                      )}
                    >
                      <input
                        type="radio"
                        name="business-type"
                        value={type}
                        checked={checked}
                        onChange={() => update({ businessType: type })}
                        className="sr-only"
                      />
                      <span
                        aria-hidden
                        className={cn(
                          'flex size-9 flex-none items-center justify-center rounded-[12px] bg-[var(--neutral-100)] text-[var(--neutral-600)]',
                          checked &&
                            'bg-[var(--brand-50)] text-[var(--brand-600)]',
                        )}
                      >
                        <Icon className="size-[19px]" />
                      </span>
                      <span className="min-w-0 flex-1 text-[15px] leading-[1.35] font-semibold tracking-[-0.005em]">
                        {t.businessTypes[type]}
                      </span>
                      <span
                        aria-hidden
                        className={cn(
                          'bg-card flex size-[22px] flex-none items-center justify-center rounded-full border-[1.5px] border-[var(--neutral-400)] text-[var(--neutral-0)]',
                          checked && 'border-primary bg-primary',
                        )}
                      >
                        {checked && (
                          <Check className="size-3.5" strokeWidth={3} />
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* type="button": inside the shell form a default button would submit. */}
            <button
              type="button"
              aria-expanded={open}
              aria-controls="business-more"
              onClick={() => setMoreOpen(!open)}
              className="text-primary -my-2 inline-flex h-11 items-center gap-1.5 self-start px-1 text-[15px] font-semibold tracking-[-0.01em]"
            >
              {b.more}
              {open ? (
                <ChevronUp className="size-[18px]" aria-hidden />
              ) : (
                <ChevronDown className="size-[18px]" aria-hidden />
              )}
            </button>
            {/* Kept mounted when closed so typed values persist. */}
            <div
              id="business-more"
              hidden={!open}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="business-owner">
                  {b.ownerLabel}
                  {optionalTag}
                </Label>
                <Input
                  id="business-owner"
                  value={draft.fullName}
                  onChange={(event) => update({ fullName: event.target.value })}
                  autoComplete="name"
                  maxLength={120}
                  aria-invalid={fieldErrors.fullName ? true : undefined}
                  aria-describedby={
                    fieldErrors.fullName ? 'business-owner-error' : undefined
                  }
                />
                <FieldError
                  id="business-owner-error"
                  message={fieldErrors.fullName}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="business-title">
                  {t.settings.profileTitleLabel}
                  {optionalTag}
                </Label>
                <Input
                  id="business-title"
                  value={draft.title}
                  onChange={(event) => update({ title: event.target.value })}
                  placeholder={b.titlePlaceholder}
                  maxLength={120}
                  aria-invalid={fieldErrors.title ? true : undefined}
                  aria-describedby={
                    fieldErrors.title
                      ? 'business-title-help business-title-error'
                      : 'business-title-help'
                  }
                />
                <p
                  id="business-title-help"
                  className="text-ink-2 text-[12.5px]"
                >
                  {t.settings.profileTitleHelp}
                </p>
                <FieldError
                  id="business-title-error"
                  message={fieldErrors.title}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="business-tagline">
                  {b.taglineLabel}
                  {optionalTag}
                </Label>
                <Textarea
                  id="business-tagline"
                  rows={3}
                  value={draft.tagline}
                  onChange={(event) => update({ tagline: event.target.value })}
                  placeholder={b.taglinePlaceholder}
                  maxLength={160}
                  aria-invalid={fieldErrors.tagline ? true : undefined}
                  aria-describedby={
                    fieldErrors.tagline ? 'business-tagline-error' : undefined
                  }
                />
                <FieldError
                  id="business-tagline-error"
                  message={fieldErrors.tagline}
                />
              </div>
            </div>
          </div>
        );
      }}
    </StepShell>
  );
}
