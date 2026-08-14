# WhatsApp Embedded Signup v4 — operator setup guide

**Audience:** the person with admin access to the Meta App Dashboard. No Meta platform expertise assumed.
**Written:** 2026-08-14. Every factual claim about Meta's platform is sourced at the bottom.
**Deadline:** 2026-10-15. That is 62 days from the date above.

---

## Read this first — three corrections to what the repo currently says

The repo's prior notes were mostly right, but three things need correcting before anyone acts on them.

### 1. The deadline is real, and it is worse than recorded

The repo records a cutoff of **2026-10-15**. That date is **correct** — Meta's docs carry a standing banner: *"Embedded Signup v2 will be deprecated on October 15, 2026."* ([Overview][s-overview], [Onboard WhatsApp Business app users][s-coex])

But Meta's own announcement blog is broader than the docs banner: **"Embedded signup v2 and v3 will be deprecated on October 15th."** ([v4 blog][s-blog]) The Versions page agrees, listing v2, v3, v2-public-preview and v3-public-preview as all "Available until: October 2026". ([Versions][s-versions])

So there is no "we're on v3, we have longer" escape hatch. Everything below v4 stops on the same day.

### 2. "v4" is the correct name

The repo calls the migration target "v4". That is exactly what Meta calls it. **v4 was released 2025-10-08** and is the current stable version; there is also a **v4-public-preview** released 2026-05-12 which you should **not** use. Neither has a retirement date yet ("Available until: TBD"). ([Versions][s-versions], [Version 4][s-v4])

### 3. The most important finding: coexistence does *not* migrate automatically

Medium connects therapists in **coexistence** mode — they keep using the WhatsApp Business app on their phone, and Medium's AI assistant works on the same number through the Cloud API. The route handler hardcodes `mode: 'coexistence'`.

Meta's v4 migration blog names three feature types that **cannot** be auto-upgraded and require manual work before the deadline:

- `only_waba_sharing`
- `marketing_messages_lite`
- **`coex`** — coexistence onboarding

And states: *"After October 15th, the deprecated feature types will no longer function; they will default to the standard embedded signup flow."* ([v4 blog][s-blog])

**Plain English:** if nothing is done, on 2026-10-16 a therapist who clicks "Connect WhatsApp" will not silently break with an error. They will be shown the *ordinary* Cloud API signup instead — which asks them to register a **new** number rather than connect the one already on their phone. That is a worse failure than an outage, because it looks like it worked.

> **Note on the repo's description of the code.** The task brief said the client sends `featureType: 'coex'`. It does not. The working tree at `app/(dashboard)/settings/connect-whatsapp.tsx:184-188` sends `featureType: 'whatsapp_business_app_onboarding'`. `coex` is the label Meta uses for the same concept in its migration blog; `whatsapp_business_app_onboarding` is the string the API takes. Same thing, two names — but if anyone greps for `coex` in this repo they will find nothing and wrongly conclude the app is unaffected.

---

## What Embedded Signup actually is

When a therapist clicks **Connect WhatsApp** in Medium's settings, a Facebook popup opens. Inside that popup — hosted entirely by Meta, not by us — the therapist signs into Facebook, picks or creates their business account, and grants Medium permission to send and receive WhatsApp messages on their behalf. When they finish, the popup hands Medium back a one-time code and some ID numbers. Medium's server swaps that code for an access token and stores it. That whole popup experience is "Embedded Signup". ([Overview][s-overview])

The thing that decides **what the popup looks like and what it asks for** is a **Facebook Login for Business configuration** — a saved settings object living in the Meta App Dashboard, identified by a long numeric **configuration ID**. Medium passes that ID to Meta when opening the popup. It is stored in the env var `NEXT_PUBLIC_META_CONFIG_ID`.

**The single biggest change in v4:** the popup's version is no longer chosen by our code. It is chosen by the configuration. Meta: *"To upgrade to the v4 experience, you need to create a new Facebook Login for Business Configuration, and select your desired products. Selecting the products will automatically set you to v4."* ([Version 4][s-v4])

