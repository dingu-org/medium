import { enterWhatsappScreen } from '@/lib/onboarding/guard';
import { WHATSAPP_STEP_HREF } from '@/lib/onboarding/whatsapp';
import { WhatsappGuideStep } from './guide-step';

/** A pushed sub-screen of step 6; Back always returns to the choice screen. */
export default async function WhatsappGuidePage() {
  const ctx = await enterWhatsappScreen();
  return <WhatsappGuideStep {...ctx} backHref={WHATSAPP_STEP_HREF} />;
}
