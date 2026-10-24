import { describe, expect, it } from 'vitest';
import {
  REOPEN_EXIT,
  WHATSAPP_CHOICES,
  WHATSAPP_GUIDE_HREF,
  WHATSAPP_STEP_HREF,
  isWhatsappChoice,
  whatsappStepLeft,
  whatsappPrimaryLabel,
} from '../whatsapp';

describe('whatsappPrimaryLabel', () => {
  it('has no button until a path is picked', () => {
    expect(whatsappPrimaryLabel(null)).toBeNull();
  });

  it('follows the chosen path', () => {
    expect(whatsappPrimaryLabel('have')).toBe('connect');
    expect(whatsappPrimaryLabel('notYet')).toBe('showGuide');
  });
});

describe('isWhatsappChoice', () => {
  it('accepts exactly the known choices', () => {
    for (const choice of WHATSAPP_CHOICES) {
      expect(isWhatsappChoice(choice)).toBe(true);
    }
  });

  it('rejects junk from a stale or tampered draft', () => {
    for (const junk of [null, undefined, '', 'yes', 'HAVE', 1, {}, ['have']]) {
      expect(isWhatsappChoice(junk)).toBe(false);
    }
  });
});

describe('whatsapp hrefs', () => {
  it('nests the guide under the step', () => {
    expect(WHATSAPP_STEP_HREF).toBe('/onboarding/whatsapp');
    expect(WHATSAPP_GUIDE_HREF).toBe('/onboarding/whatsapp/guide');
  });

  it('leaves a reopened step for the dashboard without a history entry', () => {
    expect(REOPEN_EXIT).toEqual({ ok: true, next: '/today', replace: true });
  });
});

describe('whatsappStepLeft', () => {
  const base = { flow: 'guided', completed: true, whatsappConnected: false } as const;

  it('shows only for a completed guided account without a connection', () => {
    expect(whatsappStepLeft(base)).toBe(true);
    expect(whatsappStepLeft({ ...base, flow: 'legacy' })).toBe(false);
    expect(whatsappStepLeft({ ...base, completed: false })).toBe(false);
    expect(whatsappStepLeft({ ...base, whatsappConnected: true })).toBe(false);
  });
});
