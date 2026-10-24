import { enterScreen } from '@/lib/onboarding/guard';
import { HowItWorksStep } from './how-it-works-step';

export default async function HowItWorksPage() {
  const ctx = await enterScreen('intro');
  return <HowItWorksStep {...ctx} />;
}
