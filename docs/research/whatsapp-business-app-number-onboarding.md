# WhatsApp Business App numbers in Meta Embedded Signup

Research date: 2026-09-04  
Scope: Official Meta and WhatsApp sources only

## Question

Why does Meta Embedded Signup reject a phone number that is already used in the WhatsApp Business mobile app? Shouldn't a number already be a WhatsApp Business number before it can be connected to Medium?

## Short answer

No. In Meta's terminology, a **business phone number** is a phone-number asset that will be associated with a WhatsApp Business Account (WABA) and registered for the WhatsApp Business Platform/Cloud API. It does not need to be registered in the WhatsApp Business mobile app first. The default Embedded Signup flow explicitly asks for a **new business phone number** to associate with the selected WABA, then verifies ownership and returns the number ID so the integrator can register it for Cloud API use. [Meta: Embedded Signup default flow](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/default-flow) · [Meta's official Cloud API Postman collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api)

A number already active in the WhatsApp Business **mobile app** is a special pre-existing state. Meta supports it through a separately configured Embedded Signup variant called **WhatsApp Business app user onboarding**, commonly called **Coexistence**. Meta's general Embedded Signup overview says Business App numbers are supported only when the flow is customized for that onboarding path. [Meta: Embedded Signup overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview#business-customer-phone-number-limits)

