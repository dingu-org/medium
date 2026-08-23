import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { messageTemplates, accounts, whatsappConnections } from '@/lib/db/schema';
import {
  FALLBACK_REMINDER_TEMPLATE,
  REMINDER_TEMPLATE,
} from '@/lib/inngest/functions/bootstrap-wa-connection';
import { createServiceClient } from '@/lib/supabase/service';
import { getSettingsSnapshot } from '../read-models';

let accountId = '';
let freshAccountId = '';

async function makeUser(stamp: string): Promise<string> {
  const sb = createServiceClient();
  const { data, error } = await sb.auth.admin.createUser({
    email: `settings-snapshot-${stamp}@example.com`,
    password: 'settings-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  return data.user.id;
}

beforeAll(async () => {
  accountId = await makeUser(`a-${Date.now()}`);
  freshAccountId = await makeUser(`b-${Date.now()}`);

  // The accounts row itself comes from the signup trigger; set the Phase 15
  // profile fields + pause flag on it.
  await db
    .update(accounts)
    .set({
      fullName: 'Dr. Snapshot',
      title: 'Fizioterapeut',
      address: 'Rr. Snapshot 2, Tiranë',
      assistantPaused: true,
    })
    .where(eq(accounts.id, accountId));

  await db.insert(whatsappConnections).values({
    accountId,
    phoneNumberId: `pn-snapshot-${Date.now()}`,
    wabaId: 'WABA_SNAPSHOT',
    displayPhoneNumber: '+355 69 765 4321',
    status: 'active',
  });
});

afterAll(async () => {
  const sb = createServiceClient();
  if (accountId) await sb.auth.admin.deleteUser(accountId);
  if (freshAccountId) await sb.auth.admin.deleteUser(freshAccountId);
});

describe('getSettingsSnapshot', () => {
  it('returns the Phase 15 fields alongside the existing ones', async () => {
    const snap = await getSettingsSnapshot(accountId);

    expect(snap.fullName).toBe('Dr. Snapshot');
    expect(snap.title).toBe('Fizioterapeut');
    expect(snap.address).toBe('Rr. Snapshot 2, Tiranë');
    expect(snap.assistantPaused).toBe(true);
    expect(snap.whatsappDisplayPhoneNumber).toBe('+355 69 765 4321');

    // Regression: existing fields still populated.
    expect(snap.whatsappStatus).toBe('active');
    expect(snap.whatsappPhoneNumberId).toMatch(/^pn-snapshot-/);
    expect(snap.timezone).toBe('Europe/Berlin');
    expect(snap.retentionDays).toBe(90);
  });

  it('returns defaults for a fresh PT with nothing set', async () => {
    const snap = await getSettingsSnapshot(freshAccountId);

    expect(snap.fullName).toBe('');
    expect(snap.title).toBe('');
    expect(snap.address).toBe('');
    expect(snap.assistantPaused).toBe(false);
    expect(snap.whatsappDisplayPhoneNumber).toBeNull();
    expect(snap.whatsappStatus).toBeNull();
    expect(snap.whatsappTemplateStatus).toBeNull();
  });
});

describe('getSettingsSnapshot · whatsappTemplateStatus', () => {
  function seedTemplate(
    name: string,
    status: 'approved' | 'pending' | 'rejected',
  ) {
    return db
      .insert(messageTemplates)
      .values({ accountId, name, language: 'sq', status, body: 'x' });
  }

  beforeEach(async () => {
    await db.delete(messageTemplates).where(eq(messageTemplates.accountId, accountId));
  });

  it('is null with no message_templates rows', async () => {
    const snap = await getSettingsSnapshot(accountId);
    expect(snap.whatsappTemplateStatus).toBeNull();
  });

  it('reports approved for an approved priority template', async () => {
    await seedTemplate(REMINDER_TEMPLATE.name, 'approved');
    const snap = await getSettingsSnapshot(accountId);
    expect(snap.whatsappTemplateStatus).toBe('approved');
  });

  it('reports pending when only a pending row exists', async () => {
    await seedTemplate(REMINDER_TEMPLATE.name, 'pending');
    const snap = await getSettingsSnapshot(accountId);
    expect(snap.whatsappTemplateStatus).toBe('pending');
  });

  it('reports rejected when only a rejected row exists', async () => {
    await seedTemplate(REMINDER_TEMPLATE.name, 'rejected');
    const snap = await getSettingsSnapshot(accountId);
    expect(snap.whatsappTemplateStatus).toBe('rejected');
  });

  it('best-wins: approved beats rejected across priority names', async () => {
    await seedTemplate(REMINDER_TEMPLATE.name, 'rejected');
    await seedTemplate(FALLBACK_REMINDER_TEMPLATE.name, 'approved');
    const snap = await getSettingsSnapshot(accountId);
    expect(snap.whatsappTemplateStatus).toBe('approved');
  });

  it('ignores non-priority template names', async () => {
    await seedTemplate('some_marketing_tpl', 'approved');
    const snap = await getSettingsSnapshot(accountId);
    expect(snap.whatsappTemplateStatus).toBeNull();
  });
});
