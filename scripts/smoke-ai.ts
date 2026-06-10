import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import { getOpenRouterModel } from '@/lib/ai/client';
import { selectModel } from '@/lib/ai/models';

async function main() {
  const modelId = selectModel(
    { ...process.env, OPENROUTER_MODEL_OVERRIDE: '' },
    'development',
  );
  if (!modelId.endsWith(':free')) {
    throw new Error(
      `Refusing live smoke against non-free development model: ${modelId}`,
    );
  }

  const result = await generateText({
    model: getOpenRouterModel(modelId),
    system:
      'This is a synthetic provider smoke test. Always call get_availability once, then briefly summarize the returned slot.',
    prompt:
      'Find one synthetic appointment slot between June 15 and June 16, 2026.',
    tools: {
      get_availability: tool({
        description: 'Return synthetic appointment availability.',
        inputSchema: z.object({
          start: z.iso.datetime({ offset: true }),
          end: z.iso.datetime({ offset: true }),
        }),
        execute: async () => ({
          slots: [
            {
              starts_at: '2026-06-15T10:00:00+02:00',
              ends_at: '2026-06-15T11:00:00+02:00',
            },
          ],
        }),
      }),
    },
    stopWhen: stepCountIs(3),
    temperature: 0,
    maxOutputTokens: 120,
    maxRetries: 0,
    timeout: 30_000,
  });

  const toolCalls = result.steps.flatMap((step) => step.toolCalls);
  if (!toolCalls.some((call) => call.toolName === 'get_availability')) {
    throw new Error('Live smoke failed: model did not call get_availability');
  }
  if (!result.text.trim()) {
    throw new Error('Live smoke failed: model returned no final text');
  }

  console.log(
    JSON.stringify({
      ok: true,
      model: modelId,
      provider: result.providerMetadata?.openrouter?.provider ?? 'unknown',
      toolCalls: toolCalls.map((call) => call.toolName),
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
