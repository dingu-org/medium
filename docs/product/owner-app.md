# Owner app

The owner app is a mobile-first PWA with five tabs — **Sot** (Today), **Kalendari** (Calendar), **Bisedat** (Chats), **Klientët** (Clients) and **Ti** (You). Each tab renders from one server-side snapshot function, keeps itself fresh through a Supabase realtime subscription, and routes its writes through server actions. Sends and appointment changes go through the offline mutation queue, so they survive a dead connection.

This document describes what each screen shows and which code produces it. It does not explain the machinery behind the screens: how an inbound message is answered, reminder scheduling, the offline queue's internals, billing arithmetic and privacy guarantees each have their own document, linked where they come up.

## Navigation and chrome

Every dashboard route is wrapped by `app/(dashboard)/layout.tsx`, which resolves the signed-in user, enforces the onboarding gate, and renders `DashboardChrome`.

`components/dashboard/bottom-nav.tsx` defines the five tabs:

| Tab      | Href        | Label     | Badge                                                       |
| -------- | ----------- | --------- | ----------------------------------------------------------- |
| Today    | `/today`    | Sot       | —                                                           |
| Calendar | `/calendar` | Kalendari | —                                                           |
| Chats    | `/chat`     | Bisedat   | dot when any open conversation has unread customer messages |
| Clients  | `/clients`  | Klientët  | —                                                           |
| You      | `/settings` | Ti        | —                                                           |

`components/dashboard/dashboard-chrome.tsx` shows the top header only on those five paths. The header carries the screen title, the online/offline dot (`components/dashboard/sync-indicator.tsx`), a per-screen action button, the notification bell, and — everywhere except `/settings` — an avatar menu holding the account email and **Dil** (sign out). Settings carries its own sign-out row in the page body instead. Detail routes — a conversation, a client, a settings subpage — replace the header with `components/dashboard/nav-bar.tsx` and its back link.

Two contextual header actions exist: the chat list toggles its search field through `?search=1`, and the clients directory links to `/clients/new`. When a screen is opened from the setup wizard (`?from=onboarding`), the chrome adds a banner offering the way back to `/onboarding`.

`public/manifest.json` installs the app as `standalone`, portrait, `lang: "sq"`, with `start_url` `/today` — so an installed icon opens on Today.

## Today

Today answers the question "what needs me?". `getTodaySnapshot` in `lib/today/queries.ts` builds the whole screen in one pass, resolving the account timezone first so every boundary is a local one.

The week strip counts three things over the current ISO week (Monday to Sunday) in the account's timezone: customer messages received, appointments created, and `conversation.escalated` events.

The attention list is the union of two queries, deduplicated so one customer appears once and an escalation outranks a reminder:

| Row kind            | Included when                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Escalation          | conversation is open (`closed_at IS NULL`) and `escalation_state <> 'idle'`                                                        |
| Unanswered reminder | reminder job is `sent` with no `response_type`, the appointment is `pending` or `confirmed`, and the appointment has not ended yet |

Keeping an unanswered reminder in the list until the appointment _ends_ — not until it starts — is deliberate: a live no-reply is a possible no-show.

Below the attention list sit the next appointment and the rest of today, both drawn from appointments that are `pending` or `confirmed` and still running or upcoming. Because a reminder normally belongs to tomorrow, `startLabelFor` prefixes the day: a bare time for today, `Nesër 10:00` for tomorrow, weekday plus date beyond that.

When there is nothing in the attention list and no next appointment, the screen renders a quiet state instead. Tapping a card opens the appointment sheet; **Anulo** on a card opens its own confirmation dialog, which names the customer and time and takes the same optional free-text reason as the sheet's cancel panel. The screen subscribes to `appointments` and `reminder_jobs`; `conversations` is subscribed once for the whole app in the layout. `lib/today/__tests__/queries.integration.test.ts` pins the attention rules.

## Calendar

The calendar is a read-through of the appointment table for one date window, plus the entry point for anything the owner books by hand. `getCalendarSnapshot` in `lib/pwa/read-models.ts` serves it.

