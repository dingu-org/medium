import { describe, expect, it } from 'vitest';
import {
  META_SIGNUP_ORIGINS,
  classifySignupRefusal,
  describeSignupMessage,
  hasMetaError,
  postableMode,
  readSignupMessage,
} from '../whatsapp-signup';

// The `message` listener in connect-whatsapp.tsx is a one-line delegate to
// `readSignupMessage`, and its POST site a one-line delegate to `postableMode`.
// Meta's Embedded Signup popup posts one message per step; the only ones we act
// on are the FINISH* notices, whose event name is what tells us which mode the
// PT actually onboarded in (Embedded Signup v4). See
// docs/whatsapp/embedded-signup-v4-setup.md for the sourced event table.

const ORIGIN = 'https://www.facebook.com';

function message(
  payload: unknown,
  origin = ORIGIN,
): { origin: string; data: unknown } {
  return { origin, data: JSON.stringify(payload) };
}

function finish(event: string, data: Record<string, unknown>) {
  return message({ type: 'WA_EMBEDDED_SIGNUP', event, data });
}

describe('readSignupMessage — origin check', () => {
  it('accepts every origin Meta is expected to post from', () => {
    for (const origin of META_SIGNUP_ORIGINS) {
      const parsed = readSignupMessage({
        origin,
        data: JSON.stringify({
          type: 'WA_EMBEDDED_SIGNUP',
          event: 'FINISH',
          data: { phone_number_id: 'PNI_1', waba_id: 'WABA_1' },
        }),
      });
      expect(parsed, origin).toEqual({
        kind: 'finish',
        session: {
          event: 'FINISH',
          phoneNumberId: 'PNI_1',
          wabaId: 'WABA_1',
        },
      });
    }
  });

  it.each([
    'https://evilfacebook.com',
    'https://notfacebook.com',
    'https://www.facebook.com.evil.test',
    'http://www.facebook.com',
    'https://facebook.com.attacker.io',
  ])('refuses the lookalike origin %s', (origin) => {
    // The same payload from a real Meta origin is accepted (test above), so the
    // origin is the only thing rejecting it — there is no other integrity check
    // on these IDs.
    expect(
      readSignupMessage({
        origin,
        data: JSON.stringify({
          type: 'WA_EMBEDDED_SIGNUP',
          event: 'FINISH',
          data: { phone_number_id: 'FORGED_PNI', waba_id: 'FORGED_WABA' },
        }),
      }),
    ).toBeNull();
  });
});

describe('readSignupMessage — payload shape', () => {
  it('ignores non-JSON messages', () => {
    expect(
      readSignupMessage({ origin: ORIGIN, data: 'not json {' }),
    ).toBeNull();
  });

  it('ignores messages that are not Embedded Signup', () => {
    expect(
      readSignupMessage(message({ type: 'SOMETHING_ELSE', event: 'FINISH' })),
    ).toBeNull();
  });

  it('accepts an already-parsed object payload', () => {
    expect(
      readSignupMessage({
        origin: ORIGIN,
        data: {
          type: 'WA_EMBEDDED_SIGNUP',
          event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
          data: { waba_id: 'WABA_1' },
        },
      }),
    ).toEqual({
      kind: 'finish',
      session: {
        event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
        phoneNumberId: undefined,
        wabaId: 'WABA_1',
      },
    });
  });

  it('ignores events that are neither a finish nor a cancel', () => {
    expect(readSignupMessage(finish('ERROR', {}))).toBeNull();
    expect(readSignupMessage(finish('PHONE_NUMBER_ADDED', {}))).toBeNull();
  });

  it('keeps the event name so the POST site can derive the mode', () => {
    expect(
      readSignupMessage(finish('FINISH_ONLY_WABA', { waba_id: 'WABA_1' })),
    ).toEqual({
      kind: 'finish',
      session: {
        event: 'FINISH_ONLY_WABA',
        phoneNumberId: undefined,
        wabaId: 'WABA_1',
      },
    });
  });
});

