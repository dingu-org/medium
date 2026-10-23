'use client';

import { FieldError } from '@/components/onboarding/field-error';
import { StepShell } from '@/components/onboarding/step-shell';
import { t } from '@/lib/i18n';
import type { ScreenContext } from '@/lib/onboarding/guard';
import type { ServiceRecord } from '@/lib/services/queries';
import { confirmServicesPlaceholder } from './actions';

// PLACEHOLDER(MED-118): replaced by the real Services screen.
export function ServicesStep({
  accountId,
  progress,
  backHref,
  services,
}: ScreenContext & { services: ServiceRecord[] }) {
  return (
    <StepShell
      screen="services"
      progress={progress}
      backHref={backHref}
      accountId={accountId}
      heading={t.onboarding.steps.servicesTitle}
      subheading={t.onboarding.steps.servicesSub}
      primary={{
        label: t.onboarding.flow.continue,
        onPress: () => confirmServicesPlaceholder(),
      }}
    >
      {({ fieldErrors }) => (
        <div>
          <ul className="border-border bg-card overflow-hidden rounded-md border text-sm">
            {services.map((service) => (
              <li
                key={service.id}
                className="border-border border-b px-4 py-3 last:border-b-0"
              >
                {service.name} · {service.durationMinutes} min
              </li>
            ))}
          </ul>
          <FieldError id="services-error" message={fieldErrors.services} />
        </div>
      )}
    </StepShell>
  );
}