`/calendar` accepts `?date=YYYY-MM-DD` and `?view=day|week`. The view defaults to `week` and weeks start on Monday; an anchor date that does not parse falls back to today in the account timezone. Rows carry a `StatusBadge` for appointment status and a `ReminderBadge` for reminder state, both from `components/appointments/badges.tsx`; the reminder badge is described in [Reminders](../features/reminders.md).

The floating action button (`app/(dashboard)/calendar/calendar-fab.tsx`) opens a two-way menu:

- **New appointment** — pick an existing customer through `searchCustomers` (name or phone, 20 newest matches) or type a name and phone to create one inline, then enter a date and a time directly. There is no slot picker here: the owner is booking deliberately, often outside working hours.
- **New blocked period** — writes a busy range through `addBlockedPeriod`, shared with the availability screen.

Manual booking calls `bookAppointment` with `allowOutsideAvailability: true` and `origin: 'account'`, so the owner can book outside working hours. Double-booking is still refused by the database exclusion constraint. See [Appointments and availability](../features/appointments-availability.md) for both mechanisms. The screen subscribes to `appointments`.

## Appointment sheet

`components/appointments/appointment-sheet.tsx` is the one detail surface for an appointment, opened from Today, the calendar and a client's page.

| Action                        | Queued as    | Effect                                              |
| ----------------------------- | ------------ | --------------------------------------------------- |
| Confirm / Completed / No-show | `transition` | status transition with `origin: 'account'`          |
| Cancel                        | `cancel`     | `cancelledBy: 'account'`, optional free-text reason |
| Reschedule                    | `reschedule` | a new start picked from the next 14 days            |
| Notes                         | `notes`      | free text on the appointment                        |

The sheet also offers three ways to reach the person: `tel:` for a call, `https://wa.me/<digits>` for WhatsApp, and `/chat/<conversationId>` for the in-app thread when a conversation exists.

Every one of the four actions is submitted through `queueAppointmentMutation` rather than a direct server action, so the sheet works offline: the change is stored locally, the sheet shows it as pending, and it replays against `POST /api/pwa/mutations/appointment` when the connection returns. [Offline behaviour](../features/pwa-offline.md) covers the queue.

The reschedule picker calls `getUpcomingSlots` with no arguments, so it offers the hourly default grid over the next 14 days and does not exclude the appointment being moved. The action takes optional `durationMinutes` and `excludeAppointmentId` parameters for a picker that wants to match the service being moved.

## Chats

The chat list is the owner's inbox. `getChatListPage` in `lib/chat/queries.ts` returns one page of conversations.

Ordering puts anything needing a human first — `escalation_state <> 'idle'` or `ai_active = false` — then last activity descending, with the conversation id as a stable tiebreaker. Pages hold `CHAT_LIST_PAGE_SIZE` (30) rows and are `OFFSET`-based; the query fetches one extra row to decide `hasMore` without a second count.

`/chat` takes three query parameters:

| Parameter | Values                  | Effect                                                                   |
| --------- | ----------------------- | ------------------------------------------------------------------------ |
| `tab`     | `closed`, anything else | closed conversations (`closed_at IS NOT NULL`) or active ones            |
| `q`       | free text               | matches customer name, customer phone, or any message body in the thread |
| `search`  | `1`                     | reveals the search field in the header                                   |

Each row shows the last message, its author, and a count of customer messages newer than `last_read_at`. **Shfaq më shumë** fetches the next page through `loadMoreConversations`; the `messages` realtime subscription resets the list to page 0, so offset drift from new activity self-heals rather than needing a cursor.

## Conversation thread

A thread is one customer's WhatsApp conversation. `getChatThreadSnapshot` loads the newest 50 messages plus everything the header needs; `getOlderChatMessages` serves **Shfaq mesazhet e mëparshme** as keyset pages on `(created_at, id)`.

Bubbles are laid out by `role` — `customer`, `ai`, `account`. Outbound bubbles carry a delivery status (`sent`, `delivered`, `read`, `failed`) joined from `wa_message_statuses`; inbound bubbles never do. That status is captured when the snapshot loads and refreshed on the next fetch, because the status table is not readable over realtime.

