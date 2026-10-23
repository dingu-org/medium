import { describe, expect, it } from 'vitest';
import { BUSINESS_TYPES } from '../../business-types';
import {
  assistantConfigFor,
  GENERAL_ASSISTANT_CONFIG,
  type AssistantConfig,
} from '../assistant-config';
import { buildSystemPrompt } from '../prompt';

const base = {
  name: 'Studio Elira',
  timezone: 'Europe/Tirane',
  aiName: null,
  aiGreeting: null,
  title: 'Manikyriste',
  address: null,
  retentionDays: 90,
  now: new Date('2026-06-10T10:00:00.000Z'),
};

describe('assistantConfigFor', () => {
  it('resolves every type and no type to the general configuration', () => {
    expect(assistantConfigFor(null)).toBe(GENERAL_ASSISTANT_CONFIG);
    for (const type of BUSINESS_TYPES) {
      expect(assistantConfigFor(type)).toBe(GENERAL_ASSISTANT_CONFIG);
    }
  });

  it('leaves the system prompt byte-identical for every type and for null', () => {
    const plain = buildSystemPrompt(base);
    for (const type of [null, ...BUSINESS_TYPES]) {
      expect(
        buildSystemPrompt({
          ...base,
          assistantConfig: assistantConfigFor(type),
        }),
      ).toBe(plain);
    }
  });

  it('places a type prompt section before the practice context', () => {
    const config: AssistantConfig = {
      id: 'dentist',
      promptSection: 'SECTION-X',
    };
    const prompt = buildSystemPrompt({ ...base, assistantConfig: config });
    const at = prompt.indexOf('SECTION-X');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(prompt.indexOf('## Practice context'));
  });
});
