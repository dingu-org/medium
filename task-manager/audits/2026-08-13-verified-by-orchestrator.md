# Pre-verified findings (established by the orchestrator, not the auditors)

These were confirmed by actually running the suite against the live local
Supabase stack. The audit agents were told they could not do this, so their
version of these items will be weaker — trust this file over theirs.

## VF-1 — The 8 "pre-existing, unrelated" failures are a stale date fixture

**Confirmed by:** `pnpm test:integration` on 2026-08-13 against the running
local Supabase stack. Result: `Test Files 1 failed | 63 passed (64)`,
`Tests 8 failed | 600 passed (608)`. All 8 are in
`app/(dashboard)/chat/__tests__/actions.integration.test.ts`, all under the
`sendUpcomingReminderTemplate` describe block.

**Root cause:** the fixture hardcodes the appointment at
`new Date('2026-08-01T09:00:00.000Z')` (lines 336-337, 435; a second one at
670-671 uses `2026-08-02`). Today is 2026-08-13, so the appointment is in the
past and `sendUpcomingReminderTemplate` correctly returns
`{ ok: false, error: 'Nuk ka takim të ardhshëm.' }`. Every downstream assertion
then fails on undefined (`first.id`, `job.status`, `mock.calls[0][4]`).

**Therefore:** these tests began failing on **2026-08-01**, not at the AI change
they were attributed to. The decisions-log note ("pre-existing … unchanged and
unrelated") is accurate about the AI change but wrong to leave them red — the
entire manual-reminder path has been unverified since 2026-08-01.

**Fix:** freeze time (`vi.setSystemTime`) or derive fixtures relative to `now`.
Prefer freezing: several assertions compare against `formatAppointmentTime`
output, which is timezone- and clock-sensitive, so a relative fixture would make
the expectations drift instead of the setup.

**Verify:** `pnpm test:integration` → 64/64 files, 608/608 tests.

## VF-2 — The test suite decays with wall-clock time (systemic)

**Confirmed by:** 27 test files hardcode an absolute `new Date('20XX-…')`;
exactly **1** file uses `vi.useFakeTimers`/`setSystemTime`. Dates already past
include 2026-08-01/02 (detonated). Dates still armed: `2026-09-01`,
`2026-10-24`, `2026-10-25`.

**Impact:** "green" is a function of the date the suite is run on. Combined with
VF-4 (no CI) this means the suite silently rots and failures get re-attributed
to whatever change happened to be in flight — which is exactly what happened in
VF-1.

**Fix:** audit the 27 files; for every test whose behaviour depends on "now",
freeze the clock at a fixed instant. Leave purely-formatting fixtures alone.

## VF-3 — Integration tests are not isolated from pre-existing local DB state

**Confirmed by:** two consecutive `pnpm test:integration` runs on the same
commit gave different results. First run (dirty DB, left over from an earlier
`seed:qa`): `3 files failed, 23 tests failed`. Second run (DB now in the shape
the previous run left it): `1 file failed, 8 tests failed`.

**Impact:** 15 additional failures appear or vanish depending on what is already
in the local database. A developer cannot distinguish "I broke something" from
"my DB was dirty", which devalues every test run.

**Fix:** identify the 2 extra files that failed only on the dirty run and make
their setup self-contained (truncate/scope rather than assume an empty table).
Reproduce by running `pnpm seed:qa` and then the integration suite.

**Note:** memory says integration tests wipe `auth.users`, so a reseed is needed
after a run for signed-in browser QA.

### RESOLVED 2026-08-14 — with a correction to the diagnosis above

The finding was real; its stated cause was not. **`seed:qa` residue cannot reach
a test**: `tests/setup/global.ts` deletes `auth.users`, and that cascades to
every tenant table (measured — the only survivor is `erasure_archive`, which is
FK-free by design). The prescribed reproduction, `pnpm seed:qa` then the suite,
is therefore green with no changes at all, which is why the "2 extra files"
could not be found that way. The 3-vs-1 difference in the runs above is not
attributable to the seed data.

What genuinely depends on ambient state is narrower and sharper: tests that
assert on a **cross-tenant** production query — the admin funnel, the outbox
publisher, the token-expiry claim — which scan the whole table on the
RLS-bypassing owner connection, so their result includes every other tenant's
rows. Found by running the suite with `globalSetup` removed against a
deliberately adversarial "ghost tenant": **5 files, 6 tests**, listed in the
2026-08-14 entry in `progress.md`. Fixed via `tests/support/isolation.ts`
(`excludeForeignRows` / `deltaOf`), plus two adjacent leftover-state bugs: the
never-cleared `erasure_archive`, and the paged `listUsers` lookup in both seed
scripts. The suite now passes 608/608 with **no database wipe at all** on top of
that residue.

## VF-4 — There is no CI, so nothing runs the suite but a human

`.github/` does not exist in this repo. Combined with VF-2 and VF-3, the test
suite's signal is only as good as the last time someone ran it locally on a
clean database. This is the reason VF-1 survived twelve days.

## Environment facts confirmed for this run

- Docker: running. Local Supabase stack: up (Studio 54323, Mailpit 54324).
  Therefore `pnpm test:integration` **is** runnable here — the audit agents were
  told it was not, so discount any finding of theirs that leans on that.
- Some local Supabase services are stopped: `realtime`, `storage`, `imgproxy`,
  `edge_runtime`, `pooler`. Realtime being down matters for any realtime test or
  browser QA (memory already records local Realtime as disabled).