The status row (`components/chat/status-row.tsx`) shows one of four handling modes and a switch that hands the thread between the assistant and the owner:

| Mode        | Meaning                                   | Switch                                      |
| ----------- | ----------------------------------------- | ------------------------------------------- |
| `ai`        | the assistant is answering                | on                                          |
| `you`       | the owner took over                       | off, with **Ktheja Medium-it** to hand back |
| `paused`    | the assistant is paused until a timestamp | off, with **Aktivizo tani** to resume       |
| `escalated` | the assistant asked for a person          | off                                         |

Flipping the switch calls `setTakeover`, which turns `ai_active` off, clears any pause, and emits `conversation.taken_over` on takeover; handing back also clears `escalation_state`. [The assistant](../features/assistant-conversation-engine.md) explains what each mode means for inbound messages.

Notices stack under the status row for: the monthly conversation cap being reached, an open escalation, an active takeover, an active pause, being offline, a closed thread, and a missing WhatsApp connection. A revoked connection is reported by the composer instead, which is replaced by a reconnect card.

The composer (`components/chat/composer.tsx`) has three states. Normally it sends free text. When the 24-hour service window has closed it swaps in a card offering the reminder template instead — see [Reminders](../features/reminders.md) for when that send is allowed. When the connection is revoked it disables sending entirely.

Sending posts to the offline mutation route and paints an optimistic bubble immediately. A failed bubble can be retried under its _original_ client mutation id, so the server replays its stored result rather than delivering the customer a duplicate. Sending, and the reminder-template button, both switch the thread to owner handling.

Two more controls sit in the thread header: **Mbyll bisedën** / **Rihap bisedën** (`setConversationClosed`) archives or reopens the conversation, and reading the thread calls `markConversationRead`, which advances `last_read_at` entirely in SQL so microsecond-precision timestamps cannot leave the final message stuck as unread. `app/(dashboard)/chat/__tests__/actions.integration.test.ts` pins these transitions.

## Clients

The directory at `/clients?q=` is served by `getClientDirectory` in `lib/clients/queries.ts`. Search folds Albanian diacritics on both sides (`Ërmira` matches `ermira`) and, for anything containing digits, compares digits-only against the stored number — so `069 123 4567` finds `+355691234567`. The list is capped at 250 rows with the true total counted separately, and each row is enriched with the next and most recent appointment from the last 12 months.

`/clients/new` creates a customer by hand through `createManualCustomer` (`lib/clients/mutations.ts`). `normalizeManualPhone` rewrites a leading national trunk `0` to `+355` and strips an international `00` prefix, so the stored number can later match a WhatsApp `wa_id`. Because `customers` has no unique constraint on `(account_id, phone)`, the duplicate check runs under a per-number advisory lock rather than a bare read-then-insert.

A manually added customer is joined to their WhatsApp thread automatically: the first inbound message whose digits match an unlinked row stamps the `wa_id` onto it (`linkManualCustomer` in `app/api/webhooks/whatsapp/route.ts`).

`/clients/:id` shows the customer's phone, a reminder opt-out marker when set, free-text notes (`updateClientNotes`, audited), upcoming appointments and history. Two data-rights controls live at the bottom:

- **Eksporto të dhënat e klientit** calls `exportCustomer` and downloads the result as `customer-<id>.json` in the browser.
- **Fshi klientin** is armed only once the owner types the customer's name back, falling back to the literal word `FSHI` when the name is blank (`lib/settings/confirm-phrase.ts`), then calls `eraseCustomer`.

Both are explained in [Privacy and GDPR](../features/privacy-and-gdpr.md).

## Settings

`/settings` is a hub of grouped rows rather than a form. It opens with a profile card and the assistant pause switch, then three groups whose right-hand values summarise the state behind each row: the active service count, a weekday availability summary, the WhatsApp status as a coloured dot, and the current plan. A version footer prints `NEXT_PUBLIC_APP_VERSION` and `NEXT_PUBLIC_BUILD_ID`.

