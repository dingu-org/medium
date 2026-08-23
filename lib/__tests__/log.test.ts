import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLogger,
  logger,
  newTraceId,
  redactAttrs,
  REDACT_ALLOWLIST,
  REDACT_KEY_RE,
  serializeError,
} from '@/lib/log';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Capture the single JSON line emitted by a logger call. */
function captureLine(
  method: 'info' | 'warn' | 'error',
  run: () => void,
): Record<string, unknown> {
  const spy = vi.spyOn(console, method).mockImplementation(() => {});
  run();
  expect(spy).toHaveBeenCalledTimes(1);
  const arg = spy.mock.calls[0][0];
  expect(typeof arg).toBe('string');
  return JSON.parse(arg as string);
}

const UUID = '11111111-1111-4111-8111-111111111111';

describe('redactAttrs', () => {
  it('redacts every PII-shaped key', () => {
    const input = {
      phone: '+355691234567',
      name: 'Jane Doe',
      body: 'secret message text',
      content: 'more text',
      notes: 'clinical notes',
      email: 'x@y.z',
      token: 'abc',
      secret: 'shh',
      key: 'k',
      authorization: 'Bearer x',
      endpoint: 'https://push/x',
      p256dh: 'pk',
      auth: 'ak',
    };
    const out = redactAttrs(input) as Record<string, unknown>;
    for (const k of Object.keys(input)) {
      expect(out[k]).toBe('[REDACTED]');
    }
  });

  it('recurses into nested objects and arrays', () => {
    const out = redactAttrs({
      outer: { phone: '+355691234567', keep: 1 },
      list: [{ name: 'x' }, { ok: true }],
    }) as Record<string, unknown>;
    expect((out.outer as Record<string, unknown>).phone).toBe('[REDACTED]');
    expect((out.outer as Record<string, unknown>).keep).toBe(1);
    const list = out.list as Array<Record<string, unknown>>;
    expect(list[0].name).toBe('[REDACTED]');
    expect(list[1].ok).toBe(true);
  });

  it('keeps allowlisted keys despite matching /name/i', () => {
    const out = redactAttrs({
      event_name: 'ai.turn_completed',
      errorName: 'TypeError',
      template_name: 'reminder_24h',
      templateName: 'reminder_24h',
    }) as Record<string, unknown>;
    expect(out.event_name).toBe('ai.turn_completed');
    expect(out.errorName).toBe('TypeError');
    expect(out.template_name).toBe('reminder_24h');
    expect(out.templateName).toBe('reminder_24h');
    for (const k of REDACT_ALLOWLIST) {
      expect(REDACT_KEY_RE.test(k)).toBe(true);
    }
  });

  it('scrubs E.164 numbers from surviving string values', () => {
    const out = redactAttrs({ note_id: 'call +355691234567 back' }) as Record<
      string,
      unknown
    >;
    expect(out.note_id).toBe('call [REDACTED] back');
  });

  it('leaves a bare 6-digit number intact', () => {
    const out = redactAttrs({ code: '123456' }) as Record<string, unknown>;
    expect(out.code).toBe('123456');
  });

  it('coerces non-plain objects to a scrubbed string', () => {
    const out = redactAttrs({ err: new Error('reach +355691234567') }) as Record<
      string,
      unknown
    >;
    expect(out.err).toBe('Error: reach [REDACTED]');
  });

  it('passes primitives through unchanged', () => {
    const out = redactAttrs({ n: 3, b: false, z: null }) as Record<
      string,
      unknown
    >;
    expect(out).toEqual({ n: 3, b: false, z: null });
  });
});

describe('createLogger / envelope', () => {
  it('emits a valid JSON envelope with the standard keys', () => {
    const line = captureLine('info', () =>
      logger.info('demo.event', 'hello', { count: 2 }),
    );
    expect(line.timestamp).toEqual(expect.any(String));
    expect(() => new Date(line.timestamp as string)).not.toThrow();
    expect(line.level).toBe('info');
    expect(line.event_name).toBe('demo.event');
    expect(line.message).toBe('hello');
    expect(line.count).toBe(2);
  });

  it('never redacts the trace_id/account_id/conversation_id envelope keys', () => {
    const line = captureLine('info', () =>
      createLogger({
        trace_id: UUID,
        account_id: UUID,
        conversation_id: UUID,
      }).info('e', 'm'),
    );
    expect(line.trace_id).toBe(UUID);
    expect(line.account_id).toBe(UUID);
    expect(line.conversation_id).toBe(UUID);
  });

  it('promotes context keys from attrs into the envelope unredacted', () => {
    const line = captureLine('info', () =>
      logger.info('e', 'm', { account_id: UUID, phone: '+355691234567' }),
    );
    expect(line.account_id).toBe(UUID);
    expect(line.phone).toBe('[REDACTED]');
  });

  it('lets attrs override the base context', () => {
    const other = '22222222-2222-4222-8222-222222222222';
    const line = captureLine('info', () =>
      createLogger({ account_id: UUID }).info('e', 'm', { account_id: other }),
    );
    expect(line.account_id).toBe(other);
  });

  it('never lets attrs overwrite the event_name/message/level envelope keys', () => {
    const line = captureLine('warn', () =>
      logger.warn('outbox.publish_failed', 'real message', {
        event_name: 'conversation.escalated',
        message: 'spoofed',
        level: 'info',
      }),
    );
    expect(line.event_name).toBe('outbox.publish_failed');
    expect(line.message).toBe('real message');
    expect(line.level).toBe('warn');
  });

  it('keeps phone_number_id (Meta asset id) unredacted', () => {
    const line = captureLine('warn', () =>
      logger.warn('e', 'm', { phone_number_id: '1049597368246135' }),
    );
    expect(line.phone_number_id).toBe('1049597368246135');
  });

  it('maps each level to the matching console fn', () => {
    const debug = vi.spyOn(console, 'log').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.debug('e', 'm');
    logger.info('e', 'm');
    logger.warn('e', 'm');
    logger.error('e', 'm');
    expect(debug).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });
});

describe('serializeError', () => {
  it('omits the stack unless debug is true', () => {
    const err = new Error('boom');
    expect(serializeError(err).stack).toBeUndefined();
    expect(serializeError(err, { debug: true }).stack).toEqual(
      expect.any(String),
    );
  });

  it('scrubs E.164 numbers from the message', () => {
    const out = serializeError(new TypeError('bad +355691234567'));
    expect(out.errorName).toBe('TypeError');
    expect(out.errorMessage).toBe('bad [REDACTED]');
  });

  it('uses typeof for non-Error values', () => {
    expect(serializeError('nope').errorName).toBe('string');
  });
});

describe('newTraceId', () => {
  it('returns a v4-shaped uuid', () => {
    expect(newTraceId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
