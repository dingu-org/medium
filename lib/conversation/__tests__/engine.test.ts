import { describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import { ConversationEngineError } from '../errors';
import { runModelTurn } from '../engine';
import type {
  AppointmentMutationEffect,
  ToolExecutionContext,
  ToolName,
  ToolResult,
} from '@/lib/ai/tools';

type MockGenerateResult = Awaited<
  ReturnType<MockLanguageModelV3['doGenerate']>
>;

const usage = (input: number, output: number, cached = 0) => ({
  inputTokens: {
    total: input,
    noCache: input - cached,
    cacheRead: cached || undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: output, text: output, reasoning: undefined },
});

const textResult = (
  text: string,
  input = 10,
  output = 5,
  cost = 0.00001,
): MockGenerateResult => ({
  content: [{ type: 'text' as const, text }],
  finishReason: { unified: 'stop' as const, raw: undefined },
  usage: usage(input, output),
  warnings: [],
  providerMetadata: {
    openrouter: {
      provider: 'Azure',
      usage: { cost },
    },
  },
});

const toolCallResult = (
  toolCallId: string,
  toolName: string,
  input: unknown,
): MockGenerateResult => toolStepResult([{ toolCallId, toolName, input }]);

const toolStepResult = (
  calls: { toolCallId: string; toolName: string; input: unknown }[],
  text?: string,
): MockGenerateResult => ({
  content: [
    ...(text ? [{ type: 'text' as const, text }] : []),
    ...calls.map((call) => ({
      type: 'tool-call' as const,
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      input: JSON.stringify(call.input),
    })),
  ],
  finishReason: { unified: 'tool-calls' as const, raw: undefined },
  usage: usage(8, 2),
  warnings: [],
});

const bookingCall = {
  toolCallId: 'book-1',
  toolName: 'book_appointment',
  input: {
    starts_at: '2026-06-12T10:00:00+02:00',
    service_type: 'Vlerësim i parë',
  },
};

const bookedEffect: AppointmentMutationEffect = {
  kind: 'booked',
  appointmentId: '99999999-8888-4777-a666-555555555555',
  startsAt: '2026-06-12T08:00:00.000Z',
  serviceType: 'Vlerësim i parë',
};

function sequence(...results: MockGenerateResult[]) {
  let index = 0;
  return async () => results[index++] ?? results.at(-1)!;
}

const toolContext: ToolExecutionContext = {
  accountId: '11111111-2222-3333-4444-555555555555',
  customerId: '66666666-7777-4888-9999-000000000000',
  conversationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
};

describe('runModelTurn', () => {
  it('runs availability then booking and returns summed usage metadata', async () => {
    const model = new MockLanguageModelV3({
      provider: 'openrouter',
      modelId: 'test-model',
      doGenerate: sequence(
        toolCallResult('call-1', 'get_availability', {
          start: '2026-06-11T09:00:00+02:00',
          end: '2026-06-14T17:00:00+02:00',
        }),
        toolCallResult('call-2', 'book_appointment', {
          starts_at: '2026-06-12T10:00:00+02:00',
          service_type: 'Initial consultation',
        }),
        textResult('Your appointment is confirmed.', 12, 6, 0.000012),
      ),
    });

    const calls: ToolName[] = [];
    const dispatch = vi.fn(async (toolName: ToolName): Promise<ToolResult> => {
      calls.push(toolName);
      return { ok: true, data: { accepted: true } };
    });

    const result = await runModelTurn({
      model,
      system: 'system',
      messages: [{ role: 'user', content: 'Book next week' }],
      toolContext,
      dispatch,
    });

    expect(calls).toEqual(['get_availability', 'book_appointment']);
    expect(result).toEqual({
      outcome: 'response',
      text: 'Your appointment is confirmed.',
      tokensIn: 28,
      tokensOut: 10,
      cachedTokens: 0,
      provider: 'Azure',
      costMicrousd: 12,
    });
    expect(model.doGenerateCalls).toHaveLength(3);
    expect(model.doGenerateCalls[0]).toMatchObject({
      maxOutputTokens: 500,
      temperature: 0.2,
    });
  });

  it('feeds a dispatcher validation error back to the model for recovery', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: sequence(
        toolCallResult('call-1', 'book_appointment', {
          starts_at: 'not-a-date',
          service_type: '',
        }),
        textResult('What date and service would you prefer?'),
      ),
    });

    const result = await runModelTurn({
      model,
      system: 'system',
      messages: [{ role: 'user', content: 'Book me' }],
      toolContext,
    });

    expect(result).toMatchObject({
      outcome: 'response',
      text: 'What date and service would you prefer?',
    });
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(JSON.stringify(model.doGenerateCalls[1].prompt)).toContain(
      'invalid_input',
    );
  });

  // Only a FAILED mutation can reach a handoff now: a successful booking stops
  // the loop and speaks for itself, and a successful escalation stops it and
  // sends the escalation sentence. What is left is an attempt that went wrong
  // and then went speechless — real state may or may not have moved, and the
  // engine cannot tell, so a person gets it.
  it('requests a handoff when a mutation is followed by an empty response', async () => {
    const model = new MockLanguageModelV3({
      provider: 'openrouter',
      modelId: 'test-model',
      doGenerate: sequence(
        toolStepResult([bookingCall]),
        textResult('', 12, 6, 0.000012),
      ),
    });
    const dispatch = async (): Promise<ToolResult> => ({
      ok: false,
      error: {
        code: 'conflict',
        message: 'Slot is no longer available',
        retryable: false,
      },
    });

    const result = await runModelTurn({
      model,
      system: 'system',
      messages: [{ role: 'user', content: 'I want to talk to a person' }],
      toolContext,
      dispatch,
    });

    expect(result).toEqual({
      outcome: 'handoff_required',
      reason: 'empty_response',
      tokensIn: 20,
      tokensOut: 8,
      cachedTokens: 0,
      provider: 'Azure',
      costMicrousd: 12,
    });
  });

  it('requests a handoff when the step limit follows a mutation attempt', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: sequence(
        toolStepResult([bookingCall]),
        ...Array.from({ length: 4 }, (_, index) =>
          toolCallResult(`call-${index + 2}`, 'list_upcoming_appointments', {}),
        ),
      ),
    });
    const dispatch = async (toolName: ToolName): Promise<ToolResult> =>
      toolName === 'book_appointment'
        ? {
            ok: false,
            error: {
              code: 'conflict',
              message: 'Slot is no longer available',
              retryable: false,
            },
          }
        : { ok: true, data: { appointments: [] } };

    const result = await runModelTurn({
      model,
      system: 'system',
      messages: [{ role: 'user', content: 'I want to talk to a person' }],
      toolContext,
      dispatch,
    });

    expect(result).toMatchObject({
      outcome: 'handoff_required',
      reason: 'step_limit_reached',
      tokensIn: 40,
      tokensOut: 10,
    });
  });

  it('stops the loop as soon as a booking commits', async () => {
    const model = new MockLanguageModelV3({
      provider: 'openrouter',
      modelId: 'test-model',
      doGenerate: sequence(
        toolStepResult([bookingCall]),
        textResult('Your appointment is confirmed.'),
      ),
    });
    const dispatch = async (): Promise<ToolResult> => ({
      ok: true,
      data: { appointment_id: bookedEffect.appointmentId },
      effect: bookedEffect,
    });

    const result = await runModelTurn({
      model,
      system: 'system',
      messages: [{ role: 'user', content: 'Book that time' }],
      toolContext,
      dispatch,
    });

    expect(result).toMatchObject({
      outcome: 'appointment_mutation',
      effect: bookedEffect,
    });
    // The saved round: the model is never asked to write the confirmation.
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  // Discarding the model's own words is the contract, not an accident: the
  // customer gets one message per change and it is the deterministic one.
  it('prefers the deterministic outcome over prose written beside the tool call', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: sequence(
        toolStepResult([bookingCall], 'E rezervova për të hënën në 9.'),
      ),
    });
    const dispatch = async (): Promise<ToolResult> => ({
      ok: true,
      data: { appointment_id: bookedEffect.appointmentId },
      effect: bookedEffect,
    });

    const result = await runModelTurn({
      model,
      system: 'system',
      messages: [{ role: 'user', content: 'Book that time' }],
      toolContext,
      dispatch,
    });

    expect(result.outcome).toBe('appointment_mutation');
    expect(result).not.toHaveProperty('text');
  });

  it('keeps looping when the mutation came back as an error', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: sequence(
        toolStepResult([bookingCall]),
        textResult('That slot has just gone — would 10:00 work?'),
      ),
    });
    const dispatch = async (): Promise<ToolResult> => ({
      ok: false,
      error: {
        code: 'conflict',
        message: 'Slot is no longer available',
        retryable: false,
      },
    });

    const result = await runModelTurn({
      model,
      system: 'system',
      messages: [{ role: 'user', content: 'Book that time' }],
      toolContext,
      dispatch,
    });

    expect(result).toMatchObject({
      outcome: 'response',
      text: 'That slot has just gone — would 10:00 work?',
    });
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  // Inverted 2026-08-30. A handed-over conversation has one fixed sentence left
  // to send (`escalationMessage`), so asking the model for another round could
  // only produce prose the engine would discard — and it used to produce exactly
  // that: free-form wording on the one path where the words matter most.
  it('stops the loop after escalate_to_human', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: sequence(
        toolCallResult('call-1', 'escalate_to_human', {
          reason: 'Customer asked for the therapist.',
        }),
        textResult('This round is never requested.'),
      ),
    });
    const dispatch = async (): Promise<ToolResult> => ({
      ok: true,
      data: { escalated: true },
    });

    const result = await runModelTurn({
      model,
      system: 'system',
      messages: [{ role: 'user', content: 'I want to talk to a person' }],
      toolContext,
      dispatch,
    });

    expect(result).toMatchObject({ outcome: 'escalation' });
    // The engine writes the sentence, so nothing the model said is carried.
    expect(result).not.toHaveProperty('text');
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  // Nothing was handed over, so there is nothing to confirm: the turn has to
  // carry on and answer the customer in the model's own words. Same shape as the
  // failed offer below, and the reason `escalatedToHuman` reads the tool
  // *result* rather than the call.
  it('keeps looping when the escalation call came back as an error', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: sequence(
        toolCallResult('call-1', 'escalate_to_human', { reason: '' }),
        textResult('Po e shikoj se si mund t’ju ndihmoj.'),
      ),
    });
    const dispatch = async (): Promise<ToolResult> => ({
      ok: false,
      error: {
        code: 'not_found',
        message: 'Conversation not found',
        retryable: false,
      },
    });

    const result = await runModelTurn({
      model,
      system: 'system',
      messages: [{ role: 'user', content: 'I want to talk to a person' }],
      toolContext,
      dispatch,
    });

    expect(result).toMatchObject({
      outcome: 'response',
      text: 'Po e shikoj se si mund t’ju ndihmoj.',
    });
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  // The offer's wording is fixed, so the model is never asked for a second
  // round — the same saving the booking confirmation makes.
  it('stops the loop as soon as the model offers a handoff', async () => {
    const model = new MockLanguageModelV3({
      provider: 'openrouter',
      modelId: 'test-model',
      doGenerate: sequence(
        toolStepResult(
          [
            {
              toolCallId: 'offer-1',
              toolName: 'offer_human_handoff',
              input: { reason: 'Customer asked where to park.' },
            },
          ],
          'Nuk e di ku mund të parkoni.',
        ),
        textResult('This round is never requested.'),
      ),
    });
    const dispatch = async (): Promise<ToolResult> => ({
      ok: true,
      data: { offered: true },
    });

    const result = await runModelTurn({
      model,
      system: 'system',
      messages: [{ role: 'user', content: 'Ku mund të parkoj?' }],
      toolContext,
      dispatch,
    });

    expect(result).toMatchObject({ outcome: 'handoff_offer' });
    // The prose beside the tool call is discarded, not sent with the offer.
    expect(result).not.toHaveProperty('text');
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  // Nothing was offered, so there is nothing to remember and nothing to send:
  // the turn has to carry on and answer the customer in the model's own words.
  it('keeps looping when the offer call came back as an error', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: sequence(
        toolCallResult('offer-1', 'offer_human_handoff', { reason: '' }),
        textResult('Mund t’ju ndihmoj me takimet.'),
      ),
    });

    const result = await runModelTurn({
      model,
      system: 'system',
      messages: [{ role: 'user', content: 'Ku mund të parkoj?' }],
      toolContext,
    });

    expect(result).toMatchObject({
      outcome: 'response',
      text: 'Mund t’ju ndihmoj me takimet.',
    });
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  // A committed change outranks an offer to answer something else: the customer
  // gets the confirmation for what actually happened.
  it('prefers a committed booking over an offer made in the same step', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: sequence(
        toolStepResult([
          bookingCall,
          {
            toolCallId: 'offer-1',
            toolName: 'offer_human_handoff',
            input: { reason: 'Customer also asked about parking.' },
          },
        ]),
      ),
    });
    const dispatch = async (toolName: ToolName): Promise<ToolResult> =>
      toolName === 'book_appointment'
        ? { ok: true, data: {}, effect: bookedEffect }
        : { ok: true, data: { offered: true } };

    const result = await runModelTurn({
      model,
      system: 'system',
      messages: [{ role: 'user', content: 'Po, atë orar' }],
      toolContext,
      dispatch,
    });

    expect(result).toMatchObject({
      outcome: 'appointment_mutation',
      effect: bookedEffect,
    });
  });

  /**
   * A step that books and escalates has done both, and the customer must not
   * lose the booking: the escalation reaches them through the person who now
   * owns the thread, but nothing else will ever tell them the appointment
   * exists. Pins the branch order in `runModelTurn` — mutation, then escalation,
   * then offer.
   */
  it('prefers a committed booking over an escalation in the same step', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: sequence(
        toolStepResult([
          bookingCall,
          {
            toolCallId: 'escalate-1',
            toolName: 'escalate_to_human',
            input: { reason: 'Customer also asked to speak to someone.' },
          },
        ]),
      ),
    });
    const dispatch = async (toolName: ToolName): Promise<ToolResult> =>
      toolName === 'book_appointment'
        ? { ok: true, data: {}, effect: bookedEffect }
        : { ok: true, data: { escalated: true } };

    const result = await runModelTurn({
      model,
      system: 'system',
      messages: [{ role: 'user', content: 'Po, atë orar — dhe dua të flas me dikë' }],
      toolContext,
      dispatch,
    });

    expect(result).toMatchObject({
      outcome: 'appointment_mutation',
      effect: bookedEffect,
    });
  });

  it('reports the last effect when one step commits two changes', async () => {
    const cancelledEffect: AppointmentMutationEffect = {
      kind: 'cancelled',
      appointmentId: '11111111-2222-4333-8444-555555555555',
      startsAt: '2026-06-15T08:00:00.000Z',
      serviceType: 'Terapi',
    };
    const model = new MockLanguageModelV3({
      doGenerate: sequence(
        toolStepResult([
          bookingCall,
          {
            toolCallId: 'cancel-1',
            toolName: 'cancel_appointment',
            input: { appointment_id: cancelledEffect.appointmentId },
          },
        ]),
      ),
    });
    const dispatch = async (toolName: ToolName): Promise<ToolResult> =>
      toolName === 'book_appointment'
        ? { ok: true, data: {}, effect: bookedEffect }
        : { ok: true, data: {}, effect: cancelledEffect };

    const result = await runModelTurn({
      model,
      system: 'system',
      messages: [{ role: 'user', content: 'Move me to Monday' }],
      toolContext,
      dispatch,
    });

    // Only one change is announced; the warning log is what surfaces the other.
    expect(result).toMatchObject({
      outcome: 'appointment_mutation',
      effect: cancelledEffect,
    });
  });

  it('keeps an empty read-only turn retryable', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: textResult(''),
    });

    await expect(
      runModelTurn({
        model,
        system: 'system',
        messages: [{ role: 'user', content: 'What times are available?' }],
        toolContext,
      }),
    ).rejects.toMatchObject({
      code: 'empty_response',
    } satisfies Partial<ConversationEngineError>);
  });

  it('fails clearly when the model consumes all five steps without final text', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: sequence(
        ...Array.from({ length: 5 }, (_, index) =>
          toolCallResult(`call-${index}`, 'list_upcoming_appointments', {}),
        ),
      ),
    });
    const dispatch = async (): Promise<ToolResult> => ({
      ok: true,
      data: { appointments: [] },
    });

    await expect(
      runModelTurn({
        model,
        system: 'system',
        messages: [{ role: 'user', content: 'Cancel my appointment' }],
        toolContext,
        dispatch,
      }),
    ).rejects.toMatchObject({
      code: 'step_limit_reached',
    } satisfies Partial<ConversationEngineError>);
    expect(model.doGenerateCalls).toHaveLength(5);
  });
});
