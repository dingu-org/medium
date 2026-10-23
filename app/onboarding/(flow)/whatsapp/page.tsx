import { GRAPH_VERSION } from '@/lib/channels/whatsapp/constants';
import { enterWhatsappScreen } from '@/lib/onboarding/guard';
import { WhatsappStep } from './whatsapp-step';

export default async function WhatsappPage() {
  const ctx = await enterWhatsappScreen();
  // Same environment reading as the settings WhatsApp page.
  return (
    <WhatsappStep
      {...ctx}
      appId={process.env.NEXT_PUBLIC_META_APP_ID ?? ''}
      configId={process.env.NEXT_PUBLIC_META_CONFIG_ID ?? ''}
      graphVersion={GRAPH_VERSION}
      initialChoice={null}
    />
  );
}
