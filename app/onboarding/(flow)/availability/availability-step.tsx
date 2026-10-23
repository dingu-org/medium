'use client';

import { ChevronDown, ChevronUp, Globe } from 'lucide-react';
import { useState } from 'react';
import { TimezoneSheet } from '@/components/availability/timezone-sheet';
import { FieldError } from '@/components/onboarding/field-error';
import { StepShell } from '@/components/onboarding/step-shell';
import { useStepDraft } from '@/components/onboarding/use-step-draft';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TIME_RE, validateWeekly } from '@/lib/availability/rules';
import { t } from '@/lib/i18n';
import {
  DAY_ORDER,
  draftToRules,
  hoursDiffer,
  normalizeAvailabilityDraft,
  setDayHours,
  setSharedHours,
  timezoneLabel,
  toggleDay,
  type AvailabilityDraft,
} from '@/lib/onboarding/availability';
import type { ScreenContext } from '@/lib/onboarding/guard';
import { cn } from '@/lib/utils';
import { saveAvailabilityStep } from './actions';

export type { AvailabilityDraft };

const FOCUS_RING =
  'focus-visible:ring-ring/40 outline-none focus-visible:ring-[3px]';
const TIME_INPUT =
  'h-11 w-[86px] rounded-[14px] px-2 text-center text-[15px] tabular-nums';

