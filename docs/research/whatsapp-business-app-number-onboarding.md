# WhatsApp Business App numbers in Meta Embedded Signup

Research date: 2026-09-04  
Scope: Official Meta and WhatsApp sources only

## Question

Why does Meta Embedded Signup reject a phone number that is already used in the WhatsApp Business mobile app? Shouldn't a number already be a WhatsApp Business number before it can be connected to Medium?

## Short answer

No. In Meta's terminology, a **business phone number** is a phone-number asset that will be associated with a WhatsApp Business Account (WABA) and registered for the WhatsApp Business Platform/Cloud API. It does not need to be registered in the WhatsApp Business mobile app first. The default Embedded Signup flow explicitly asks for a **new business phone number** to associate with the selected WABA, then verifies ownership and returns the number ID so the integrator can register it for Cloud API use. [Meta: Embedded Signup default flow](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/default-flow) · [Meta's official Cloud API Postman collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api)

A number already active in the WhatsApp Business **mobile app** is a special pre-existing state. Meta supports it through a separately configured Embedded Signup variant called **WhatsApp Business app user onboarding**, commonly called **Coexistence**. Meta's general Embedded Signup overview says Business App numbers are supported only when the flow is customized for that onboarding path. [Meta: Embedded Signup overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview#business-customer-phone-number-limits)

Therefore, the strongest explanation for the observed UI and error is that Medium launched the normal Cloud API/new-number flow, not the Coexistence flow. This is an inference from Meta's documented flow behavior, not confirmation of Medium's Meta configuration.

## Medium-specific finding

The repository confirms the likely launch-path error. Medium currently calls
`FB.login` with `extras: { setup: {} }` and explicitly assumes that the v4
Facebook Login for Business configuration carries the Coexistence intent. It
does **not** send `featureType: 'whatsapp_business_app_onboarding'`.
([`connect-whatsapp.tsx`](<../../app/(dashboard)/settings/connect-whatsapp.tsx>))

That assumption conflicts with Meta's current v4 page, which says Coexistence
continues to be supported through the `feature_type` parameter, and with Meta's
current Coexistence setup instructions, which tell the provider to add
`featureType: 'whatsapp_business_app_onboarding'` to the `extras` object. The
exact three-option picker reported in the live test is the expected symptom:
the ordinary Cloud API number-provisioning branch opened instead of the
Business App onboarding branch. [Meta: Embedded Signup v4](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4#all-other-supported-products) · [Meta: configure Business App user onboarding](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users#step-2--customize-embedded-signup)

Medium's downstream implementation is already prepared for a correct
Coexistence completion: it recognizes
`FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`, resolves a number omitted from that
event, and skips the Cloud API `/register` call for Coexistence. The defect is
at popup launch, before those paths run.

## The terms describe different things

| Term | Meaning |
| --- | --- |
| WhatsApp Business App | The mobile app account used directly on a phone. |
| WhatsApp Business Account (WABA) | A Meta business asset that contains Platform assets such as phone numbers and templates. It is not the same as the mobile app. |
| Business phone number / Cloud API number | A phone-number asset associated with a WABA and registered for programmatic WhatsApp messaging. |
| Medium | The Tech Provider/Solution Partner application requesting access to the customer's Meta/WhatsApp assets. |

Meta describes the Business Platform's Cloud API as the programmatic messaging product and the Business Management API as the API for managing WABAs and their associated assets. [Meta: About the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform)

## Why the three choices do not include “register an existing WhatsApp Business number”

The choices **Enter a new phone number**, **Use a display name with a virtual number**, and **Test Number** are ways to provision or choose a number in the ordinary Platform onboarding path. They are not a complete inventory of all WhatsApp onboarding modes.

Meta documents the default Cloud API screen as a **Phone number addition screen** that lets the customer enter a new number to associate with the WABA. By contrast, Meta says a correctly enabled Coexistence configuration gives the customer an option to connect an existing WhatsApp Business App account. In the established flow, this replaces the normal WABA-selection screen; in the v4 Public Preview “Phone Number First” UI, entering an eligible Business App number triggers the Coexistence branch. [Meta: default flow](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/default-flow#phone-number-addition-screen) · [Meta: Business App user onboarding](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users#how-it-works) · [Meta: v4 Public Preview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4-public-preview#coexistence-flow)

The flow shown to a customer is controlled by the provider's Facebook Login for Business configuration and launch parameters. Meta's v4 documentation explicitly says WhatsApp Business App onboarding continues to be enabled through the `feature_type` parameter. [Meta: Embedded Signup v4](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4#all-other-supported-products)

## How Coexistence works

When enabled, Coexistence lets the same number remain usable in the WhatsApp Business App for one-to-one messaging while also being available through Cloud API; WhatsApp keeps supported message history synchronized. The business confirms the connection inside the mobile app and may authorize contact/chat-history synchronization. [Meta: Business App user onboarding](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)

This path is not merely a relabeled normal registration:

- The provider must already be a Meta Solution Partner or Tech Provider, support the required webhooks, and use Embedded Signup session logging. The customer's Business App must be version 2.24.17 or later. [Meta: Coexistence requirements](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users#requirements)
- A successful Coexistence signup emits `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`.
- Meta instructs the provider to **skip the phone-number registration step, as the number is already registered**.
- A successfully onboarded number reports `is_on_biz_app: true` and `platform_type: CLOUD_API`.

All three behaviors are documented in [Meta's Coexistence onboarding steps](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users#onboarding-business-customers).

This also explains the rejection: entering an App-registered number into a normal **new number** branch attempts a fresh Platform association/registration instead of performing the required Coexistence handshake.

## If “already connected” means an existing Platform/WABA registration

There are two materially different “already connected” cases:

1. **Active only in the WhatsApp Business mobile app:** use the Coexistence flow if Medium supports it. The normal new-number path can reject it.
2. **Already a Cloud API/Platform number under a WABA or another provider:** this is an asset access, partner-switch, or phone-number migration case—not Business App Coexistence and not fresh registration.

Meta supports selecting some existing WABAs in Embedded Signup and documents dedicated migration paths for WABAs and numbers. It also warns that WABAs originally created through a developer app cannot be selected or onboarded directly through Embedded Signup. [Meta: Embedded Signup overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview#onboarding-limits) · [Meta: migrate a number between Solution Partners](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/support/migrating-phone-numbers-among-solution-partners-via-embedded-signup) · [Meta: migrate a WABA between Solution Partners](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/support/migrating-wabas-among-solution-partners-via-embedded-signup)

A previous partner's credit line still being shared can also block switching partners, according to Meta's Coexistence limitations. [Meta: Coexistence limitations](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users#limitations)

## Current-version nuance

As of the research date, Meta identifies v4 as the latest Embedded Signup version, says v2 will be deprecated on 2026-10-15, and is rolling a refreshed UI across versions. Exact screen order and wording can therefore differ between configurations and rollouts, but Business App onboarding remains a distinct capability that the provider must enable. [Meta: Embedded Signup versions](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/versions) · [Meta: v4](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4) · [Meta: v4 Public Preview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4-public-preview)

## Recommended next step

Ask Medium specifically:

> Does this Embedded Signup configuration support **WhatsApp Business App user onboarding / Coexistence** for a number currently active in the mobile WhatsApp Business App?

If yes, Medium should launch that configured branch and the UI should offer or trigger the existing-app connection. If no, the safe alternatives are to use a different number that is not currently registered with WhatsApp, or deliberately move the existing number off the mobile app into the Platform-only flow.

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
