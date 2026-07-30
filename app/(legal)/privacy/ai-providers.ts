/**
 * The AI providers disclosed in the privacy policy (and, in prose, in
 * docs/gdpr/subprocessors.md). Rendered by the policy page so the disclosure
 * has one source, and asserted against the plan model config in
 * `__tests__/ai-providers.test.ts` — a model change that introduces an
 * undisclosed upstream provider fails that test until this list and the DPA
 * annex are updated.
 */
export const DISCLOSED_AI_PROVIDERS = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
} as const;

export type DisclosedAiProvider = keyof typeof DISCLOSED_AI_PROVIDERS;

/** "Anthropic and OpenAI" — inline list for the policy prose. */
export function disclosedAiProviderNames(): string {
  const names = Object.values(DISCLOSED_AI_PROVIDERS);
  return names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** OpenRouter model ids are `provider/model`; the provider is the upstream. */
export function providerFromModelId(modelId: string): string {
  return modelId.split('/')[0];
}