The three phone-number choices do not, by themselves, prove that Medium launched
the wrong flow. Meta's v4 Public Preview uses a shared **Phone Number First**
screen and says Coexistence is automatically triggered after the customer enters
an eligible number already in the WhatsApp Business app. Once Medium's
`featureType` selector was restored and the same rejection remained, the focus
shifted from the configuration ID to provider entitlement and number eligibility.
[Meta: v4 Public Preview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4-public-preview#coexistence-flow)

## Medium-specific findings

Medium originally called `FB.login` with only `extras: { setup: {} }`. That
conflicted with Meta's Coexistence instructions, which tell the provider to add
`featureType: 'whatsapp_business_app_onboarding'`. The selector was restored
and deployed to Preview and Production on 2026-09-04, but a live retry produced
the same ordinary number-provisioning flow. [Meta: Embedded Signup v4](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4#all-other-supported-products) · [Meta: configure Business App user onboarding](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users#step-2--customize-embedded-signup)

The follow-up deployment audit established that the active configuration IDs
are `3156974558025510` in Preview and `1970044560354739` in Production. Older
IDs recorded in the repository had been deleted and were therefore stale, not
evidence of a deployment mismatch. Meta's current v4 documentation does not
define a separate configuration-level Coexistence switch: the configuration
selects Cloud API, assets, and permissions, while the launch-time
`featureType` selects Business App onboarding.

- Graph reports both apps' required WhatsApp permissions as `live`, but the
  Preview Meta app has no `whatsapp_business_account` webhook subscription at
  all. Production has the required `account_update`, `messages`, `history`,
  `smb_app_state_sync`, and `smb_message_echoes` fields.
- Neither environment called Medium's `/api/auth/meta-embedded` endpoint during
  the failed retries. The failure is therefore inside Meta's hosted flow, before
  Medium's backend or downstream Coexistence handling runs.

The strongest unresolved requirement is Medium's **provider status**. Meta says
the app owner must already be a Solution Partner or Tech Provider. The repository
still records Business Verification and App Review / advanced access as pending;
if that tracker is current, neither app satisfies this explicit Coexistence
prerequisite. Graph reporting the two WhatsApp permissions as `live` is useful,
but it does not by itself prove that the app's **Use cases → WhatsApp → Tech
Provider onboarding** page considers the provider onboarding complete. This
must be checked in each Meta app. [Meta: Coexistence requirements](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users#requirements) · [Meta: Become a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers)

Medium also implements only part of Meta's session-logging contract. It captures
successful `FINISH*` events, but discards the documented `CANCEL` payload that
contains `current_step`, `error_code`, `error_message`, and `session_id`. This
cannot cause Meta's hosted rejection, but it currently hides the data needed to
identify whether Meta rejected the provider, the number, or an existing asset
relationship. [Meta: Embedded Signup implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation#session-logging-message-event-listener)

The reliable proof is runtime behavior: in the established flow Meta replaces
the normal WABA selection screen with the existing-Business-App path; in the v4
Phone Number First flow, entering an eligible Business App number advances to
its Business profile and QR verification screens. Successful completion emits
`FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`. Before another blind retry, verify
provider onboarding and capture Meta's `WA_EMBEDDED_SIGNUP` `CANCEL` payload.

## The terms describe different things

| Term                                     | Meaning                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| WhatsApp Business App                    | The mobile app account used directly on a phone.                                                                               |
| WhatsApp Business Account (WABA)         | A Meta business asset that contains Platform assets such as phone numbers and templates. It is not the same as the mobile app. |
| Business phone number / Cloud API number | A phone-number asset associated with a WABA and registered for programmatic WhatsApp messaging.                                |
| Medium                                   | The Tech Provider/Solution Partner application requesting access to the customer's Meta/WhatsApp assets.                       |

Meta describes the Business Platform's Cloud API as the programmatic messaging product and the Business Management API as the API for managing WABAs and their associated assets. [Meta: About the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform)

## Why the three choices do not include “register an existing WhatsApp Business number”

The choices **Enter a new phone number**, **Use a display name with a virtual
number**, and **Test Number** are phone-source choices, not a complete inventory
of onboarding modes. In Meta's v4 Phone Number First experience, the customer
enters the existing Business App number through the phone-number entry choice;
Meta then detects the number's state and automatically branches into
Coexistence. There does not have to be a separate “register existing Business
App number” item in this list.

Meta documents the default Cloud API screen as a **Phone number addition
screen** that associates a new number with a WABA. By contrast, its v4 Public
Preview says that entering a number already in the Business App automatically
triggers the Coexistence path. The error after number entry is therefore more
important evidence than the initial three-choice screen. [Meta: default flow](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/default-flow#phone-number-addition-screen) · [Meta: Business App user onboarding](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users#how-it-works) · [Meta: v4 Public Preview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4-public-preview#coexistence-flow)

The flow shown to a customer is controlled by the provider's Facebook Login for Business configuration and launch parameters. Meta's v4 documentation explicitly says WhatsApp Business App onboarding continues to be enabled through the `feature_type` parameter. [Meta: Embedded Signup v4](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4#all-other-supported-products)

## How Coexistence works

When enabled, Coexistence lets the same number remain usable in the WhatsApp Business App for one-to-one messaging while also being available through Cloud API; WhatsApp keeps supported message history synchronized. The business confirms the connection inside the mobile app and may authorize contact/chat-history synchronization. [Meta: Business App user onboarding](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)

This path is not merely a relabeled normal registration:

- The provider must already be a Meta Solution Partner or Tech Provider, support the required webhooks, and use Embedded Signup session logging. The customer's Business App must be version 2.24.17 or later. [Meta: Coexistence requirements](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users#requirements)
- A successful Coexistence signup emits `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`.
- Meta instructs the provider to **skip the phone-number registration step, as the number is already registered**.
- A successfully onboarded number reports `is_on_biz_app: true` and `platform_type: CLOUD_API`.

All three behaviors are documented in [Meta's Coexistence onboarding steps](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users#onboarding-business-customers).

If Meta does not recognize the provider or number as Coexistence-eligible, it
continues treating the entry as a fresh Platform number and reports the existing
registration as a conflict. The exact `CANCEL` error payload is needed to tell
which eligibility check failed.

## If “already connected” means an existing Platform/WABA registration

There are two materially different “already connected” cases:

1. **Active only in the WhatsApp Business mobile app:** use the Coexistence flow if Medium supports it. The normal new-number path can reject it.
2. **Already a Cloud API/Platform number under a WABA or another provider:** this is an asset access, partner-switch, or phone-number migration case—not Business App Coexistence and not fresh registration.

Meta supports selecting some existing WABAs in Embedded Signup and documents dedicated migration paths for WABAs and numbers. It also warns that WABAs originally created through a developer app cannot be selected or onboarded directly through Embedded Signup. [Meta: Embedded Signup overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview#onboarding-limits) · [Meta: migrate a number between Solution Partners](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/support/migrating-phone-numbers-among-solution-partners-via-embedded-signup) · [Meta: migrate a WABA between Solution Partners](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/support/migrating-wabas-among-solution-partners-via-embedded-signup)

A previous partner's credit line still being shared can also block switching partners, according to Meta's Coexistence limitations. [Meta: Coexistence limitations](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users#limitations)

## Current-version nuance

As of the research date, Meta identifies v4 as the latest Embedded Signup version, says v2 will be deprecated on 2026-10-15, and is rolling a refreshed UI across versions. Exact screen order and wording can therefore differ between configurations and rollouts, but Business App onboarding remains a distinct capability that the provider must enable. [Meta: Embedded Signup versions](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/versions) · [Meta: v4](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4) · [Meta: v4 Public Preview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4-public-preview)

## Recommended next step

1. In each Meta app, open **Use cases → WhatsApp → Customize → Tech Provider
   onboarding** and confirm the app is recognized as a completed Tech Provider,
   including Business Verification and App Review for both required WhatsApp
   permissions. Do not infer this from the Facebook Login configuration.
2. Confirm the test phone runs WhatsApp **Business** app 2.24.17+, and that the
   number is not already a Cloud API number, attached to another provider, or
   inside a WABA originally created by a developer app.
3. Add Preview's missing app-level `whatsapp_business_account` webhook fields.
4. Capture the next popup's full `WA_EMBEDDED_SIGNUP` `CANCEL` payload. The error
   code, failed step, and session ID are the decisive evidence and are also what
   Meta Support requests.

Do not delete the mobile WhatsApp account merely to retry before Medium confirms that it does not support Coexistence. WhatsApp describes account deletion as irreversible and says it deletes account information and message history. [WhatsApp Help Center: delete your account](https://faq.whatsapp.com/2138577903196467)

## Primary sources

- [Meta: Embedded Signup overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview)
- [Meta: Embedded Signup default flow](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/default-flow)
- [Meta: Onboard WhatsApp Business App users (Coexistence)](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)
- [Meta: Embedded Signup v4](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4)
- [Meta: v4 Public Preview / Phone Number First](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4-public-preview)
- [Meta: About the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform)
- [Meta's official WhatsApp Cloud API Postman documentation](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api)
- [WhatsApp Help Center: delete your account](https://faq.whatsapp.com/2138577903196467)
