# WhatsApp Business App Coexistence requirements audit

Research date: 2026-09-04

Primary authority: the user-supplied export of Meta's [Onboard WhatsApp Business app users](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users) documentation

Implementation reviewed: current `whatsapp/coexistence-onboarding-fix` working tree

## Executive finding

Medium's deployed launch code now asks for the Coexistence branch, and its server-side onboarding logic is mostly aligned with Meta's documented success flow. The continuing failure occurs inside Meta's hosted popup before Medium's callback, so changing the callback cannot fix the present symptom.

The strongest unresolved prerequisite is **provider eligibility**. Meta requires the app owner to already be a Solution Partner or Tech Provider. The repository still says external onboarding is gated on Business Verification and App Review/advanced access. A Graph permission status of `live` does not by itself establish Tech Provider/Solution Partner status. This is the first account-level condition to verify with Meta.

There are also two concrete gaps:

1. Preview has no `whatsapp_business_account` webhook subscription; Production has the required fields. This must be fixed, but it cannot be the common explanation for both environments because Production already satisfies it.
2. Medium discards the popup's `CANCEL` and `ERROR` session events. That hides the Meta error code, message, session ID, and failing step needed to distinguish an app-entitlement problem from a phone-number or portfolio conflict.

Meta's stable Coexistence page gives a runtime test: the ordinary WABA selection experience is replaced by an option to connect the existing WhatsApp Business account. However, Meta's current [v4 Public Preview / Phone Number First](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4-public-preview#coexistence-flow) flow can show the ordinary three-choice phone-number screen first and automatically trigger Coexistence only after the customer enters a number that is already in the Business App. Therefore, seeing **Enter a new phone number / virtual number / Test Number** is not by itself proof of the wrong flow. The stronger failure signal is that entering the eligible Business App number did not transition into Coexistence and instead produced the already-connected rejection. A successful session must ultimately emit `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`.

## Important source caveat

The current Meta page as supplied jumps from **Step 1: Subscribe to webhooks** directly to **Step 3: Surface Embedded Signup**. The Step 2 heading and content are absent. Consequently, this page does not contain the exact launch parameter. Meta's separate [Embedded Signup v4](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4) documentation says Business App user onboarding continues through the `feature_type` parameter, while the previously captured JavaScript-SDK Step 2 sample used camelCase `featureType`. Medium currently sends:

```ts
FB.login(callback, {
  config_id: configId,
  response_type: 'code',
  override_default_response_type: true,
  extras: {
    featureType: 'whatsapp_business_app_onboarding',
    setup: {},
  },
});
```

Evidence: `app/(dashboard)/settings/connect-whatsapp.tsx:168-185`. The source-level regression test protects both `featureType` and the v4 `setup: {}` shape in `app/(dashboard)/settings/__tests__/connect-whatsapp.test.ts:23-35`.

The snake_case wording in the v4 page versus the camelCase JavaScript option is a documentation ambiguity, not proof that the deployed key is wrong. The restored camelCase key matches the prior official SDK sample, and changing it blindly would remove the only selector known to have been accepted by the JS SDK. Capture the session error first.

The absence of Step 2 also explains why the pasted page does not reveal a separate configuration checkbox. It should not be interpreted as evidence that an existing configuration is enabled. Runtime behavior remains the proof, with one version-specific nuance: the stable flow exposes an existing-account screen, while Phone Number First may branch only after number entry.

## Exact prerequisites from Meta

Meta states all of the following:

- The customer must use the **WhatsApp Business app**, version **2.24.17 or higher**.
- The integrator must already be a **Solution Partner or Tech Provider**.
- The integrator must be able to use Cloud API.
- The webhook callback must successfully accept and digest webhooks.
- Embedded Signup must use **session logging**.
- A former partner's still-shared credit line can block switching partners.
- Coexistence numbers have fixed throughput of **20 messages per second**.

Source: [Meta Coexistence requirements and limitations](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users#requirements) (supplied export lines 29-39).

The supplied page does **not** list a country-code restriction. Do not infer one from older or secondary documentation without checking the current Meta eligibility response for the actual number.

## Meta app and configuration requirements

### Facebook Login for Business configuration

For each Meta app/environment, verify the current configuration by exact ID in the dashboard:

- Login variation: WhatsApp Embedded Signup v4.
- Product: Cloud API.
- If the v4 editor exposes it, product/capability: **WhatsApp Business app user onboarding**.
- Asset: WhatsApp Business accounts.
- Permissions: `whatsapp_business_management` and `whatsapp_business_messaging`.
- The deployed origin is allowed for the JavaScript SDK and OAuth flow.

The current IDs are:

| Environment | Current configuration ID | Evidence                              |
| ----------- | ------------------------ | ------------------------------------- |
| Preview     | `3156974558025510`       | Sole current Preview configuration    |
| Production  | `1970044560354739`       | Sole current Production configuration |

The previously recorded v4 IDs were deleted and must not be restored. Meta does not expose these configuration details through the Graph API, so matching the ID and inspecting the dashboard are necessary but not sufficient. The runtime Coexistence transition and finish event remain the definitive proof. Local evidence: `docs/research/whatsapp-business-app-number-onboarding.md:26-32`.

### App-level webhook subscription

Under **App Dashboard → WhatsApp → Configuration**, subscribe the app's `whatsapp_business_account` object to the normal partner fields plus these Coexistence fields:

- `history`
- `smb_app_state_sync`
- `smb_message_echoes`

For Medium, the complete required set is `messages`, `account_update`, `history`, `smb_app_state_sync`, and `smb_message_echoes`. The first two support normal messaging and disconnect lifecycle; the last three are explicitly added by the supplied Coexistence page. Source: [Meta setup Step 1](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users#step-1-subscribe-to-webhooks) (supplied export lines 84-94).

Known state:

- Production subscribes to all five.
- Preview has no `whatsapp_business_account` subscription.

Evidence: `docs/research/whatsapp-business-app-number-onboarding.md:34-37`. This difference is important for Preview after onboarding, but Production's identical popup failure means it is not the sole root cause.

### Provider qualification

This is independent from selecting permissions in a login configuration. Verify in Meta Business Manager / App Dashboard that the business owning each app is actually recognized as a **Tech Provider** or **Solution Partner**, including any required Access Verification and approved advanced access for the two WhatsApp permissions.

Repository state is contradictory and therefore unresolved:

- A live Graph audit reported the two permissions as `live` in both apps.
- `task-manager/progress.md:52,73` and `task-manager/phases/12-pre-launch.md:56` still say Business Verification and App Review/advanced access are pending for external onboarding.

Until the provider status itself is shown as approved, Medium has not demonstrated Meta's explicit Coexistence eligibility requirement.

## Popup/session contract

### Success

Meta's documented Coexistence event is:

```js
{
  data: { waba_id: '<CUSTOMER_WABA_ID>' },
  type: 'WA_EMBEDDED_SIGNUP',
  event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
  version: 3,
}
```

The Coexistence event may carry only `waba_id`. It does not require `phone_number_id` in the event payload. Source: [Meta: onboarding business customers](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users#onboarding-business-customers) (supplied export lines 112-127).

Medium handles this correctly:

- Maps `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` to `coexistence`: `app/(dashboard)/settings/whatsapp-signup.ts:44-50`.
- Allows a Coexistence result without `phone_number_id`: `app/(dashboard)/settings/whatsapp-signup.ts:93-100`.
- Resolves the number from `GET /<waba_id>/phone_numbers`, preferring the unique `is_on_biz_app: true` result: `app/api/auth/meta-embedded/route.ts:151-204`.

### Cancel/error

Embedded Signup session logging also produces `CANCEL` and `ERROR` events. Meta's [Embedded Signup implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation#session-logging-message-event-listener) and [flow errors](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/errors) references define the diagnostic payload. Capture at least:

- `event`
- `data.current_step`
- `data.error_code`
- `data.error_message`
- `data.session_id`

Medium currently returns `null` for every event not starting with `FINISH`, so both `CANCEL` and `ERROR` are lost before any logging or backend request: `app/(dashboard)/settings/whatsapp-signup.ts:72-75`. The existing test explicitly locks in that discard behavior: `app/(dashboard)/settings/__tests__/whatsapp-signup.test.ts:78-85`.

This does not cause the Meta error, but it prevents an evidence-based diagnosis. The diagnostic values should be logged with redaction and surfaced in an operator-readable error report; the session ID should be retained for Meta support.

## Required onboarding and post-onboarding sequence

1. In the stable flow, the customer chooses the existing WhatsApp Business App account path. In Phone Number First, they enter the Business App number and Meta should trigger that path automatically.
2. Customer enters or confirms the Business App number.
3. Meta sends a verification code through the official Facebook Business Account in WhatsApp.
4. Customer taps **Connect**, then **Connect to the Business Platform**, chooses whether to share history, and enters the verification code.
5. Popup returns the exchangeable code and `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` with `waba_id`.
6. Exchange the code and onboard as normal, but **skip the phone-number registration call** because the number is already registered.
7. Subscribe the app to the customer's WABA.
8. Within 24 hours, request both one-time SMB data synchronizations:
   - `POST /<phone_number_id>/smb_app_data` with `sync_type: smb_app_state_sync`
   - `POST /<phone_number_id>/smb_app_data` with `sync_type: history`
9. Store both `request_id` values for support.
10. Digest the `smb_app_state_sync`, `history`, and ongoing `smb_message_echoes` webhooks.
11. Tell the customer synchronization can take minutes, tell them to keep the Business App open, and tell them when it finishes.

Sources: supplied export lines 13-27, 98-110, 127-132, and 157-245 of [Meta's Coexistence page](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users).

Optional post-success verification:

```http
GET /v25.0/<phone_number_id>?fields=is_on_biz_app,platform_type
```

The expected result is `is_on_biz_app: true` and `platform_type: CLOUD_API`. Source: supplied export lines 134-155.

## Requirements matrix

| Requirement                                                                                    | Status                                    | Evidence / action                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WhatsApp Business app ≥ 2.24.17                                                                | Unverified                                | Check the physical phone before another attempt.                                                                                                                                                            |
| Integrator is an approved Tech Provider or Solution Partner                                    | **Unverified, high risk**                 | Explicit Meta requirement; repo still records external App Review/advanced-access gating. Verify provider status, not only permission labels.                                                               |
| Current v4 config IDs deployed                                                                 | Confirmed                                 | Preview `3156974558025510`; Production `1970044560354739`. Old IDs were deleted.                                                                                                                            |
| v4 config includes Cloud API / Business App onboarding capability / WA asset / two permissions | User reports OK; independently unverified | Configuration fields are dashboard-only. Capture screenshots of the exact current IDs and their selected products/assets/permissions.                                                                       |
| Coexistence launch selector                                                                    | Confirmed in source and reported deployed | `featureType: 'whatsapp_business_app_onboarding'` plus `setup: {}` at `connect-whatsapp.tsx:181-184`.                                                                                                       |
| Session logging listener                                                                       | Partial                                   | FINISH events are parsed; CANCEL/ERROR diagnostics are discarded.                                                                                                                                           |
| Runtime Coexistence transition                                                                 | **Failed after number entry**             | The three-choice Phone Number First screen can be normal. The failure is that the entered Business App number did not trigger Coexistence and was rejected as already connected.                            |
| Coexistence finish event                                                                       | Not reached                               | No `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` observed.                                                                                                                                                      |
| Callback reached                                                                               | Not reached                               | No `/api/auth/meta-embedded` request during failed attempts; failure precedes Medium backend.                                                                                                               |
| Webhook callback code digests Coexistence fields                                               | Confirmed, with limitations               | Dispatcher covers `history`, `smb_app_state_sync`, `smb_message_echoes`, `account_update`: `app/api/webhooks/whatsapp/route.ts:91-109`.                                                                     |
| App-level webhook subscriptions                                                                | Production confirmed; **Preview missing** | Add all five fields in Preview.                                                                                                                                                                             |
| Skip phone registration for Coexistence                                                        | Confirmed                                 | `/register` runs only for `cloud_api`: `app/api/auth/meta-embedded/route.ts:96-99`.                                                                                                                         |
| Subscribe customer's WABA                                                                      | Confirmed                                 | `POST /<waba_id>/subscribed_apps`: `app/api/auth/meta-embedded/route.ts:291-294`.                                                                                                                           |
| Resolve WABA-only success payload                                                              | Confirmed                                 | `resolvePhoneNumberId`: `app/api/auth/meta-embedded/route.ts:151-204`.                                                                                                                                      |
| Start contacts and history sync within 24h                                                     | Implemented but retry safety has a gap    | Both calls exist, deadline stored, but request IDs are persisted only after both API calls succeed.                                                                                                         |
| Store sync request IDs                                                                         | Confirmed on clean success                | Stored at `sync-whatsapp-coexistence.ts:74-83`.                                                                                                                                                             |
| Avoid repeating each one-time sync request                                                     | **At risk**                               | If contacts succeeds and history fails, contacts ID is not persisted; retry can repeat the one-time contacts request. Persist each ID immediately after its successful call.                                |
| Enforce the 24-hour sync outcome                                                               | **Missing**                               | A deadline is stored, but no code offboards or raises an operator alert when it expires.                                                                                                                    |
| History declined (`2593109`)                                                                   | Confirmed                                 | Mapped to `history_declined`: `app/api/webhooks/whatsapp/route.ts:624-647`.                                                                                                                                 |
| Mirror ongoing Business App messages                                                           | Partial                                   | Text echoes are stored; non-text echoes are explicitly skipped at `app/api/webhooks/whatsapp/route.ts:859-867`. Meta says each app-sent message must be digested/displayed.                                 |
| Inform user to keep app open and later report completion                                       | **Missing**                               | Success copy says sync is starting, but the settings page neither shows sync progress/completion nor the keep-open instruction.                                                                             |
| Optional `is_on_biz_app` / `platform_type` assertion                                           | Partial                                   | Fields are fetched only while resolving a WABA-only result; there is no post-onboarding assertion/report.                                                                                                   |
| Expected error `131060`                                                                        | Partial                                   | Webhook is acknowledged, but no instruction is surfaced to check the Business App.                                                                                                                          |
| `ACCOUNT_OFFBOARDED` lifecycle                                                                 | **Missing**                               | The supplied page defines this account update, but Medium's handler ignores it because it is not in `DISABLING_ACCOUNT_EVENTS`.                                                                             |
| Coexistence offboarding                                                                        | Mismatched semantics                      | Meta says the customer disconnects Cloud API in Business App → Settings → Account → Business Platform. Medium's Disconnect button only removes the app's WABA subscription and marks its local row revoked. |

## Likely blockers, ranked

### 1. Provider/Access Verification entitlement

This best fits a failure common to Preview and Production after the launch selector was deployed. It is an explicit Coexistence prerequisite, while the repository still records Meta approval as outstanding. Confirm that the business owning each Meta app is approved as a Tech Provider/Solution Partner and that the test user/business is eligible under that setup.

### 2. The current configuration is visually correct but not entitled to activate the product

Products/assets/permissions can look correct without the hosted flow activating Coexistence if provider qualification or rollout/entitlement is missing. The decisive evidence is the transition after entering the Business App number, not the saved-form appearance or the initial three-option Phone Number First screen. If the correct product is selected on the exact current configuration ID and the number still does not trigger Coexistence, open a Meta support request using the documented category **WABiz: Onboarding → TechProvider: Onboarding → Embedded Signup - Coexistence Onboarding** and include the `session_id`.

### 3. Number-specific ineligibility

If the existing-account path appears and the error happens only after entering the number, check:

- WhatsApp Business app version is at least 2.24.17.
- The number is in the WhatsApp Business app, not the consumer app.
- The number is not already a Cloud API number under another WABA/provider.
- The business does not still share a former partner's credit line.
- The selected Meta business portfolio owns or is permitted to onboard the relevant assets.

Only the first and former-credit-line checks are explicit on the supplied page; the others distinguish Coexistence from fresh registration or provider migration.

### 4. Preview webhook configuration

Preview is definitely incomplete and must receive the five fields. It is unlikely to explain Production's pre-callback failure because Production already has them, but leaving it missing prevents a valid Preview end-to-end test and would lose all synchronization events after signup.

## Next evidence-producing test

Before changing more code, make one attempt in each environment with browser devtools open and record:

1. Exact current `config_id` used by `FB.login`.
2. Whether entering the Business App number triggers the Coexistence verification/Business App confirmation branch.
3. The full redacted `WA_EMBEDDED_SIGNUP` event for `CANCEL` or `ERROR`, especially `current_step`, `error_code`, `error_message`, and `session_id`.
4. Whether any request reaches `/api/auth/meta-embedded`.
5. WhatsApp Business app version and whether the number has ever been managed by another Cloud API provider.

Interpretation:

- Three-option Phone Number First screen, then “already connected” with no Coexistence branch: provider/configuration entitlement or number eligibility; use the captured Meta payload to distinguish them.
- Coexistence confirmation branch, then rejection: number/account/portfolio eligibility is more likely.
- `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`, then Medium fails: callback or post-onboarding implementation.

## Operational details to disclose before launch

- Coexistence throughput is fixed at 20 mps.
- Cloud API messages are billed; messages sent from the Business App remain free.
- Business App messages neither create nor extend the Cloud API 24-hour customer-service window.
- On onboarding, all companion devices are unlinked; supported ones may be relinked. WhatsApp for Windows and WearOS are not supported companions in the supplied page.
- Group chats, disappearing/view-once/live-location messages, broadcast lists, calls, and several Business App tools are not mirrored to Cloud API.
- Chat history covers up to 180 days; history webhooks can contain thousands of messages and chunks may arrive out of order. Media IDs arrive only for media from the most recent 14 days.
- `history` error `2593109` means the customer declined history sharing; it is not an onboarding failure.
- Error `131060` is expected in the documented first-message and unsupported-companion cases; tell the business to check the Business App.
- A Coexistence number cannot be offboarded with the Deregister API. The user must disconnect under WhatsApp Business App → Settings → Account → Business Platform.

Source: supplied Meta export lines 37-82, 212-245, 251-264, and 707-810.

## Primary sources

- [Meta: Onboard WhatsApp Business app users](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users) — supplied by the user; primary source for the requirements and lifecycle in this audit. Its current text omits Step 2.
- [Meta: Embedded Signup v4](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4) — v4 configuration and Business App onboarding selector.
- [Meta: Embedded Signup v4 Public Preview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4-public-preview#coexistence-flow) — Phone Number First behavior, where entering an existing Business App number automatically triggers Coexistence.
- [Meta: Embedded Signup implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation) — `FB.login`, response callback, and session logging contract.
- [Meta: Embedded Signup flow errors](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/errors) — cancellation/error diagnostics.
- Medium source files and trackers cited inline — primary evidence for implementation and known deployment/configuration state.
