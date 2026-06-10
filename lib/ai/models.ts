type ModelEnvironment = Readonly<Record<string, string | undefined>>;

export function selectModel(
  env: ModelEnvironment = process.env,
  nodeEnv: string | undefined = env.NODE_ENV,
): string {
  const override = env.OPENROUTER_MODEL_OVERRIDE?.trim();
  if (override) return override;

  const envName =
    nodeEnv === 'production' ? 'OPENROUTER_PROD_MODEL' : 'OPENROUTER_DEV_MODEL';
  const model = env[envName]?.trim();
  if (!model) {
    throw new Error(`${envName} is required`);
  }
  return model;
}
