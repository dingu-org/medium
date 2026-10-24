/** Where a service takes place (MED-118). The values are stored in the `service_mode` enum. */
export const SERVICE_MODES = ['at_business', 'at_client', 'online'] as const;

export type ServiceMode = (typeof SERVICE_MODES)[number];

export const isServiceMode = (v: unknown): v is ServiceMode =>
  typeof v === 'string' && (SERVICE_MODES as readonly string[]).includes(v);
