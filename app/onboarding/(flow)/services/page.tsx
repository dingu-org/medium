import { enterScreen } from '@/lib/onboarding/guard';
import { maxActiveServicesFor } from '@/lib/services/limits';
import { getServicesWithDetails } from '@/lib/services/queries';
import { EMPTY_FORM, isComplete, toForm, type ServiceCardData } from './form';
import { ServicesStep } from './services-step';

export default async function ServicesPage() {
  const ctx = await enterScreen('services');
  const [rows, max] = await Promise.all([
    getServicesWithDetails(ctx.accountId),
    maxActiveServicesFor(ctx.accountId),
  ]);
  const cards: ServiceCardData[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    durationMinutes: r.durationMinutes,
    priceLek: r.priceLek,
    mode: r.mode,
    description: r.description,
    active: r.active,
  }));
  // Done: show the saved list. Otherwise open the form, prefilled from the
  // first service that still needs a mode or description (seeded accounts).
  const toFix = cards.find((c) => c.active) ?? cards[0] ?? null;
  const form = cards.some(isComplete)
    ? null
    : toFix
      ? toForm(toFix)
      : EMPTY_FORM;
  return (
    <ServicesStep
      {...ctx}
      services={cards}
      canAddMore={max === null || cards.length < max}
      initial={{ form }}
    />
  );
}