describe('readSignupMessage — CANCEL', () => {
  it("returns Meta's step, error and session id", () => {
    expect(
      readSignupMessage(
        finish('CANCEL', {
          current_step: 'PHONE_NUMBER_SETUP',
          error_message: 'Business is not eligible',
          error_code: 524126,
          session_id: 'SESSION_1',
        }),
      ),
    ).toEqual({
      kind: 'cancel',
      cancel: {
        currentStep: 'PHONE_NUMBER_SETUP',
        errorId: '524126',
        errorMessage: 'Business is not eligible',
        sessionId: 'SESSION_1',
      },
    });
  });

  it('prefers error_id over error_code when a payload carries both', () => {
    const parsed = readSignupMessage(
      finish('CANCEL', { error_id: 'ID_1', error_code: 'CODE_1' }),
    );
    expect(parsed).toMatchObject({ cancel: { errorId: 'ID_1' } });
  });

  it('returns only the fields the payload carried', () => {
    const parsed = readSignupMessage(
      finish('CANCEL', { current_step: 'PHONE_NUMBER_VERIFICATION' }),
    );
    expect(parsed).toEqual({
      kind: 'cancel',
      cancel: {
        currentStep: 'PHONE_NUMBER_VERIFICATION',
        errorId: undefined,
        errorMessage: undefined,
        sessionId: undefined,
      },
    });
  });

  it('accepts a CANCEL with no data at all', () => {
    const noData = readSignupMessage(
      message({ type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL' }),
    );
    expect(noData).toEqual({
      kind: 'cancel',
      cancel: {
        currentStep: undefined,
        errorId: undefined,
        errorMessage: undefined,
        sessionId: undefined,
      },
    });
    expect(readSignupMessage(finish('CANCEL', {}))).toEqual(noData);
  });

  it('clips long free text', () => {
    const parsed = readSignupMessage(
      finish('CANCEL', {
        error_message: 'x'.repeat(500),
        session_id: 's'.repeat(500),
      }),
    );
    expect(
      parsed?.kind === 'cancel' && parsed.cancel.errorMessage,
    ).toHaveLength(200);
    expect(parsed?.kind === 'cancel' && parsed.cancel.sessionId).toHaveLength(
      200,
    );
  });

  it('refuses a CANCEL from a lookalike origin', () => {
    expect(
      readSignupMessage(
        message(
          {
            type: 'WA_EMBEDDED_SIGNUP',
            event: 'CANCEL',
            data: { error_message: 'forged' },
          },
          'https://evilfacebook.com',
        ),
      ),
    ).toBeNull();
  });
});

describe('hasMetaError', () => {
  it('is true when Meta reported an error id or message', () => {
    expect(hasMetaError({ errorId: '524126' })).toBe(true);
    expect(hasMetaError({ errorMessage: 'Not eligible' })).toBe(true);
  });

  it('is false for an owner who only closed the popup on a step', () => {
    expect(hasMetaError({ currentStep: 'PHONE_NUMBER_SETUP' })).toBe(false);
    expect(hasMetaError({ sessionId: 'SESSION_1' })).toBe(false);
    expect(hasMetaError({})).toBe(false);
  });
});

describe('postableMode — one row per v4 finish event', () => {
  it('FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING is coexistence, number optional', () => {
    // Meta's documented coexistence payload carries only waba_id; the server
    // resolves the number from GET /<waba_id>/phone_numbers.
    expect(
      postableMode({
        event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
        wabaId: 'W',
      }),
    ).toBe('coexistence');
    expect(
      postableMode({
        event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
        wabaId: 'W',
        phoneNumberId: 'P',
      }),
    ).toBe('coexistence');
  });

  it('FINISH is cloud_api, and is refused without a number', () => {
    expect(
      postableMode({ event: 'FINISH', wabaId: 'W', phoneNumberId: 'P' }),
    ).toBe('cloud_api');
    expect(postableMode({ event: 'FINISH', wabaId: 'W' })).toBeNull();
  });

  it('FINISH_ONLY_WABA is refused — it shares no phone number', () => {
    expect(postableMode({ event: 'FINISH_ONLY_WABA', wabaId: 'W' })).toBeNull();
  });

  it.each(['FINISH_OBO_MIGRATION', 'FINISH_GRANT_ONLY_API_ACCESS'])(
    'refuses the unsupported event %s',
    (event) => {
      expect(
        postableMode({ event, wabaId: 'W', phoneNumberId: 'P' }),
      ).toBeNull();
    },
  );

  it('refuses a session with no event at all', () => {
    expect(postableMode({})).toBeNull();
    expect(postableMode({ wabaId: 'W', phoneNumberId: 'P' })).toBeNull();
  });

  it('refuses any event without a waba_id', () => {
    expect(postableMode({ event: 'FINISH', phoneNumberId: 'P' })).toBeNull();
    expect(
      postableMode({ event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' }),
    ).toBeNull();
  });
});

// Diagnostics: the trail the client reports for an attempt. These are wider
// than readSignupMessage on purpose — the messages it drops are the evidence.
describe('describeSignupMessage', () => {
  it('reduces a finish message to flags, never the ids themselves', () => {
    const summary = describeSignupMessage(
      finish('FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', {
        phone_number_id: 'PNI_1',
        waba_id: 'WABA_1',
      }),
    );
    expect(summary).toEqual({
      origin: ORIGIN,
      originAccepted: true,
      type: 'WA_EMBEDDED_SIGNUP',
      event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
      hasNumberId: true,
      hasWabaId: true,
      currentStep: undefined,
      errorId: undefined,
      errorMessage: undefined,
      sessionId: undefined,
    });
    expect(JSON.stringify(summary)).not.toContain('PNI_1');
    expect(JSON.stringify(summary)).not.toContain('WABA_1');
  });

  it("keeps the CANCEL step and Meta's session id", () => {
    const cancel = finish('CANCEL', {
      current_step: 'PHONE_NUMBER_SETUP',
      session_id: 'SESSION_1',
    });
    expect(describeSignupMessage(cancel)).toMatchObject({
      event: 'CANCEL',
      currentStep: 'PHONE_NUMBER_SETUP',
      sessionId: 'SESSION_1',
      hasWabaId: false,
    });
  });

  it('reads the cancel fields exactly as readSignupMessage does', () => {
    const cancel = finish('CANCEL', {
      current_step: 'PHONE_NUMBER_SETUP',
      error_code: 524126,
      error_message: 'Not eligible',
      session_id: 'SESSION_1',
    });
    const parsed = readSignupMessage(cancel);
    expect(parsed?.kind).toBe('cancel');
    expect(describeSignupMessage(cancel)).toMatchObject(
      parsed?.kind === 'cancel' ? parsed.cancel : {},
    );
  });

  it("keeps Meta's error id and a clipped error message", () => {
    const summary = describeSignupMessage(
      finish('CANCEL', {
        error_id: 524126,
        error_message: 'x'.repeat(500),
      }),
    );
    expect(summary?.errorId).toBe('524126');
    expect(summary?.errorMessage).toHaveLength(200);
  });

  it('records a signup message from a refused origin as refused', () => {
    const payload = {
      type: 'WA_EMBEDDED_SIGNUP',
      event: 'FINISH',
      data: { phone_number_id: 'PNI_1', waba_id: 'WABA_1' },
    };
    const lookalike = message(payload, 'https://m.facebook.com');
    expect(readSignupMessage(lookalike)).toBeNull();
    expect(describeSignupMessage(lookalike)).toMatchObject({
      origin: 'https://m.facebook.com',
      originAccepted: false,
      event: 'FINISH',
    });
  });

  it('accepts an already-parsed object payload', () => {
    expect(
      describeSignupMessage({
        origin: ORIGIN,
        data: { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: {} },
      }),
    ).toMatchObject({ event: 'FINISH', hasNumberId: false });
  });

  it('ignores everything that is not a signup payload', () => {
    expect(
      describeSignupMessage({ origin: ORIGIN, data: 'not json' }),
    ).toBeNull();
    expect(describeSignupMessage({ origin: ORIGIN, data: null })).toBeNull();
    expect(describeSignupMessage(message({ type: 'OTHER' }))).toBeNull();
  });
});

describe('classifySignupRefusal', () => {
  const coexistence = {
    event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
    wabaId: 'WABA_1',
  };
  const refusal = (
    session: Parameters<typeof classifySignupRefusal>[0]['session'],
    over: { cancelled?: boolean; hasCode?: boolean } = {},
  ) =>
    classifySignupRefusal({
      cancelled: false,
      hasCode: true,
      session,
      ...over,
    });

  it('names each reason a popup result cannot be posted', () => {
    expect(refusal(coexistence, { cancelled: true })).toBe('cancelled_by_user');
    expect(refusal(coexistence, { hasCode: false })).toBe('no_code');
    expect(refusal({})).toBe('no_finish_message');
    expect(refusal({ event: 'FINISH_OBO_MIGRATION', wabaId: 'W' })).toBe(
      'unsupported_event',
    );
    expect(refusal({ event: 'FINISH' })).toBe('missing_waba');
    expect(refusal({ event: 'FINISH', wabaId: 'W' })).toBe('missing_number');
    expect(refusal({ event: 'FINISH_ONLY_WABA', wabaId: 'W' })).toBe(
      'missing_number',
    );
  });

  it('agrees with postableMode: null exactly when a mode is postable', () => {
    const sessions = [
      {},
      coexistence,
      { event: 'FINISH' },
      { event: 'FINISH', wabaId: 'W' },
      { event: 'FINISH', wabaId: 'W', phoneNumberId: 'P' },
      { event: 'FINISH_ONLY_WABA', wabaId: 'W' },
      { event: 'FINISH_GRANT_ONLY_API_ACCESS', wabaId: 'W' },
    ];
    for (const session of sessions) {
      expect(refusal(session) === null, JSON.stringify(session)).toBe(
        postableMode(session) !== null,
      );
    }
  });
});