This is why the operator, not the developer, is on the critical path. **No code change alone can move Medium to v4.**

### Why the existing configuration is stuck on v2

Meta's Versions page lists how each version is selected: ([Versions][s-versions])

| Version | Released | Available until | How it is selected |
|---|---|---|---|
| v2 | January 2023 | October 2026 | **Omit `version` from `extras`** |
| v3 | 2025-05-29 | October 2026 | Set `version: "v3"` in `extras` |
| v4 | **2025-10-08** | **TBD** | **Create a Facebook Login for Business config; `extras` is empty** |
| v4-public-preview | 2026-05-12 | TBD | Set `version: "v4-public-preview"` in `extras` |

Medium's client omits `version` entirely. Per the table, that is **v2** — the version that dies first. The `sessionInfoVersion: '3'` key in our `extras` is a *different* setting (it controls the shape of the data the popup posts back, not the flow version), so it does not put us on v3. The repo's earlier conclusion that this is a "v2-era payload shape" is **correct**.

---

## Before you start — prerequisites

Check these first. If any is missing, the steps below will complete but the popup will fail for real therapists.

- The Meta app must be a **Business**-type app. ([Overview][s-overview])
- The business must be registered as a **Tech Provider** (or Solution Partner). ([Overview][s-overview])
- The app needs **Advanced Access** approved for `whatsapp_business_management` and `whatsapp_business_messaging`. Meta: *"You will not be able to onboard business customers until your app has been approved for advanced access."* ([Overview][s-overview])
- **Business verification** raises the onboarding cap from 10 to 200 customers per rolling 7-day window. ([Overview][s-overview])
- For coexistence specifically, the therapist's phone must run **WhatsApp Business app 2.24.17 or higher**. ([Onboard WhatsApp Business app users][s-coex])

> Medium has **two separate Meta apps** — a test app for Preview and a live app for Production (`lib/env/env-vars.ts` marks `META_APP_ID` and `NEXT_PUBLIC_META_CONFIG_ID` as `mustDiffer: true`). **Everything below must be done twice, once in each app.** You will end up with two different configuration IDs.

---

## The click-by-click checklist

**24 steps.** Steps 1–20 are per Meta app, so run them twice (test app, then live app). Steps 21–24 are done once.

### Part A — turn on the login settings (steps 1–9)

These are app-wide toggles. If they are already on, confirm and move past.

1. Go to **https://developers.facebook.com/apps** and click into the Medium app. (Start with the **test** app.)
2. In the left sidebar, find **Facebook Login for Business**. If it is not listed, click **Add Product** and add it.
3. Under **Facebook Login for Business**, click **Settings**.
4. Find the **Client OAuth settings** panel.
5. Set **Client OAuth login** to **Yes**.
6. Set **Web OAuth login** to **Yes**.
7. Set **Enforce HTTPS** to **Yes**.
8. Set **Embedded Browser OAuth Login** to **Yes**, **Use Strict Mode for redirect URIs** to **Yes**, and **Login with the JavaScript SDK** to **Yes**.
9. In **Allowed domains for the JavaScript SDK** and **Valid OAuth Redirect URIs**, add the domain this app is served from for *this* Meta app — the Vercel preview domain for the test app, the production domain for the live app. Meta: *"Only domains that have enabled HTTPS are supported."* Click **Save changes**.

   ([Implementation][s-impl] establishes steps 4–9 and the exact toggle names.)

> **Why HTTPS matters here:** the client refuses to open the popup on a non-HTTPS page (`connect-whatsapp.tsx` checks `window.location.protocol !== 'https:'`). Local `http://localhost` development cannot exercise this flow at all — that is expected, not a bug.

### Part B — create the new v4 configuration (steps 10–19)

**Do not edit the existing configuration.** Create a new one and leave the old one in place until the new one is proven. If you edit the old one and it goes wrong, there is nothing to fall back to.

