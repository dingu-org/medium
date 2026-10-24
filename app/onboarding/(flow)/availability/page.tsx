import { enterScreen } from '@/lib/onboarding/guard';
import { AvailabilityStep } from './availability-step';
import { loadAvailabilityDraft } from './load';

export default async function AvailabilityPage() {
  const ctx = await enterScreen('availability');
  const initial = await loadAvailabilityDraft(ctx.accountId);
  return <AvailabilityStep {...ctx} initial={initial} />;
}
