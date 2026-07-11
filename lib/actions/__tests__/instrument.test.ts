import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rethrow = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ unstable_rethrow: rethrow }));

import { logger } from '@/lib/log';
import { instrumentedAction } from '@/lib/actions/instrument';

beforeEach(() => {
  rethrow.mockReset();
  // Default: not a router control-flow error → returns without throwing.
  rethrow.mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('instrumentedAction', () => {
  it('passes the resolved value through and logs nothing', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const wrapped = instrumentedAction(
      'chat.demo',
      async (a: number, b: number) => a + b,
    );
    await expect(wrapped(2, 3)).resolves.toBe(5);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs action.error once and rethrows a plain error', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const boom = new Error('kaboom');
    const wrapped = instrumentedAction('chat.demo', async () => {
      throw boom;
    });
    await expect(wrapped()).rejects.toBe(boom);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [eventName, message, attrs] = errorSpy.mock.calls[0];
    expect(eventName).toBe('action.error');
    expect(message).toBe('chat.demo');
    expect(attrs).toMatchObject({ action: 'chat.demo', errorName: 'Error' });
    expect(attrs).toHaveProperty('trace_id');
  });

  it('rethrows a redirect-style error without logging', async () => {
    // unstable_rethrow re-throws Next router control-flow errors.
    rethrow.mockImplementation((e: unknown) => {
      throw e;
    });
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const redirect = new Error('NEXT_REDIRECT');
    const wrapped = instrumentedAction('chat.demo', async () => {
      throw redirect;
    });
    await expect(wrapped()).rejects.toBe(redirect);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
