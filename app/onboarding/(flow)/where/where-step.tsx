'use client';

import { FieldError } from '@/components/onboarding/field-error';
import { StepShell } from '@/components/onboarding/step-shell';
import { useStepDraft } from '@/components/onboarding/use-step-draft';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';
import type { ScreenContext } from '@/lib/onboarding/guard';
import { saveWherePlaceholder } from './actions';

// PLACEHOLDER(MED-119): replaced by the real Where screen.
export function WhereStep({
  accountId,
  progress,
  backHref,
  initialAddress,
}: ScreenContext & { initialAddress: string }) {
  const [address, setAddress] = useStepDraft(
    accountId,
    'where',
    initialAddress,
  );
  return (
    <StepShell
      screen="where"
      progress={progress}
      backHref={backHref}
      accountId={accountId}
      heading={t.settings.profileAddressLabel}
      primary={{
        label: t.onboarding.flow.continue,
        onPress: () => saveWherePlaceholder(address),
      }}
    >
      {({ fieldErrors }) => (
        <div>
          <Label htmlFor="where-address">
            {t.settings.profileAddressLabel}
          </Label>
          <Input
            id="where-address"
            className="mt-2"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            aria-invalid={fieldErrors.address ? true : undefined}
            aria-describedby={
              fieldErrors.address ? 'where-address-error' : undefined
            }
            autoComplete="street-address"
          />
          <FieldError id="where-address-error" message={fieldErrors.address} />
        </div>
      )}
    </StepShell>
  );
}