10. Still under **Facebook Login for Business**, click **Configurations** in the left sidebar.
11. Note the **existing** configuration's ID and name somewhere safe. You may need to roll back to it.
12. Click **Create configuration**.

    > There is also a **Create from template** button offering a template named **"WhatsApp Embedded Signup Configuration With 60 Expiration Token"**. Either route works; the template pre-fills the common permissions. This guide uses the manual route so every setting is visible and deliberate. ([Implementation][s-impl])

13. **Name** the configuration something you will recognise later and that says which app it belongs to — e.g. `Medium v4 coexistence — TEST` (and `… — PROD` in the live app).
14. For **Login variation**, select **WhatsApp Embedded Signup**. ([Implementation][s-impl]; the [Version 4][s-v4] page words the same field as "Embedded Signup" — pick the option whose label contains "Embedded Signup".)
15. In the **products** selection, tick **Cloud API**. This is required — it is what grants Medium the ability to send and receive messages. ([Version 4][s-v4])
16. Look for a product entry named **WhatsApp Business app user onboarding**. **If it is present as a tickable option, tick it.** ([Version 4][s-v4] lists it under "All other supported products". Whether it appears as a checkbox or is implied is genuinely unclear from the docs — see [Open questions](#open-questions). **Report what you actually see to the developer either way; this is the single most important observation in the whole exercise.**)
17. Do **not** tick anything else. Not Click to WhatsApp Ads, not Click to Messenger, not Conversions API, not Marketing Messages. Meta's own guidance: *"select only those assets and permissions that you will actually need from your business customers."* Every extra product adds a permission that must clear App Review and adds a screen the therapist has to get through. ([Implementation][s-impl])
18. Confirm the **assets** section lists **WhatsApp Business accounts**, and the **permissions** section lists exactly **`whatsapp_business_management`** and **`whatsapp_business_messaging`** — that is the documented asset/permission pair for Cloud API. If the list is longer, go back to step 17 and untick the extra product. ([Version 4][s-v4], "Required assets and permissions")
19. Set the **access token expiration** to the 60-day option if the field is offered (this matches the template name and matches the route handler's 60-day fallback in `app/api/auth/meta-embedded/route.ts`). Save the configuration.

### Part C — copy out the result (step 20)

20. On the **Configurations** list, find the row you just created and **copy its configuration ID** — a long number, typically 15–17 digits. Label it clearly with which Meta app it came from.

**Now repeat steps 1–20 in the second Meta app.** You should finish with two IDs.

### Part D — webhooks and roles (steps 21–24)

21. In the left sidebar go to **WhatsApp** → **Configuration** (webhooks) and confirm the **`whatsapp_business_account`** webhook fields are still subscribed: **`messages`**, **`account_update`**, **`history`**, **`smb_app_state_sync`**, **`smb_message_echoes`**. Coexistence depends on `history`, `smb_app_state_sync` and `smb_message_echoes` — those are what mirror the therapist's existing chats and contacts into Medium. ([Onboard WhatsApp Business app users][s-coex] documents all three webhook payloads.)
22. Go to **App roles** → **Roles** and confirm whoever will run the test is listed as an **Admin** or **Developer**. Only people with a role on the app can test before public release. ([Implementation][s-impl])
23. Optional but recommended: find the **Embedded Signup Builder** (reachable from the Configurations area). Select your new configuration and click **Login with Facebook** to preview the flow without touching Medium's code. ([v4 blog][s-blog])
24. Hand the two configuration IDs to the developer, together with your written answer to step 16.

---

## Status — configurations created 2026-08-14

The operator completed Part B in both Meta apps. These are the new v4
configuration IDs. They are `NEXT_PUBLIC_*` values — public by design, inlined
into the client bundle — so recording them here is not a secret leak.

| Meta app | New v4 configuration ID | Replaces | Target environment |
|---|---|---|---|
| Test | `1017283718025738` | `2044493606274814` | Preview |
| Live | `2608232889596345` | (old live config) | Production |

**Not yet applied.** The env vars still point at the old configurations, and
that is deliberate: a v4 configuration driven by the current v2-era `extras`
(which still sends `featureType` and `sessionInfoVersion`) is untested
territory — see Open question 1. The code change and the ID change must land
together, Preview first.

Sequence from here:

1. Ship the `extras: { setup: {} }` code change (developer).
2. Point **Preview** at `1017283718025738` and redeploy Preview.
3. Run the live phone test below. The pass signal is
   `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`.
4. Only after Preview passes: point **Production** at `2608232889596345` and
   redeploy Production.
5. Leave the old configurations in place until Production is proven, then retire.

## What to hand back to the developer

| Item | Where it goes |
|---|---|
| Test-app configuration ID | `NEXT_PUBLIC_META_CONFIG_ID` in the **Preview** environment |
| Live-app configuration ID | `NEXT_PUBLIC_META_CONFIG_ID` in the **Production** environment |
| Your answer to step 16 (was "WhatsApp Business app user onboarding" a tickable product?) | Decides whether the developer keeps or drops `featureType` in the code |

**Development** does not need this variable. `lib/env/env-vars.ts` marks `NEXT_PUBLIC_META_CONFIG_ID` as `requiredIn: DEPLOYED` (preview + production only), and the settings UI degrades gracefully when it is unset. The task brief's "all three environments" is therefore **two** environments in practice — but they must hold **different** values, because the same file marks the variable `mustDiffer: true`.

> ### Critical: saving the env var is not enough
>
> `NEXT_PUBLIC_*` variables are **inlined into the build artifact at build time**. The repo proved this by experiment (`task-manager/audits/2026-08-13-verification.md`): after building with a sentinel value, the compiled bundle contained the literal string rather than a `process.env` lookup. Changing the value in Vercel and not redeploying changes **nothing**. **Each environment must be redeployed after the variable is updated.**

### Code changes the developer still owes (not the operator's job)

For completeness, so nobody assumes the dashboard work finishes the migration. In `app/(dashboard)/settings/connect-whatsapp.tsx`:

```js
// today (v2-era)
extras: {
  setup: {},
  featureType: 'whatsapp_business_app_onboarding',
  sessionInfoVersion: '3',
}

// v4 per Meta's implementation sample
extras: {
  setup: {},
}
```

The repo's plan claim that `extras` becomes `extras: { setup: {} }` is **verified correct** — that is the literal code sample on [Implementation][s-impl]. The [Versions][s-versions] page words it as the extras object being "purposely empty", which is a trivial wording difference from `setup: {}`; follow the implementation page's sample.

Also worth the developer's attention: the client's message handler currently treats any event starting with `FINISH` as success and reads `phone_number_id` + `waba_id`. Under v4 that is too loose — see the event table below. `FINISH_ONLY_WABA` carries no phone number at all, and the server requires one.

### The complete list of FINISH events and what each means

([Implementation][s-impl])

| Event | What it means for how the therapist connected |
|---|---|
| `FINISH` | Standard Cloud API onboarding completed. Payload carries `phone_number_id` **and** `waba_id`. This is a *new* Cloud API number, **not** coexistence. |
| `FINISH_ONLY_WABA` | Completed **without a phone number** — only a WhatsApp Business Account was shared. Payload has `waba_id` but no `phone_number_id`. Medium cannot message anyone yet. |
| `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` | **This is the coexistence path.** The therapist connected the number already on their WhatsApp Business app. Meta's documented payload for this event carries only `waba_id`; the phone number must be resolved afterwards via `GET /<waba_id>/phone_numbers`. Medium already does this (`resolvePhoneNumberId` in the route handler). |
| `FINISH_OBO_MIGRATION` | Completed an "on-behalf-of" migration — moving a number that another partner previously managed. |
| `FINISH_GRANT_ONLY_API_ACCESS` | Granted API access only, without the full onboarding. |
| `CANCEL` | Abandoned, or the user reported an error. Payload includes `data.current_step` naming the screen they left on (e.g. `BUSINESS_ACCOUNT_SELECTION`, `PHONE_NUMBER_VERIFICATION`). ([Errors][s-errors]) |
| `ERROR` | The therapist hit an error inside the flow. |

**The verification signal to watch for:** a correctly configured coexistence flow returns `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`. If a test connection returns plain `FINISH`, the configuration is **not** doing coexistence — it silently fell back to standard Cloud API onboarding. That is precisely the post-deadline failure mode described at the top of this document, arriving early.

---

## What must be verified afterwards, and on what device

The popup cannot be exercised from a terminal, from `http://localhost`, or from CI. It needs a real HTTPS origin allow-listed in the Meta app, a real Facebook login, and — for coexistence — a real phone.

**You need two devices:**

1. **A desktop or laptop browser**, on the deployed Preview URL (not localhost). Sign into Medium, go to Settings → WhatsApp, click **Connect WhatsApp**.
2. **A physical phone running the WhatsApp Business app, version 2.24.17 or higher**, signed in with a number that is *not* already connected to any Medium account. ([Onboard WhatsApp Business app users][s-coex]) The coexistence flow shows a QR code / confirmation step that must be completed inside the app on that phone. A desktop-only test cannot prove coexistence works.

**Checklist:**

- [ ] The popup opens rather than showing a bare "Sorry, something went wrong". A wrong-but-well-formed configuration ID fails exactly this way, *before* login, with no error code — the repo lost a full session to this on 2026-08-03 (`task-manager/phases/02-whatsapp-integration.md:67`). Configuration IDs are **not** readable through the Graph API, so the only check is comparing the value by eye against the dashboard.
- [ ] The popup offers an option to connect an **existing WhatsApp Business app account/number**. If it only offers to register a new number, coexistence is not configured — go back to step 16.
- [ ] The session event that comes back is **`FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`**, not `FINISH`.
- [ ] The connection row appears in Medium as `active` with `mode = 'coexistence'`.
- [ ] `GET /v25.0/<phone_number_id>?fields=is_on_biz_app,platform_type` returns `"is_on_biz_app": true` and `"platform_type": "CLOUD_API"`. ([Onboard WhatsApp Business app users][s-coex])
- [ ] The therapist's existing chats and contacts begin syncing (the `history` and `smb_app_state_sync` webhooks fire).
- [ ] Only after Preview passes end to end: repeat on Production with the live app's configuration ID, and redeploy Production.

### One thing that is *not* a risk

Medium pins `GRAPH_VERSION = 'v25.0'` (`lib/channels/whatsapp/constants.ts`). **Graph API v25.0 was released 2026-02-18 and is available until 2028-07-29.** The current version is v26.0 (released 2026-07-29). Meta's policy: *"Each version is guaranteed to operate for at least two years. A version will no longer be usable two years after the date that the subsequent version is released."* ([Graph API versions][s-gv], [Versioning policy][s-gver])

Roughly two years of runway. **Do not bump `GRAPH_VERSION` as part of this work** — it is unrelated to the Embedded Signup deadline and would add untested change to a time-boxed migration.

---

## Open questions

These are unresolved *in Meta's documentation itself*. They are stated as questions rather than guessed at, because guessing wrong here is the difference between coexistence working and silently degrading.

> ### ✅ Open question 1 is RESOLVED (2026-08-14)
>
> The operator reports that **"WhatsApp Business app user onboarding" was present
> as a tickable product in the configuration UI, and they ticked it** — in both
> the test and live Meta apps.
>
> That settles it in favour of the [Version 4][s-v4] / [Implementation][s-impl]
> reading: **the configuration carries the coexistence intent, so `featureType`
> is dropped from the code.** The payload becomes exactly `extras: { setup: {} }`.
>
> This was only answerable by looking, because Meta's v4 page points at a
> coexistence-page anchor that Meta has since deleted. Anyone revisiting this
> should trust the observation above over the search-engine snippets, which are
> served from cached older revisions of a page that no longer says any of it.
>
> The fallback in the last paragraph of question 1 still stands as a contingency:
> if the live phone test shows the popup offering only new-number registration,
> re-add `featureType` and retest.

1. ~~**Does `featureType` still need to be sent under a v4 configuration?**~~ **RESOLVED — see above.** Meta's docs contradict themselves.
   - The [Version 4][s-v4] page says: *"Onboarding WhatsApp Business app users continues to be supported through the `feature_type` parameter"* — and links to an anchor `#step-2--customize-embedded-signup` on the coexistence page.
   - **That section no longer exists.** The current live [coexistence page][s-coex] contains no occurrence of `featureType`, `sessionInfoVersion`, `extras`, or `FB.login` at all; its step headings jump from "Step 1: Subscribe to webhooks" straight to "Step 3: Surface Embedded Signup to customers". Meta's own v4 page links to a section Meta deleted.
   - Meanwhile [Versions][s-versions] says v4's extras object is "purposely empty", and [Implementation][s-impl] shows `extras: { setup: {} }` with no `featureType`.
   - **Note also the casing discrepancy:** the v4 page says `feature_type` (snake_case); the older v3 documentation said `featureType` (camelCase); our code sends `featureType`. Nothing states which the v4 popup accepts.
   - **How to resolve:** step 16 above. If "WhatsApp Business app user onboarding" is a tickable product in the configuration UI, the configuration carries the intent and `featureType` should be dropped. If it is not tickable, `featureType` is probably still required in `extras` and should be kept. **The live popup test is the only definitive answer.** The safe sequencing is: test the v4 config with the empty `extras: { setup: {} }` first, and if the popup does not offer the existing-number option, re-add `featureType` and retest.

2. **Does `sessionInfoVersion` still do anything under v4?** It appears nowhere in the current v4 [Implementation][s-impl] or [Versions][s-versions] pages. Web search results still surface it (paired with `featureType`) from what appear to be **cached earlier revisions** of the coexistence page — the live page no longer contains it. Treat any advice sourced from search snippets rather than the live page as stale. Whether leaving it in is harmless or actively forces an older session-payload shape is **unverified**.

3. **What exactly happens to an unmigrated `coex` integration on 2026-10-16?** Meta's blog says deprecated feature types *"will default to the standard embedded signup flow."* Whether that means the popup silently offers Cloud API-only onboarding (the reading assumed throughout this document) or fails outright is **not spelled out**. Either way the migration is required; the difference only affects how loud the failure is.

4. **Do already-connected therapists need to reconnect?** Nothing in Meta's docs addresses whether existing coexistence connections established under v2 keep working after 2026-10-15, or whether only *new* signups are affected. **Unverified.** The conservative reading is that existing access tokens continue to work (they are ordinary Graph tokens) and only the signup popup changes — but this has not been confirmed and should be raised with Meta support if Medium has live therapists before the deadline.

5. **Is `NEXT_PUBLIC_META_CONFIG_ID` verifiable without opening the dashboard?** No. The repo records that `GET /<configId>` returns `GraphMethodException` even with a valid app token. There is currently no way for the app to self-check that its configured ID is the right one — a worthwhile follow-up would be surfacing the configured ID (not just the boolean at `lib/pwa/read-models.ts:603`) somewhere an operator can read it.

---

## Sources

Meta primary sources, all fetched 2026-08-14.

- [Embedded Signup — Overview][s-overview] — establishes what Embedded Signup is, the Business-app/Tech-Provider/Advanced-Access prerequisites, the 10→200 onboarding cap, and carries the "deprecated on October 15, 2026" banner.
- [Embedded Signup — Versions][s-versions] — the authoritative version table: release dates, "available until" dates, and how each version is selected. Establishes that omitting `version` from `extras` means v2, that v4 is selected by the configuration, and that v4's extras object is "purposely empty".
- [Embedded Signup — Version 4][s-v4] — v4's release date (2025-10-08), the exact upgrade sentence ("create a new Facebook Login for Business Configuration… Selecting the products will automatically set you to v4"), the product list split across "Supported products" / "All other supported products", the required assets-and-permissions table, and the contested `feature_type` sentence with its dead anchor link.
- [Embedded Signup — Implementation][s-impl] — the operative source for the click-by-click steps: the six Client OAuth toggles and their exact labels, the Configurations → Create configuration / Create from template flow, the "WhatsApp Embedded Signup Configuration With 60 Expiration Token" template name, the Allowed domains / Valid OAuth redirect URIs requirement, the canonical `FB.login` sample with `extras: { setup: {} }`, the session-info JSON payload, and the complete FINISH/CANCEL/ERROR event table.
- [Onboard WhatsApp Business app users (Coexistence)][s-coex] — coexistence requirements (WhatsApp Business app ≥ 2.24.17, Tech Provider/Solution Partner, session logging), the `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` payload shape, the `is_on_biz_app` / `platform_type` verification call at Graph v25.0, the `history` / `smb_app_state_sync` / `smb_message_echoes` webhook payloads, and the coexistence limitations list. **Confirmed by direct fetch to no longer mention `featureType`, `sessionInfoVersion`, `extras` or `FB.login` anywhere.**
- [Embedded Signup — Version 3][s-v3] — establishes that `featureType: "whatsapp_business_app_onboarding"` was a v3-era key selected alongside `version: 'v3'`, confirming our current payload predates v4.
- [Embedded Signup — Flow Errors][s-errors] — establishes that `CANCEL` carries `data.current_step`; also establishes (by absence) that Meta does not document the "Sorry, something went wrong" wrong-config-ID failure.
- [Embedded signup v4: Upgrade to Meta's streamlined, unified experience][s-blog] (Meta developer blog, 2026-05-14) — **the source for the most important finding in this document.** States that v2 *and v3* deprecate on October 15th, names `only_waba_sharing` / `marketing_messages_lite` / **`coex`** as the three feature types that cannot auto-migrate, states they "will default to the standard embedded signup flow" afterwards, gives the four-step dashboard migration, and describes the Embedded Signup Builder test tool.
- [Graph API — Versions][s-gv] — v25.0 released 2026-02-18, expires 2028-07-29; v26.0 released 2026-07-29 is current.
- [Graph API — Versioning policy][s-gver] — *"Each version is guaranteed to operate for at least two years. A version will no longer be usable two years after the date that the subsequent version is released."*

Secondary sources, used only for corroboration and explicitly **not** relied on for any claim above that Meta does not also state:

- [PPC Land — "Meta's embedded signup v4 is here"][s-ppc] (2026-05-18) — independent write-up of the Meta blog; corroborates the three non-migratable feature types and the dashboard steps.
- [UnifyPort — "WhatsApp Embedded Signup v4 Migration: A Coexistence Checklist"][s-up] (2026-07-16) — practitioner checklist; its warning *"Do not assume that removing every Coexistence-specific setting from an existing launcher will preserve the same flow"* is the reason open question 1 is framed as test-first rather than delete-first.

[s-overview]: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/
[s-versions]: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/versions
[s-v4]: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4
[s-v3]: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-3/
[s-impl]: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation
[s-coex]: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/
[s-errors]: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/errors/
[s-blog]: https://developers.facebook.com/blog/post/2026/05/14/embedded-signup-v4/
[s-gv]: https://developers.facebook.com/docs/graph-api/changelog/versions
[s-gver]: https://developers.facebook.com/docs/graph-api/guides/versioning
[s-ppc]: https://ppc.land/metas-embedded-signup-v4-is-here-but-the-october-15-clock-is-ticking/
[s-up]: https://www.unifyport.ai/blog/whatsapp-embedded-signup-v4-coexistence-migration/
