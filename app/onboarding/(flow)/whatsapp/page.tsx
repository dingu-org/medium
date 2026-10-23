import { enterScreen } from '@/lib/onboarding/guard';
import { WhatsappStep } from './whatsapp-step';

export default async function WhatsappPage() {
  const ctx = await enterScreen('whatsapp');
  return <WhatsappStep {...ctx} />;
}
