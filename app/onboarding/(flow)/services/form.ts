import { isServiceMode, type ServiceMode } from '@/lib/services/modes';

/** Duration chips; anything else is entered under "Tjetër". */
export const DURATION_PRESETS = [15, 30, 45, 60, 90] as const;

export type ServiceFormDraft = {
  /** The service being edited; null = a new one. */
  id: string | null;
  name: string;
  /** The chosen preset; ignored while `customDuration`. */
  duration: number | null;
  customDuration: boolean;
  customMinutes: string;
  price: string;
  mode: ServiceMode | null;
  description: string;
  active: boolean;
};

export type ServicesDraft = { form: ServiceFormDraft | null };

/** One saved service as the step shows and edits it. */
export type ServiceCardData = {
  id: string;
  name: string;
  durationMinutes: number;
  priceLek: number | null;
  mode: ServiceMode | null;
  description: string | null;
  active: boolean;
};

export const EMPTY_FORM: ServiceFormDraft = {
  id: null,
  name: '',
  duration: null,
  customDuration: false,
  customMinutes: '',
  price: '',
  mode: null,
  description: '',
  active: true,
};

export function toForm(service: ServiceCardData): ServiceFormDraft {
  const preset = (DURATION_PRESETS as readonly number[]).includes(
    service.durationMinutes,
  );
  return {
    id: service.id,
    name: service.name,
    duration: preset ? service.durationMinutes : null,
    customDuration: !preset,
    customMinutes: preset ? '' : String(service.durationMinutes),
    price: service.priceLek != null ? String(service.priceLek) : '',
    mode: service.mode,
    description: service.description ?? '',
    active: service.active,
  };
}

/** Whether a service already has everything the step requires. */
export function isComplete(
  service: Pick<ServiceCardData, 'active' | 'mode' | 'description'>,
): boolean {
  return Boolean(service.active && service.mode && service.description?.trim());
}

/** A stale or tampered stored draft can never carry a mode or duration outside the allowed set. */
export function sanitizeForm(form: ServiceFormDraft): ServiceFormDraft {
  return {
    ...EMPTY_FORM,
    ...form,
    id: typeof form.id === 'string' ? form.id : null,
    mode: isServiceMode(form.mode) ? form.mode : null,
    duration: typeof form.duration === 'number' ? form.duration : null,
    active: form.active !== false,
  };
}

/** The raw numbers the server validates: null when nothing usable was entered. */
export function durationOf(form: ServiceFormDraft): number | null {
  if (!form.customDuration) return form.duration;
  const text = form.customMinutes.trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}
