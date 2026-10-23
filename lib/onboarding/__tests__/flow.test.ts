import { describe, expect, it } from 'vitest';
import {
  FLOW_STEPS,
  applicableSteps,
  canVisit,
  nextScreen,
  previousScreen,
  progressFor,
  requiredDone,
  resumeScreen,
  screenHref,
  whereApplies,
  type FlowFacts,
  type FlowScreenId,
  type ServiceMode,
} from '../flow';

const fresh: FlowFacts = {
  introSeen: false,
  business: false,
  services: false,
  serviceModes: [],
  where: false,
  availability: false,
  whatsappSeen: false,
  notificationsSeen: false,
  completed: false,
};

const facts = (over: Partial<FlowFacts> = {}): FlowFacts => ({
  ...fresh,
  ...over,
});

const allRequired = (over: Partial<FlowFacts> = {}) =>
  facts({
    introSeen: true,
    business: true,
    services: true,
    serviceModes: ['at_business'],
    where: true,
    availability: true,
    ...over,
  });

const allOnline = (over: Partial<FlowFacts> = {}) =>
  allRequired({ serviceModes: ['online'], where: false, ...over });

describe('flow order and addresses', () => {
  it('keeps the ticket order', () => {
    expect([...FLOW_STEPS]).toEqual([
      'intro',
      'business',
      'services',
      'where',
      'availability',
      'whatsapp',
      'notifications',
    ]);
  });

  it('gives each screen its own address', () => {
    expect(screenHref('intro')).toBe('/onboarding/how-it-works');
    expect(screenHref('business')).toBe('/onboarding/business');
    expect(screenHref('finish')).toBe('/onboarding/finish');
  });
});

describe('whereApplies', () => {
  it('applies before the services are saved', () => {
    expect(
      whereApplies(facts({ services: false, serviceModes: ['online'] })),
    ).toBe(true);
  });
  it('applies while services carry no mode yet', () => {
    expect(whereApplies(facts({ services: true, serviceModes: [null] }))).toBe(
      true,
    );
  });
  it('is skipped when every service is online', () => {
    expect(
      whereApplies(facts({ services: true, serviceModes: ['online'] })),
    ).toBe(false);
  });
  it('applies when any service is not online', () => {
    const modes: ServiceMode[] = ['online', 'at_client'];
    expect(whereApplies(facts({ services: true, serviceModes: modes }))).toBe(
      true,
    );
  });
});

describe('progress total', () => {
  it('is 7 before services are saved and 6 after an all-online save', () => {
    expect(progressFor('services', facts()).total).toBe(7);
    expect(progressFor('services', allOnline()).total).toBe(6);
  });

  it('skips Where in the positions', () => {
    expect(
      progressFor('availability', allOnline({ availability: false })),
    ).toEqual({
      kind: 'step',
      position: 4,
      total: 6,
    });
    expect(progressFor('availability', allRequired())).toEqual({
      kind: 'step',
      position: 5,
      total: 7,
    });
  });

  it('is complete on Finish', () => {
    expect(progressFor('finish', allRequired())).toEqual({
      kind: 'complete',
      total: 7,
    });
  });
});

describe('resumeScreen', () => {
  it('starts a fresh account on the intro', () => {
    expect(resumeScreen(fresh)).toBe('intro');
  });
  it('moves on to business once the intro is seen', () => {
    expect(resumeScreen(facts({ introSeen: true }))).toBe('business');
  });
  it('stops on WhatsApp when only the required steps are done', () => {
    expect(resumeScreen(allRequired())).toBe('whatsapp');
  });
  it('stops on notifications after WhatsApp is seen', () => {
    expect(resumeScreen(allRequired({ whatsappSeen: true }))).toBe(
      'notifications',
    );
  });
  it('ends on Finish when everything is seen', () => {
    expect(
      resumeScreen(
        allRequired({ whatsappSeen: true, notificationsSeen: true }),
      ),
    ).toBe('finish');
  });
  it('does not stop on a skipped Where', () => {
    expect(resumeScreen(allOnline({ availability: false }))).toBe(
      'availability',
    );
  });
  it('requiredDone ignores the seen steps', () => {
    expect(requiredDone(allRequired())).toBe(true);
    expect(requiredDone(allRequired({ availability: false }))).toBe(false);
  });
});

describe('canVisit', () => {
  it('blocks jumping ahead and allows going back', () => {
    const f = facts({ introSeen: true, business: true });
    expect(canVisit('services', f)).toBe(true);
    expect(canVisit('business', f)).toBe(true);
    expect(canVisit('intro', f)).toBe(true);
    expect(canVisit('where', f)).toBe(false);
    expect(canVisit('availability', f)).toBe(false);
  });

  it('opens Finish only at the end, or once completed', () => {
    expect(canVisit('finish', allRequired())).toBe(false);
    const done = allRequired({ whatsappSeen: true, notificationsSeen: true });
    expect(canVisit('finish', done)).toBe(true);
    expect(canVisit('finish', allRequired({ completed: true }))).toBe(true);
  });

  it('does not open an inapplicable Where', () => {
    expect(canVisit('where', allOnline())).toBe(false);
  });

  it('always accepts the resume screen', () => {
    const matrix: FlowFacts[] = [
      fresh,
      facts({ introSeen: true }),
      facts({
        introSeen: true,
        business: true,
        services: true,
        serviceModes: [null],
      }),
      allRequired(),
      allOnline(),
      allOnline({ availability: false }),
      allRequired({ whatsappSeen: true }),
      allRequired({ whatsappSeen: true, notificationsSeen: true }),
    ];
    for (const f of matrix) expect(canVisit(resumeScreen(f), f)).toBe(true);
  });
});

describe('nextScreen and previousScreen', () => {
  it('walks the applicable steps in order', () => {
    expect(nextScreen('intro', fresh)).toBe('business');
    expect(nextScreen('notifications', allRequired())).toBe('finish');
  });

  it('steps over a skipped Where in both directions', () => {
    const f = allOnline();
    expect(nextScreen('services', f)).toBe('availability');
    expect(previousScreen('availability', f)).toBe('services');
  });

  it('continues from Where even after it stopped applying', () => {
    expect(nextScreen('where', allOnline())).toBe('availability');
  });

  it('has no previous screen for intro and finish', () => {
    expect(previousScreen('intro', fresh)).toBeNull();
    expect(previousScreen('finish', allRequired())).toBeNull();
  });

  it('applicableSteps drops Where only when skipped', () => {
    const screens: FlowScreenId[] = applicableSteps(allOnline());
    expect(screens).not.toContain('where');
    expect(applicableSteps(fresh)).toContain('where');
  });
});
