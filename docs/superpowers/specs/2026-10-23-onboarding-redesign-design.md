# Onboarding redesign — design

Status: draft for approval. Date: 2026-10-23.

Decisions are marked **[KD]** (stated by KD) or **[my call]** (the author's
guess, open to override). Anything unmarked is description of the current
state.

## Intent

A new business signs up and today does not understand what is happening. The
current onboarding is a checklist of buttons that send the user out to
settings pages (set business profile, save, find the way back by hand) and
ends with subscription plan cards. The first screen shows too many
highlighted actions at once. KD's words: it "makes users suffer to understand
what is happening".

The redesign throws the current onboarding away and replaces it with a single
linear flow: one screen, one task, one primary button, no trips out to
settings. The example user is a psychologist who just signed up, but Medium is
a horizontal appointment-booking product (barbers, nail salons, trainers and
others), so nothing in the flow or its copy may assume a medical business.

### What success looks like

Five minutes after signing up, the person **[KD]**:

- understands how Medium works,
- has a complete business profile, services and availability,
- has connected WhatsApp (best case) or knows exactly how to get a number,
- has turned on notifications.

Best case, nothing is left to do. Worst case, **exactly one step** is left
before Medium starts working for them: connecting WhatsApp **[KD]**.

## Goals

- One linear flow, one level deep. Each step saves on Continue and moves on.
  Back is always available. A progress indicator is always visible.
- No step sends the user to a settings page.
- The user finishes onboarding even without a WhatsApp Business number; the
  app then shows one remaining step **[KD]**.
- Collect everything Medium needs to answer clients correctly, so the AI does
  not guess.
- Leave room for the business profile to grow (address details, images, and
  more) without making onboarding longer.

## Non-goals

- No paid-only features are configured in onboarding **[KD]**.
- No new languages. The assistant replies in Albanian only for now, so there
  is no language field **[KD]**.
- Existing accounts are left as they are **[KD]**: no migration of their
  state, no forced re-onboarding.
- **No subscription upselling anywhere in onboarding [KD].** No plan cards,
  no plan preview, no upgrade call to action. A better way to upsell is to be
  designed separately, later.
- Not designing the paid features themselves (FAQ, tone, gallery, and so on).
- Not changing billing or checkout.
- Meta Embedded Signup outcomes (popup blocked or cancelled, error, number
  already in use, pending verification) are already handled by the existing
  flow and are not redesigned here **[KD]**.
- No logo or cover photo upload, and no paid-plan trial **[KD]**.
- The old "test message" step is dropped completely **[KD]**: not in the
  path, and no replacement card on the dashboard. Legacy accounts keep it
  through their existing gate.
- No automatic Google Meet links. That is a separate, later feature **[KD]**
  (the Meet REST API `spaces.create` with a Medium-owned Google account and
  `accessType: OPEN`; recording, transcription and smart notes explicitly
  off). Until then, online appointments rely on the professional sending the
  link themselves.

## Anti-goals

Failure even if it technically works:

