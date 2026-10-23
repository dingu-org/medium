'use client';

import { FieldError } from '@/components/onboarding/field-error';
import { StepShell } from '@/components/onboarding/step-shell';
import { useStepDraft } from '@/components/onboarding/use-step-draft';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';
import type { ScreenContext } from '@/lib/onboarding/guard';
import { saveBusinessPlaceholder } from './actions';

// PLACEHOLDER(MED-117): replaced by the real Business identity screen.
export function BusinessStep({
  accountId,
  progress,
  backHref,
  initialName,
}: ScreenContext & { initialName: string }) {
  const [name, setName] = useStepDraft(accountId, 'business', initialName);
  return (
    <StepShell
      screen="business"
      progress={progress}
      backHref={backHref}
      accountId={accountId}
      heading={t.onboarding.steps.profileTitle}
      primary={{
        label: t.onboarding.flow.continue,
        onPress: () => saveBusinessPlaceholder(name),
      }}
    >
      {({ fieldErrors }) => (
        <div>
          <Label htmlFor="business-name">
            {t.settings.profilePracticeLabel}
          </Label>
          <Input
            id="business-name"
            className="mt-2"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={
              fieldErrors.name ? 'business-name-error' : undefined
            }
            autoComplete="organization"
          />
          <FieldError id="business-name-error" message={fieldErrors.name} />
        </div>
      )}
    </StepShell>
  );
}