Most subpages read from `getSettingsSnapshot` (`lib/pwa/read-models.ts`) and every one writes through its own server action. Services reads `getServices`, availability queries its three tables directly, and billing reads `getBillingSnapshot`:

| Subpage                   | Reads                                                     | Writes                                                                                                                                    |
| ------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `/settings/profile`       | name, full name, title, address                           | `updateProfile` — name, title and address pass `sanitizePromptField` because those three reach the assistant's prompt; full name does not |
| `/settings/whatsapp`      | connection status, phone number, reminder template status | Embedded Signup connect or reconnect, `disconnectWhatsApp`                                                                                |
| `/settings/availability`  | weekday rules, blocked periods, timezone                  | `saveAvailability`, `saveTimezone`, `addBlockedPeriod`, `deleteBlockedPeriod`                                                             |
| `/settings/services`      | service list                                              | `createService`, `updateService`, `setServiceActive`, `deleteService`                                                                     |
| `/settings/assistant`     | pause switch, assistant name and greeting                 | `setAssistantPaused`, `updateAssistantIdentity`                                                                                           |
| `/settings/notifications` | 9 preference toggles, this device's push state            | `setNotificationPref`, `savePushSubscription`, `removePushSubscription`                                                                   |
| `/settings/billing`       | plan card, usage meters, receipts, checkout slot          | `createCheckoutAction`, plus settling a returning `?orderId=`                                                                             |
| `/settings/account`       | email, retention days                                     | `updateRetention`, `exportAccount`, `deleteAccount`                                                                                       |

Three of these rows are plan-gated. The service editor refuses to activate more than `maxActiveServices`, the assistant name and greeting are locked unless the plan grants a custom identity, and the retention picker offers 30, 60, 90, 180 and 365 days but rejects anything above the plan maximum. [Billing and plans](../features/billing-and-plans.md) owns the entitlement rules; [Notifications](../features/notifications.md) owns the preference keys and the device push lifecycle.

The WhatsApp subpage is a three-state screen driven by the connection row: no row shows the connect explainer, `revoked` shows a warning and a reconnect button, and `active` shows the connected number, the reminder template status, and disconnect. [WhatsApp connection](../features/whatsapp-connection.md) covers what each state means.

Signing out revokes this device's push subscription and clears the local PWA database and caches before ending the Supabase session, so a shared device leaves nothing behind.

## Onboarding

`/onboarding` is the first screen after sign-up and the only route outside the dashboard layout that a signed-in owner is pushed to. It renders five progress dots, the first incomplete step with its call to action, a **Kalo për tani** link, and a link to the public help pages.

The services step is the one that differs: it lists the services already on the account with their durations and offers **Vazhdo me këto shërbime**, which stamps `services_configured_at` and marks the step done. Below the steps sits a skippable plan card comparing Free and Solo; it never blocks reaching the dashboard.

[Accounts, auth and onboarding](../features/accounts-auth-onboarding.md) explains how each step is derived and how the gate is bypassed.

## Language and copy

All owner-facing strings live in one Albanian dictionary, `lib/i18n/sq.ts`, composed from per-area modules under `lib/i18n/dict/`. There is no runtime locale switch: screens import `t` directly. Owner copy is informal ("ti"); the formal register used when writing to a customer lives in the assistant prompts and the reminder handlers, not in the dictionary.

The shipped Albanian copy still calls a customer _pacient_, because the pilot vertical is physiotherapy; the public marketing and legal pages go further and name the owner a _fizioterapist_. The data model and this documentation use `accounts` and `customers`.

## Loading, empty and error states

Each tab ships a `loading.tsx` that renders the shared skeleton from `components/states/index.tsx` while its snapshot resolves, so navigation never shows a blank frame. The same module supplies the empty state used when a list has no rows and when a search returns nothing. Uncaught render errors fall through to `app/error.tsx`, with `app/global-error.tsx` as the last resort.

Layout, spacing and type decisions across these screens follow [the spacing spec](../design/spacing-spec.md).
