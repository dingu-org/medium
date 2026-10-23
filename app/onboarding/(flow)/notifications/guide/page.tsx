import { enterScreen } from '@/lib/onboarding/guard';
import { NOTIFICATIONS_STEP_HREF } from '@/lib/onboarding/notifications';
import { NotificationsGuideStep } from './guide-step';

/** A pushed sub-screen of step 7; Back always returns to the benefit screen. */
export default async function NotificationsGuidePage() {
  const ctx = await enterScreen('notifications');
  return <NotificationsGuideStep {...ctx} backHref={NOTIFICATIONS_STEP_HREF} />;
}
