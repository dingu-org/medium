import { describe, expect, it } from 'vitest';
import { selectModel } from '../models';

describe('selectModel', () => {
  it('uses the override before environment-specific models', () => {
    expect(
      selectModel(
        {
          OPENROUTER_MODEL_OVERRIDE: 'custom/model',
          OPENROUTER_DEV_MODEL: 'dev/model',
          OPENROUTER_PROD_MODEL: 'prod/model',
        },
        'production',
      ),
    ).toBe('custom/model');
  });

  it('uses the production model in production', () => {
    expect(
      selectModel({ OPENROUTER_PROD_MODEL: 'prod/model' }, 'production'),
    ).toBe('prod/model');
  });

  it('uses the development model outside production', () => {
    expect(selectModel({ OPENROUTER_DEV_MODEL: 'dev/model' }, 'test')).toBe(
      'dev/model',
    );
  });

  it('throws instead of silently falling back when the selected variable is missing', () => {
    expect(() => selectModel({}, 'production')).toThrow(
      /OPENROUTER_PROD_MODEL is required/,
    );
    expect(() => selectModel({}, 'development')).toThrow(
      /OPENROUTER_DEV_MODEL is required/,
    );
  });
});