export function AvailabilityStep({
  accountId,
  progress,
  backHref,
  initial,
}: ScreenContext & { initial: AvailabilityDraft }) {
  const a = t.onboarding.availability;
  const [stored, setStored] = useStepDraft<AvailabilityDraft>(
    accountId,
    'availability',
    initial,
  );
  // The stored draft may be malformed or from an older format.
  const draft = normalizeAvailabilityDraft(stored, initial);
  // null: follow the data (open when the open days have different hours).
  const [weekOpen, setWeekOpen] = useState<boolean | null>(null);
  const [tzOpen, setTzOpen] = useState(false);
  // The subheading is outside the shell's render prop, so a timezone error is
  // kept here (it can only arrive from a stale or tampered draft).
  const [tzError, setTzError] = useState<string | undefined>(undefined);

  const differ = hoursDiffer(draft);
  // With uniform hours the pair shows what the open days have, so what is
  // shown always matches what is saved; otherwise it shows the template.
  const firstOpen = draft.days.find((day) => day.open);
  const shown = !differ && firstOpen ? firstOpen : draft.hours;

  return (
    <StepShell
      screen="availability"
      progress={progress}
      backHref={backHref}
      accountId={accountId}
      heading={a.title}
      subheading={
        <>
          <p>{a.sub}</p>
          <p className="text-ink-2 mt-3 flex items-center gap-2 text-[14px]">
            <Globe className="size-4 shrink-0" aria-hidden />
            <span>
              {a.tzPrefix}{' '}
              <strong className="text-foreground font-semibold">
                {timezoneLabel(draft.timezone)}
              </strong>
            </span>
            <span aria-hidden className="text-neutral-400">
              ·
            </span>
            {/* type="button": inside the shell form a default button would submit.
                aria-invalid on a button: the shell focuses the first [aria-invalid="true"]. */}
            {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props */}
            <button
              type="button"
              aria-label={a.tzChangeLabel}
              aria-haspopup="dialog"
              aria-invalid={tzError ? true : undefined}
              aria-describedby={tzError ? 'availability-tz-error' : undefined}
              onClick={() => setTzOpen(true)}
              className={cn(
                'text-primary -my-3 h-11 rounded-md px-1 text-[14px] font-semibold',
                FOCUS_RING,
              )}
            >
              {a.tzChange}
            </button>
          </p>
          <FieldError id="availability-tz-error" message={tzError} />
        </>
      }
      primary={{
        label: t.onboarding.flow.continue,
        onPress: async () => {
          const rules = draftToRules(draft);
          const v = validateWeekly({ timezone: draft.timezone, rules });
          if (!v.ok) {
            setTzError(v.fieldErrors.timezone);
            return {
              ok: false,
              fieldErrors: v.fieldErrors,
              reason: a.fixHours,
            };
          }
          setTzError(undefined);
          const result = await saveAvailabilityStep({
            timezone: draft.timezone,
            rules,
          });
          if (!result.ok) setTzError(result.fieldErrors?.timezone);
          return result;
        },
      }}
    >
      {({ fieldErrors }) => {
        const dayErrorKeys = Object.keys(fieldErrors).filter((k) =>
          k.startsWith('day-'),
        );
        const hasDayErrors = dayErrorKeys.length > 0;
        // Differing hours with an error must show the list so the shell can
        // focus the invalid row; never put aria-invalid inside a hidden block.
        const showWeek = (hasDayErrors && differ) || (weekOpen ?? differ);
        const daysError = fieldErrors.days;
        // Uniform hours collapsed: every open day carries the same error, so
        // it is shown once, under the shared pair.
        const hoursError =
          !showWeek && hasDayErrors ? fieldErrors[dayErrorKeys[0]] : undefined;
        const sharedBadInput = !TIME_RE.test(shown.start) ? 'start' : 'end';

        return (
          <div className="flex flex-col gap-6">
            <fieldset
              aria-describedby={
                daysError ? 'availability-days-error' : undefined
              }
            >
              <legend className="mb-3 text-[14px] font-medium">
                {a.daysLegend}
              </legend>
              <div className="flex justify-between">
                {DAY_ORDER.map((w, index) => {
                  const isOpen = draft.days[w].open;
                  const invalid = Boolean(daysError) && index === 0;
                  return (
                    // The shell focuses the first [aria-invalid="true"] (the Monday chip).
                    // eslint-disable-next-line jsx-a11y/role-supports-aria-props
                    <button
                      key={w}
                      type="button"
                      aria-pressed={isOpen}
                      aria-label={t.availability.days[w]}
                      aria-invalid={invalid ? true : undefined}
                      aria-describedby={
                        invalid ? 'availability-days-error' : undefined
                      }
                      onClick={() => setStored(toggleDay(draft, w))}
                      // 7 x 44px does not fit a 320px viewport (288px content).
                      className={cn(
                        'size-10 rounded-full border text-[13px] font-semibold min-[360px]:size-11',
                        FOCUS_RING,
                        isOpen
                          ? 'bg-primary border-primary text-primary-foreground font-bold'
                          : 'bg-card border-input text-foreground',
                        invalid && 'border-destructive',
                      )}
                    >
                      {t.availability.daysShort[w]}
                    </button>
                  );
                })}
              </div>
              <FieldError id="availability-days-error" message={daysError} />
            </fieldset>

            {/* Kept mounted when hidden so the values persist. */}
            <fieldset
              id="availability-hours"
              hidden={showWeek}
              aria-describedby={
                hoursError ? 'availability-hours-error' : undefined
              }
            >
              <legend className="mb-3 text-[14px] font-medium">
                {a.hoursLegend}
              </legend>
              <div className="grid grid-cols-2 gap-3">
                {(['start', 'end'] as const).map((field) => {
                  const invalid =
                    Boolean(hoursError) && sharedBadInput === field;
                  return (
                    <div key={field} className="flex flex-col gap-2">
                      <Label htmlFor={`availability-${field}`}>
                        {a[field]}
                      </Label>
                      <Input
                        id={`availability-${field}`}
                        type="time"
                        value={shown[field]}
                        onChange={(event) =>
                          setStored(
                            setSharedHours(draft, {
                              [field]: event.target.value.slice(0, 5),
                            }),
                          )
                        }
                        className="tabular-nums"
                        aria-invalid={invalid ? true : undefined}
                        aria-describedby={
                          invalid ? 'availability-hours-error' : undefined
                        }
                      />
                    </div>
                  );
                })}
              </div>
              <FieldError id="availability-hours-error" message={hoursError} />
            </fieldset>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                aria-expanded={showWeek}
                aria-controls="availability-week"
                onClick={() => setWeekOpen(!showWeek)}
                className={cn(
                  'text-primary -my-2 inline-flex h-11 items-center gap-1.5 self-start rounded-md px-1 text-[15px] font-semibold tracking-[-0.01em]',
                  FOCUS_RING,
                )}
              >
                {a.differentHours}
                {showWeek ? (
                  <ChevronUp className="size-[18px]" aria-hidden />
                ) : (
                  <ChevronDown className="size-[18px]" aria-hidden />
                )}
              </button>
              {/* Kept mounted when closed so edited values persist. */}
              <ul
                id="availability-week"
                hidden={!showWeek}
                className="bg-card border-line shadow-card divide-sep divide-y rounded-lg border"
              >
                {DAY_ORDER.map((w) => {
                  const day = draft.days[w];
                  const name = t.availability.days[w];
                  const error = fieldErrors[`day-${w}`];
                  const badField = !TIME_RE.test(day.start) ? 'start' : 'end';
                  const errorId = `availability-day-${w}-error`;
                  const timeInput = (field: 'start' | 'end') => {
                    const invalid =
                      Boolean(error) && showWeek && badField === field;
                    return (
                      <Input
                        type="time"
                        value={day[field]}
                        aria-label={
                          field === 'start'
                            ? t.availability.startTimeAriaLabel(name)
                            : t.availability.endTimeAriaLabel(name)
                        }
                        onChange={(event) =>
                          setStored(
                            setDayHours(draft, w, {
                              [field]: event.target.value.slice(0, 5),
                            }),
                          )
                        }
                        className={TIME_INPUT}
                        aria-invalid={invalid ? true : undefined}
                        aria-describedby={invalid ? errorId : undefined}
                      />
                    );
                  };
                  return (
                    <li
                      key={w}
                      className="flex min-h-[52px] flex-wrap items-center justify-between gap-x-2 px-4 py-1.5"
                    >
                      <span
                        className={cn(
                          'text-[15px] font-semibold',
                          !day.open && 'text-ink-2',
                        )}
                      >
                        {name}
                      </span>
                      {day.open ? (
                        <span className="flex items-center gap-1.5">
                          {timeInput('start')}
                          <span aria-hidden>–</span>
                          {timeInput('end')}
                        </span>
                      ) : (
                        <span className="text-ink-2 text-[14px] font-medium">
                          {t.availability.closed}
                        </span>
                      )}
                      {showWeek && error ? (
                        <div className="w-full pb-1">
                          <FieldError id={errorId} message={error} />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>

            <TimezoneSheet
              open={tzOpen}
              current={draft.timezone}
              onOpenChange={setTzOpen}
              onPick={(tz) => {
                setTzOpen(false);
                setTzError(undefined);
                setStored({ ...draft, timezone: tz });
              }}
            />
          </div>
        );
      }}
    </StepShell>
  );
}
