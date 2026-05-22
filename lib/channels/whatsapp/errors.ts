// Typed errors for the WhatsApp surface. Callers branch on the class, not on
// string matching, so failures map cleanly to HTTP status / UI states.

/** Non-2xx response from the Graph API. Carries Meta's error code/subcode. */
export class GraphApiError extends Error {
  readonly status: number;
  readonly code?: number;
  readonly subcode?: number;

  constructor(opts: { status: number; code?: number; subcode?: number; message: string }) {
    super(opts.message);
    this.name = 'GraphApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.subcode = opts.subcode;
  }

  /** 401/403 mean the PT's token is revoked/expired — triggers reconnect flow. */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/** Tried to send a free-form message after the 24h customer-service window closed. */
export class OutsideWindowError extends Error {
  constructor(message = 'Outside the 24h conversation window') {
    super(message);
    this.name = 'OutsideWindowError';
  }
}

/** Tried to send a template that Meta has not approved for this PT. */
export class TemplateNotApprovedError extends Error {
  readonly templateName: string;

  constructor(templateName: string) {
    super(`Template "${templateName}" is not approved`);
    this.name = 'TemplateNotApprovedError';
    this.templateName = templateName;
  }
}

/** The connection row is missing or its status is not 'active'. */
export class ConnectionRevokedError extends Error {
  constructor(message = 'WhatsApp connection is revoked or inactive') {
    super(message);
    this.name = 'ConnectionRevokedError';
  }
}

export type MetaSignupErrorKind =
  | 'duplicate_number'
  | 'token_exchange_failed'
  | 'rejected'
  | 'graph_error';

/** Failure during Embedded Signup callback handling. `kind` maps to HTTP status + UI copy. */
export class MetaSignupError extends Error {
  readonly kind: MetaSignupErrorKind;

  constructor(kind: MetaSignupErrorKind, message?: string) {
    super(message ?? kind);
    this.name = 'MetaSignupError';
    this.kind = kind;
  }
}
