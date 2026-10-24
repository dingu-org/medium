import { enterScreen } from '@/lib/onboarding/guard';
import { NotificationsStep } from './notifications-step';

export default async function NotificationsPage() {
  const ctx = await enterScreen('notifications');
  return <NotificationsStep {...ctx} />;
}
