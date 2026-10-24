'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { FieldError } from '@/components/onboarding/field-error';
import { StepShell } from '@/components/onboarding/step-shell';
import { useStepDraft } from '@/components/onboarding/use-step-draft';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';
import type { ScreenContext } from '@/lib/onboarding/guard';
import {
  normalizeWhereDraft,
  SERVICE_AREA_EXAMPLE,
  type WhereDraft,
  type WhereNeeds,
} from '@/lib/onboarding/where';
import { saveWhere } from './actions';

export type { WhereDraft };

const SECTION_HEADING =
  'text-ink-2 text-[11.5px] font-bold tracking-[0.07em] uppercase';

export function WhereStep({
  accountId,
  progress,
  backHref,
  needs,
  initial,
}: ScreenContext & { needs: WhereNeeds; initial: WhereDraft }) {
  const w = t.onboarding.where;
  const [stored, setStored] = useStepDraft<WhereDraft>(
    accountId,
    'where',
    initial,
  );
  // The stored draft may be in the old placeholder format (a string).
  const draft = normalizeWhereDraft(stored, initial);
  const update = (patch: Partial<WhereDraft>) =>
    setStored({ ...draft, ...patch });
  // null: follow the data (open when any optional value is filled).
  const [detailsOpen, setDetailsOpen] = useState<boolean | null>(null);

  const mixed = needs.atBusiness && needs.atClient;
  const heading = mixed
    ? w.titleMixed
    : needs.atClient
      ? w.titleAtClient
      : needs.atBusiness
        ? w.title
        : w.titleMixed;
  const subheading = mixed
    ? w.subMixed
    : needs.atClient
      ? w.subAtClient
      : needs.atBusiness
        ? w.sub
        : w.nothingNeeded;

  return (
    <StepShell
      screen="where"
      progress={progress}
      backHref={backHref}
      accountId={accountId}
      heading={heading}
      subheading={subheading}
      primary={{
        label: t.onboarding.flow.continue,
        onPress: () => saveWhere(draft),
      }}
    >
      {({ fieldErrors }) => {
        const detailsInvalid = Boolean(
          fieldErrors.directions ||
          fieldErrors.parking ||
          fieldErrors.entrance ||
          fieldErrors.floor,
        );
        const anyDetail = Boolean(
          draft.directions || draft.parking || draft.entrance || draft.floor,
        );
        // An invalid optional field is always shown so the shell can focus it.
        const open = detailsInvalid || (detailsOpen ?? anyDetail);
        const optionalTag = (
          <span className="text-ink-2 font-normal">
            {' '}
            {t.onboarding.business.optionalTag}
          </span>
        );
        const optionalField = (
          key: 'directions' | 'parking' | 'entrance' | 'floor',
          label: string,
          placeholder: string,
          maxLength: number,
        ) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`where-${key}`}>
              {label}
              {optionalTag}
            </Label>
            <Input
              id={`where-${key}`}
              value={draft[key]}
              onChange={(event) => update({ [key]: event.target.value })}
              placeholder={placeholder}
              maxLength={maxLength}
              inputMode="text"
              aria-invalid={fieldErrors[key] ? true : undefined}
              aria-describedby={
                fieldErrors[key] ? `where-${key}-error` : undefined
              }
            />
            <FieldError id={`where-${key}-error`} message={fieldErrors[key]} />
          </div>
        );

        const businessGroup = (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p id="where-country-label" className="text-[14px] font-medium">
                {w.countryLabel}
              </p>
              {/* Fixed text, not a field: Albania only for now. */}
              <p className="border-line bg-sunken text-ink-2 flex h-12 items-center rounded-md border px-3.5 text-[16px]">
                {w.countryName}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="where-city">{w.cityLabel}</Label>
              <Input
                id="where-city"
                value={draft.city}
                onChange={(event) => update({ city: event.target.value })}
                autoComplete="address-level2"
                maxLength={120}
                aria-invalid={fieldErrors.city ? true : undefined}
                aria-describedby={
                  fieldErrors.city ? 'where-city-error' : undefined
                }
              />
              <FieldError id="where-city-error" message={fieldErrors.city} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="where-address">
                {t.settings.profileAddressLabel}
              </Label>
              <Input
                id="where-address"
                value={draft.address}
                onChange={(event) => update({ address: event.target.value })}
                autoComplete="street-address"
                maxLength={240}
                aria-invalid={fieldErrors.address ? true : undefined}
                aria-describedby={
                  fieldErrors.address
                    ? 'where-address-help where-address-error'
                    : 'where-address-help'
                }
              />
              <p id="where-address-help" className="text-ink-2 text-[12.5px]">
                {t.settings.profileAddressHelp}
              </p>
              <FieldError
                id="where-address-error"
                message={fieldErrors.address}
              />
            </div>

            {/* type="button": inside the shell form a default button would submit. */}
            <button
              type="button"
              aria-expanded={open}
              aria-controls="where-details"
              onClick={() => setDetailsOpen(!open)}
              className="text-primary -my-2 inline-flex h-11 items-center gap-1.5 self-start px-1 text-[15px] font-semibold tracking-[-0.01em]"
            >
              {w.details}
              {open ? (
                <ChevronUp className="size-[18px]" aria-hidden />
              ) : (
                <ChevronDown className="size-[18px]" aria-hidden />
              )}
            </button>
            {/* Kept mounted when closed so typed values persist. */}
            <div
              id="where-details"
              hidden={!open}
              className="flex flex-col gap-4"
            >
              <p className="text-ink-2 text-[12.5px]">{w.detailsHelp}</p>
              {optionalField(
                'directions',
                w.directionsLabel,
                w.directionsPlaceholder,
                200,
              )}
              {optionalField(
                'parking',
                w.parkingLabel,
                w.parkingPlaceholder,
                200,
              )}
              <div className="grid grid-cols-2 gap-3">
                {optionalField(
                  'entrance',
                  w.entranceLabel,
                  w.entrancePlaceholder,
                  200,
                )}
                {optionalField('floor', w.floorLabel, w.floorPlaceholder, 40)}
              </div>
            </div>
          </div>
        );

        const clientGroup = (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="where-area">{w.areaLabel}</Label>
              <button
                type="button"
                aria-label={w.exampleLabel(SERVICE_AREA_EXAMPLE)}
                onClick={() => {
                  update({ serviceArea: SERVICE_AREA_EXAMPLE });
                  document.getElementById('where-area')?.focus();
                }}
                className="text-primary -my-2 -mr-2 inline-flex h-11 items-center px-2 text-[14px] font-semibold"
              >
                {w.example}
              </button>
            </div>
            <Input
              id="where-area"
              value={draft.serviceArea}
              onChange={(event) => update({ serviceArea: event.target.value })}
              placeholder={w.areaPlaceholder}
              maxLength={240}
              aria-invalid={fieldErrors.serviceArea ? true : undefined}
              aria-describedby={
                fieldErrors.serviceArea
                  ? mixed
                    ? 'where-client-help where-area-error'
                    : 'where-area-error'
                  : mixed
                    ? 'where-client-help'
                    : undefined
              }
            />
            <FieldError
              id="where-area-error"
              message={fieldErrors.serviceArea}
            />
          </div>
        );

        if (!mixed) {
          return needs.atBusiness
            ? businessGroup
            : needs.atClient
              ? clientGroup
              : null;
        }
        const section = (
          id: string,
          title: string,
          help: string,
          helpId: string,
          body: ReactNode,
        ) => (
          <section aria-labelledby={id} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 id={id} className={SECTION_HEADING}>
                {title}
              </h2>
              <p id={helpId} className="text-ink-2 text-[12.5px]">
                {help}
              </p>
            </div>
            {body}
          </section>
        );
        return (
          <div className="flex flex-col gap-8">
            {section(
              'where-business-heading',
              w.sectionBusiness,
              w.sub,
              'where-business-help',
              businessGroup,
            )}
            {section(
              'where-client-heading',
              w.sectionClient,
              w.subAtClient,
              'where-client-help',
              clientGroup,
            )}
          </div>
        );
      }}
    </StepShell>
  );
}
