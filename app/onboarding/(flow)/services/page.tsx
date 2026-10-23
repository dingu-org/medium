import { enterScreen } from '@/lib/onboarding/guard';
import { getServices } from '@/lib/services/queries';
import { ServicesStep } from './services-step';

export default async function ServicesPage() {
  const ctx = await enterScreen('services');
  const services = await getServices(ctx.accountId, { activeOnly: true });
  return <ServicesStep {...ctx} services={services} />;
}
