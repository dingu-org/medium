import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { functions } from '@/lib/inngest/functions';

export const runtime = 'nodejs';

// Every Inngest step body runs inside one request to this route, so the step's
// budget is this route's function duration. The heaviest step is the AI turn
// (multi-round OpenRouter tool calling): left implicit it inherits whatever the
// deployment default happens to be — 10s on a non-fluid Vercel function, which
// would time the turn out into the failure handoff. 60s is the ceiling every
// plan allows; raise it (up to 300) once fluid compute is confirmed on.
export const maxDuration = 60;

export const { GET, POST, PUT } = serve({ client: inngest, functions });
