export type ConversationEngineErrorCode =
  | 'conversation_not_found'
  | 'conversation_inactive'
  | 'empty_response'
  | 'step_limit_reached'
  | 'assistant_paused';

export class ConversationEngineError extends Error {
  constructor(
    public readonly code: ConversationEngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ConversationEngineError';
  }
}