- Any step that makes the user leave the flow and find their own way back.
- More than one competing primary action on a screen.
- A money decision before the user has seen the product work.
- Asking the user to fill in things that do nothing on their plan ("saved but
  not active").
- A new required field that locks out existing users or sends them back into
  onboarding.

## The flow

Seven steps plus a finish screen, in this order **[KD]**. A first wireframe
of the path was shown and approved in principle; it is illustrative, not
final design. (An earlier plan-preview step was removed with the upsell; see
Non-goals.)

1. **How it works.** Three short lines: clients message your WhatsApp, Medium
   replies and finds a time that fits you, you get the appointment. Says that
   setup takes minutes, and that getting a WhatsApp number may take longer;
   it must not promise a fixed "three minutes" because the number can take
   days **[my call]**. One button: Start.
2. **Business identity.** Required: business name and **business type**,
   chosen only from a predefined list that we define, never free text
   **[KD]**. Each type carries its own AI prompt configuration **[KD]**, which
   is why the list is closed. The type also drives the starter service
   suggestions in step 3 **[my call]**. The list **[KD for the first five and
   the generic fallback; my call for the rest]**: psychologist,
   physiotherapist, dentist, beauty salon, personal trainer, barber /
   hairdresser, massage therapist, nutritionist, coach / tutor, consultant,
   and **other professional**, a defined type with a general prompt
   configuration so nobody is stuck. Existing accounts have no type and keep
   behaving as they do today **[my call]**. The picker is a visible list of
   tappable rows (eleven options on one screen), not a dropdown **[KD agreed]**.
   Optional: owner name and professional title, short description/tagline.
   Logo and cover photo are future work and not part of this release
   **[KD]**. Optional fields must not block Continue **[my call]**.
3. **Services.** Per service, required: name, duration, price, **service
   mode** (at my place / at the client's place / online), and **description**
   **[KD]** (a missing description or category makes the AI answer
   wrongly). Optional: buffer, active/hidden. On the free plan only one
   service can be created or active; a second cannot be added at all **[KD]**.
   The "add service" control stays visible but gated, with the reason shown
   inline (for example "the free plan includes one service"), never hidden or
   silently disabled **[KD agreed]**. The reason carries no upgrade link or
   call to action (no upselling in onboarding). Starter suggestions for the
   chosen business type are single-choice on the free plan, since only one
   service is allowed **[KD agreed]**. Every new account is on the free plan
   throughout onboarding.
4. **Where (adaptive).** Business-level location is *derived* from the
   services' modes, not asked up front **[KD]**:
   - any in-person service → address (required), city, country; optional
     directions, parking and entrance notes, floor. **Country is prefilled as
     Shqipëri [KD]**, so in practice the user types address and city;
   - any at-the-client's service → a **service area written in plain text**
     (for example "Tiranë dhe rrethinat") **[KD]**. There is no radius, map or
     distance calculation; the AI uses the text to tell a client whether
     they are covered, and asks the client for their address when booking,
     which is saved as text on the appointment **[KD]**. Anything beyond this
     for at-the-client's services is future work **[KD]**;
   - any online service → nothing to enter. There is **no meeting link
     field**: the professional creates the link when needed and sends it to
     the client themselves **[KD]**.
   A fully online business never sees an address field, and for a business
   with only online services this whole screen is skipped. This screen comes
   after Services for exactly that reason.
5. **Availability.** Required: working days and hours, timezone. **Timezone
   is prefilled as Tirana and shown as one line ("Ora: Tiranë · Ndrysho")**
   **[KD]**; it stays required but nobody has to type it. Each day chip has a
   full accessible name ("E hënë", not "H"). Optional: breaks, holidays and
   closures, vacation mode, buffer.
6. **WhatsApp.** Two paths **[KD]**:
   - "I have a WhatsApp Business number" → connect it, inside the flow.
   - "I don't have one yet" → an end-user-level guide to getting one (copy
     level per the help-content rule below). The user can continue without
     connecting; that leaves the single remaining step.
7. **Install and notifications [KD].** The last step, so that a user who
   leaves the browser for the installed app is not leaving steps behind
   **[KD]**. Content depends on the device. Already installed, or Android: one
   tap triggers the permission prompt. iPhone in the browser (web push needs
   the installed app, and the installed app requires a fresh sign-in): a short illustrated "Add to Home Screen" guide,
   after which the user reopens from the home screen and lands on the
   finish screen with the prompt ready. "Skip for now" is always available
   and finishes in the browser; if skipped, the dashboard asks again later and
   it never blocks finishing. Before the operating system's permission prompt
   there is our own screen stating the benefit first ("know when someone
   books"), so a refusal does not use up the one-time system prompt; the
   system prompt fires only after the user taps our button. If permission is
   denied, a state explains how to turn it on later. Notification preferences
   beyond that live in settings **[KD agreed]**.
8. **Finish.** Either "Ready" (WhatsApp connected) or "One step left: connect
   WhatsApp". It does not say "you're live" before a real client message has
   worked **[KD agreed]**.

**Leaving early [KD].** For new accounts there is no way to reach the
dashboard until the required data steps (2 to 5) are done; the empty
dashboard is exactly the confusion this redesign removes. Steps 6 and 7
(WhatsApp, install and notifications) can each be skipped. The sign-out
control states that progress is saved.
The header offers sign out only. Progress is saved after every step, and the
user resumes where they stopped.

If the optional fields grow, the identity step and the Where step may split
into more sub-screens, still one task each **[KD]**.

**Going Back after the Where step is filled [my call].** If the user goes back
and changes a service's mode, the location data already entered is kept and
the Where step is recalculated (shown, changed or skipped) from the new modes.
The Back control and all fields keep what the user entered.

## Measurement

Success is read from a **step funnel [KD]**: an event when each step is shown
and when it is completed or skipped, so drop-off per step is visible. Time per
step is a useful extra **[my call]**. No single headline metric is fixed
beforehand. A baseline of the old flow's equivalent funnel is recorded before
it is replaced **[my call]**. Analytics tooling and consent handling are left
to the builder, within the existing privacy documentation.

## Free versus paid

Onboarding collects only what works on the free plan. Paid features are
**not** shown as fields in the flow **[KD, chose the recommended option]**.

Paid-only features (not configured in onboarding) **[KD]**: greeting and
tone, FAQ, what to tell clients before a first visit, topics to hand over and
escalation contact, price-quoting rules and custom instructions, review link,
intake questions at booking, photo gallery, intro video, and more than one
service.

**No upselling in onboarding [KD].** The onboarding path advertises nothing
paid. How and when to upsell is a separate piece of design for later. A user
who later subscribes adds the extra services and settings from the dashboard.

**After onboarding.**
- Paid features stay visible but locked in the dashboard/settings. Whether and
  how upgrade prompts appear (for example when trying to add a second
  service) is part of the later upsell design, not this release.
- Optional later enhancement, not in this release: let users pre-fill locked
  paid settings as drafts that activate on subscription **[KD, deferred]**.

## Required versus optional, and growth

Required core **[KD]**: business name, type, service name/duration/price/mode
and description, address when any service is in person, working days and
hours, timezone, WhatsApp number (WhatsApp may be completed after onboarding).

Everything else is optional and fills in over time; a profile-completeness
indicator on the dashboard is the intended home for the optional rest **[my
call]**.

Rule for the future: a field added to the required core later must never
block existing accounts or send them back into onboarding. New requirements
reach existing users as dashboard prompts **[my call]**.

Parked, not part of this work (listed so they are not lost): public phone,
email, website and social links; booking policies (cancellation window,
no-show, deposits, approval mode); legal name and NIPT; accepted payment
methods and currency; brand colour and public booking page URL; calendar
sync; client import.

## Existing accounts

Left as they are **[KD]**. The current gate is derived purely from data state
(no stored flag) and redirects incomplete accounts to `/onboarding` from the
dashboard layout, with a skip cookie. The builder must decide how new accounts
get the new flow while old ones keep their current behaviour.

## Constraints

- Copy is Albanian. Vocabulary is settled: **klient** (customer), **biznes**
  (business), **profesionist** (person where a noun is needed). Copy must read
  correctly for a nail salon as well as a clinic.
- Anything shown to the end user (including the WhatsApp number guide) is
  end-user level; developer or operations detail belongs in `docs/`, not in
  the product.
- Mobile-first. The users are on phones.
- Conventions of the existing codebase apply (Next.js App Router, Server
  Actions, the existing i18n module, data-derived onboarding state).
- Reminders are currently parked behind a flag; nothing in onboarding may
  promise them.
- One login per business, permanently; this design adds no team or multi-user
  concepts.

## Left to the builder

- Visual design, within the product's design system, and screen-level layout.
- Exact copy, within the vocabulary above.
- Data model changes needed for per-service mode, the derived business
  location, and any new optional business fields, including how these
  interact with the existing `accounts` and `services` tables.
- How the free-plan one-service limit is enforced in the Services screen.
- How state is saved between steps and resumed if the user leaves midway.
- How new versus existing accounts are told apart (see Existing accounts).
- How the WhatsApp connection is embedded in the flow without leaving it.
- Whether the old `/onboarding` route, its step components and its tests are
  deleted or reused; the current step set is being discarded.

## Settled from the code

- The free-plan limit of one active service already exists:
  `maxActiveServices: 1` in `lib/billing/plans.ts`, enforced server-side in
  `app/(dashboard)/settings/services/actions.ts`, with downgrade handling in
  `lib/inngest/functions/billing-renewal-monitor.ts`. The Services step reuses
  that enforcement and only changes how the limit is presented.
- WhatsApp connection already runs through Meta Embedded Signup
  (`app/(dashboard)/settings/connect-whatsapp.tsx`, `whatsapp-signup.ts`). The
  onboarding step embeds that same flow rather than building a new one.
- `accounts.assistantPaused` already exists.

## Calls made by the author (override freely)

- **New versus existing accounts:** a stored column on `accounts` marking the
  onboarding version. Every row that exists at migration time is "legacy" and
  keeps today's behaviour, including the skip cookie and the dashboard-layout
  gate. New accounts use the new flow. The legacy gate is removed later, in a
  separate change.
- **New columns are nullable.** Existing services have no description or
  mode, so "required" is enforced in the onboarding and edit forms, not by
  `NOT NULL`. Where the AI prompt meets a service without a description or
  mode, it treats the value as unknown and does not guess (tell the client it
  will confirm).
- **Location fields are account-level columns** (address, city, country,
  directions, parking, entrance, floor, service-area text).
  When a service mode later changes and a field becomes irrelevant, the data
  is kept, never cleared; validation applies only to fields the current set of
  service modes requires.
- **Each step writes straight to the live rows** (no draft), and the resume
  position is derived from data for required steps. WhatsApp comes after every
  required data step, so the assistant is never answering clients from a
  half-built profile; a user who skips the WhatsApp step simply has no active
  connection.
- **Onboarding is complete** when all required data exists and the user
  reaches the finish screen. A user who skipped WhatsApp then sees one clear
  "connect WhatsApp" state on the dashboard (the builder decides whether the
  existing banner is reused).
- **Plans:** the old plan step and `plan_step_seen_at` stay for legacy
  accounts; new accounts have no plan step and stay on the free plan until
  they subscribe from elsewhere in the product.
- **Notifications on iOS:** web push needs the installed PWA. If the app is
  not installed, step 7 shows a short "add to home screen" guide before the
  permission prompt; "Skip for now" always works.
- **WhatsApp number guide:** the author drafts it from Meta's current
  documentation, and KD reviews the Albanian wording before release. It must
  also cover someone who has only a regular (non-Business) WhatsApp number.

## Business type configurations

This release builds the closed list, stores the type on the account, and adds
a lookup from type to assistant configuration. **Every type uses one general
configuration for now [KD]**; specialised configurations are added one type at
a time in later work **[KD]**. The type does pick the starter service
suggestions in step 3 now **[my call]**, and the author drafts those
suggestions (Albanian names and durations) for KD to review **[my call]**.
A user may change their business type later in settings **[my call]**.

## Hardening decisions (product-design harden pass; all [my call] unless marked)

- **Completion is permanent.** For a new account, once required data exists
  and the Finish screen has been reached, onboarding is marked complete and
  is never re-evaluated. The old gate re-reads data on every dashboard
  request, which would throw an established user back into onboarding if they
  later deactivated their only service.
- **The phone's back gesture steps back.** Every step is its own address in
  the browser history, so the system Back moves one step back; it never
  leaves the flow or signs the user out.
- **Continue is always reachable.** The primary button sits in a fixed bar
  above the on-screen keyboard on every step (the original complaint was a
  hard-to-reach Save).
- **Saving is safe to repeat.** Continue shows a stable label while saving.
  On a failed or slow connection the entered data stays on screen, an error
  says what happened with a Retry, and the step is not advanced. Saving the
  same step twice (double tap, retry, two tabs) updates the same records and
  never creates duplicates or surfaces a "name already exists" error on the
  user's own service.
- **WhatsApp has a way back.** The dashboard's "one step left" card reopens
  the same two-path WhatsApp screen, including the guide to getting a number,
  not a settings page, and it is the only highlighted thing on that card.
- **Service mode has no default.** The three modes are visible choices (not a
  dropdown) and none is preselected, because a wrong guess is exactly the
  failure we are preventing.
- **Duration and price inputs:** numeric keypad, visible units (min, Lekë),
  and common durations offered as one-tap options with a custom entry.
- **Availability validation:** a day with end before start, no day selected,
  or overlapping ranges blocks Continue and says why next to the control; a
  silently disabled button is not allowed.
- **Step changes move focus** to the step heading and announce position
  ("Hapi 3 nga 7"); the progress indicator has an accessible name.
- **Install step on iPhone [KD confirmed]:** installing creates a fresh
  session, so the user must sign in again inside the installed app. The
  landing afterwards (finish screen with the permission prompt ready) is
  checked on a real device, reusing the PWA device-QA epic MED-6.
- **Price stays required and greater than zero [KD].** The database rule is
  unchanged. A professional who wants to offer something for free does that
  outside Medium; free or "price on agreement" services are not a concern for
  now.

## Known gaps (must be closed in the next phase)

- **All business types behave the same.** Until specialised configurations
  exist, a psychologist and a barber get the same assistant behaviour. Track
  each type's configuration as its own later ticket.

- **Online appointments have no link.** In this release the app does not
  create, store, track or remind about a meeting link; there is no "link not
  sent yet" marker and no notification **[KD]**. The AI's online booking
  confirmation tells the client the professional will send the link, and
  nothing in the product makes that happen **[my call on the wording]**. The
  next phase closes this with automatic Google Meet links (see Non-goals).
  This gap is accepted knowingly for this release and must be tracked as its
  own ticket when the work is written up.

## Open items

- None blocking. Settled by KD: logo and cover photo are **out of this
  release** (future work; no upload or storage work here), and there is **no
  paid-plan trial** for now. Accounts are either Free or Solo. A trial may be
  added later, as part of the upsell design.
