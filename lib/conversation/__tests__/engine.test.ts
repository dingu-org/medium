import { describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import { ConversationEngineError } from '../errors';
import { runModelTurn } from '../engine';
import type {
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
): MockGenerateResult => ({
  content: [
    {
      type: 'tool-call' as const,
      toolCallId,
      toolName,
      input: JSON.stringify(input),
    },
  ],
  finishReason: { unified: 'tool-calls' as const, raw: undefined },
  usage: usage(8, 2),
  warnings: [],
});

function sequence(...results: MockGenerateResult[]) {
  let index = 0;
  return async () => results[index++] ?? results.at(-1)!;
}

const toolContext: ToolExecutionContext = {
  ptId: '11111111-2222-3333-4444-555555555555',
  patientId: '66666666-7777-4888-9999-000000000000',
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

  it('requests a handoff when a mutation is followed by an empty response', async () => {
    const model = new MockLanguageModelV3({
      provider: 'openrouter',
      modelId: 'test-model',
      doGenerate: sequence(
        toolCallResult('call-1', 'book_appointment', {
          starts_at: '2026-06-12T10:00:00+02:00',
          service_type: 'Initial consultation',
        }),
        textResult('', 12, 6, 0.000012),
      ),
    });
    const dispatch = async (): Promise<ToolResult> => ({
      ok: true,
      data: { appointment_id: 'appointment-1' },
    });

    const result = await runModelTurn({
      model,
      system: 'system',
      messages: [{ role: 'user', content: 'Book that time' }],
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
        toolCallResult('call-1', 'book_appointment', {
          starts_at: '2026-06-12T10:00:00+02:00',
          service_type: 'Initial consultation',
        }),
        ...Array.from({ length: 4 }, (_, index) =>
          toolCallResult(`call-${index + 2}`, 'list_upcoming_appointments', {}),
        ),
      ),
    });
    const dispatch = async (): Promise<ToolResult> => ({
      ok: true,
      data: { accepted: true },
    });

    const result = await runModelTurn({
      model,
      system: 'system',
      messages: [{ role: 'user', content: 'Book that time' }],
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
