import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeMock, warnMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  warnMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: { execute: executeMock } }));
vi.mock('@/lib/log', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/log')>()),
  logger: { warn: warnMock, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { appEnv } from '@/lib/env/app-env';
import { FLOW_STEPS } from '../flow';
import {
  FUNNEL_OUTCOMES,
  FUNNEL_STEPS,
  ONBOARDING_FLOW_VERSION,
  finalOutcome,
  recordOnboardingEvent,
} from '../funnel';

beforeEach(() => {
  executeMock.mockReset();
  warnMock.mockReset();
});

describe('constants', () => {
  it('the funnel steps are the flow steps plus finish', () => {
    expect(FUNNEL_STEPS).toEqual([...FLOW_STEPS, 'finish']);
    expect(FUNNEL_OUTCOMES).toEqual([
      'shown',
      'completed',
      'skipped',
      'not_applicable',
    ]);
    expect(ONBOARDING_FLOW_VERSION).toBe(1);
  });
});

describe('finalOutcome', () => {
  it('completed beats skipped beats not_applicable', () => {
    expect(finalOutcome(['shown', 'skipped', 'completed'])).toBe('completed');
    expect(finalOutcome(['completed', 'skipped'])).toBe('completed');
    expect(finalOutcome(['shown', 'skipped'])).toBe('skipped');
    expect(finalOutcome(['not_applicable', 'skipped'])).toBe('skipped');
    expect(finalOutcome(['not_applicable'])).toBe('not_applicable');
  });

  it('no terminal event gives null', () => {
    expect(finalOutcome([])).toBeNull();
    expect(finalOutcome(['shown'])).toBeNull();
  });
});

describe('recordOnboardingEvent', () => {
  it('passes the environment, step and outcome to the statement', async () => {
    executeMock.mockResolvedValue([]);
    await recordOnboardingEvent('acc-1', 'where', 'shown');
    expect(executeMock).toHaveBeenCalledTimes(1);
    const chunks = (executeMock.mock.calls[0][0] as SQL).queryChunks;
    expect(chunks).toContain(appEnv());
    expect(chunks).toContain('where');
    expect(chunks).toContain('shown');
    expect(chunks).toContain('acc-1');
  });

  it('never throws; logs only step, outcome and the error', async () => {
    executeMock.mockRejectedValue(new Error('connection refused'));
    await expect(
      recordOnboardingEvent('acc-1', 'business', 'completed'),
    ).resolves.toBeUndefined();
    expect(warnMock).toHaveBeenCalledTimes(1);
    const [eventName, , attrs] = warnMock.mock.calls[0];
    expect(eventName).toBe('onboarding.funnel_write_failed');
    expect(Object.keys(attrs).sort()).toEqual([
      'account_id',
      'errorMessage',
      'errorName',
      'outcome',
      'step',
    ]);
  });
});
