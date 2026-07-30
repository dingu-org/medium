'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { pts } from '@/lib/db/schema';
import { instrumentedAction } from '@/lib/actions/instrument';
import { sanitizePromptField } from '@/lib/ai/prompt';
import { getPlan } from '@/lib/billing/plans';
import { loadEffectivePlan } from '@/lib/billing/read-model';
import { t } from '@/lib/i18n';
import { createServerClient } from '@/lib/supabase/server';
import type { SettingsState } from '../constants';

async function requirePtId(): Promise<string> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  return user.id;
}

async function setAssistantPausedImpl(paused: boolean): Promise<void> {
  const value = z.boolean().parse(paused);
  const ptId = await requirePtId();
  await db
    .update(pts)
    .set({ assistantPaused: value })
    .where(eq(pts.id, ptId));
  revalidatePath('/settings');
  revalidatePath('/settings/assistant');
}

export const setAssistantPaused = instrumentedAction(
  'settings.setAssistantPaused',
  setAssistantPausedImpl,
);

const emptyToUndefined = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

// All three fields are interpolated into the system prompt, so they are stripped
// of line breaks, control codes and the greeting fence marker before storage: a
// stored newline renders as its own authoritative context bullet, and a stored
// marker closes the fence the greeting is quoted inside (lib/ai/prompt.ts).
const promptSafe = (v: unknown) =>
  emptyToUndefined(typeof v === 'string' ? sanitizePromptField(v) : v);

const identitySchema = z.object({
  aiName: z.preprocess(promptSafe, z.string().max(60).optional()),
  aiGreeting: z.preprocess(promptSafe, z.string().max(1000).optional()),
  aiEscalationKeyword: z.preprocess(promptSafe, z.string().max(40).optional()),
});

async function updateAssistantIdentityImpl(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const ptId = await requirePtId();

  const parsed = identitySchema.safeParse({
    aiName: formData.get('aiName') ?? undefined,
    aiGreeting: formData.get('aiGreeting') ?? undefined,
    aiEscalationKeyword: formData.get('aiEscalationKeyword') ?? undefined,
  });
  if (!parsed.success) {
    return {
      error: null,
      success: false,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // Plan gate: custom name/greeting are Solo-only. The escalation keyword is
  // EXEMPT — safety routing is never plan-gated. Reject a name/greeting write on
  // Free with an upgrade prompt (the UI also locks those rows).
  const writesIdentity =
    formData.has('aiName') || formData.has('aiGreeting');
  if (writesIdentity) {
    const plan = await loadEffectivePlan(ptId);
    if (!getPlan(plan).customAssistantIdentity) {
      return { error: t.billing.gateIdentity, success: false, fieldErrors: null };
    }
  }

  // Partial-update: per-row sheets submit ONE field; absent fields stay
  // untouched, present-but-blank fields clear to null.
  await db
    .update(pts)
    .set({
      ...(formData.has('aiName') ? { aiName: parsed.data.aiName ?? null } : {}),
      ...(formData.has('aiGreeting')
        ? { aiGreeting: parsed.data.aiGreeting ?? null }
        : {}),
      ...(formData.has('aiEscalationKeyword')
        ? { aiEscalationKeyword: parsed.data.aiEscalationKeyword ?? null }
        : {}),
    })
    .where(eq(pts.id, ptId));

  revalidatePath('/settings');
  revalidatePath('/settings/assistant');
  return { error: null, success: true, fieldErrors: null };
}

export const updateAssistantIdentity = instrumentedAction(
  'settings.updateAssistantIdentity',
  updateAssistantIdentityImpl,
);
