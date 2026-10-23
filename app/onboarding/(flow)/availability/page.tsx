import { enterScreen } from '@/lib/onboarding/guard';
import { AvailabilityStep } from './availability-step';

export default async function AvailabilityPage() {
  const ctx = await enterScreen('availability');
  return <AvailabilityStep {...ctx} />;
}
