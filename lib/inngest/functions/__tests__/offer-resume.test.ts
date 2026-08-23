import { describe, expect, it } from 'vitest';
import { offerResumeAfterAccountInactivity } from '../offer-resume';

describe('offerResumeAfterAccountInactivity', () => {
  it('arms on both handoff events, not just the explicit toggle', () => {
    // An escalation disables the assistant exactly like a manual takeover, so it
    // must schedule the resume offer too — subscribing only to
    // `conversation.taken_over` left every escalated thread offline for good.
    // createFunction stores the triggers on `opts`, but omits them from its type.
    const { triggers } = offerResumeAfterAccountInactivity.opts as {
      triggers?: { event: string }[];
    };
    expect(triggers).toEqual([
      { event: 'conversation.taken_over' },
      { event: 'conversation.escalated' },
    ]);
  });
});
