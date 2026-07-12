import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pts, whatsappConnections } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { getSettingsSnapshot } from '../read-models';

let ptId = '';
let freshPtId = '';

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
  ptId = await makeUser(`a-${Date.now()}`);
  freshPtId = await makeUser(`b-${Date.now()}`);

  // The pts row itself comes from the signup trigger; set the Phase 15
  // profile fields + pause flag on it.
  await db
    .update(pts)
    .set({
      fullName: 'Dr. Snapshot',
      title: 'Fizioterapeut',
      address: 'Rr. Snapshot 2, Tiranë',
      assistantPaused: true,
    })
    .where(eq(pts.id, ptId));

  await db.insert(whatsappConnections).values({
    ptId,
    phoneNumberId: `pn-snapshot-${Date.now()}`,
    wabaId: 'WABA_SNAPSHOT',
    displayPhoneNumber: '+355 69 765 4321',
    status: 'active',
  });
});

afterAll(async () => {
  const sb = createServiceClient();
  if (ptId) await sb.auth.admin.deleteUser(ptId);
  if (freshPtId) await sb.auth.admin.deleteUser(freshPtId);
});

describe('getSettingsSnapshot', () => {
  it('returns the Phase 15 fields alongside the existing ones', async () => {
    const snap = await getSettingsSnapshot(ptId);

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
    const snap = await getSettingsSnapshot(freshPtId);

    expect(snap.fullName).toBe('');
    expect(snap.title).toBe('');
    expect(snap.address).toBe('');
    expect(snap.assistantPaused).toBe(false);
    expect(snap.whatsappDisplayPhoneNumber).toBeNull();
    expect(snap.whatsappStatus).toBeNull();
  });
});
