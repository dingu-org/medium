import type { Metadata } from 'next';
import { disclosedAiProviderNames } from '../../privacy/ai-providers';
import { LanguageSwitch, LegalSection } from '../../legal-section';

export const metadata: Metadata = {
  title: 'Privacy policy · Medium',
  description:
    'How Medium handles account, patient, WhatsApp, and scheduling data.',
  alternates: {
    canonical: '/en/privacy',
    languages: { sq: '/privacy', en: '/en/privacy' },
  },
};

const updatedAt = 'July 30, 2026';

/** English reading copy of `/privacy`, kept for Meta App Review and Business
 * Verification. The Albanian version at `/privacy` is the one the practice
 * accepts; both must be edited together. */
export default function EnglishPrivacyPolicyPage() {
  return (
    <article lang="en" className="space-y-10">
      <header className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Last updated: {updatedAt}
        </p>
        <h1 className="font-heading text-3xl font-medium tracking-normal">
          Privacy policy
        </h1>
        <p className="text-muted-foreground text-base leading-7">
          Medium helps physical therapists manage patient conversations and
          appointments over WhatsApp. This policy explains what data we process,
          why we process it, and how privacy requests are handled.
        </p>
        <LanguageSwitch href="/privacy" lang="sq" label="Versioni në shqip" />
      </header>

      <LegalSection title="Roles">
        <p>
          Each physical therapist or practice using Medium is the controller for
          their patient data. Medium acts as a processor and handles that data
          under instructions from the practice.
        </p>
        <p>
          For account data about the practice owner, Medium acts as controller
          so we can provide, secure, and support the service.
        </p>
      </LegalSection>

      <LegalSection title="Data we process">
        <ul>
          <li>
            Account data, such as email address, practice name, timezone, and
            product settings.
          </li>
          <li>
            WhatsApp connection data, such as phone number identifiers, WhatsApp
            Business account identifiers, encrypted access tokens, quality
            status, and template status.
          </li>
          <li>
            Patient and appointment data, such as names, phone numbers,
            conversations, messages, appointment times, appointment status,
            notes, and reminder responses.
          </li>
          <li>
            PWA and device data, such as push subscription endpoints, service
            worker state, and locally cached dashboard data used for offline
            access.
          </li>
          <li>
            Billing and subscription data, such as the selected plan, billing
            period, expiry and renewal dates, payment status, POK order
            identifiers, amounts, and receipts. Medium does not store card
            numbers, CVV codes, or other cardholder data — those are handled
            directly by POK.
          </li>
          <li>
            Operational data, such as audit logs, security logs, idempotency
            records, delivery status, and aggregate product metrics.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="How we use data">
        <ul>
          <li>To authenticate users and keep tenant data separated.</li>
          <li>To receive, send, and display WhatsApp conversations.</li>
          <li>
            To book, reschedule, cancel, remind, and confirm appointments.
          </li>
          <li>
            To let the practice review chats, take over conversations, and
            manage availability.
          </li>
          <li>
            To run AI-assisted scheduling and route conversations to a human
            when needed.
          </li>
          <li>
            To secure the service, detect failures, prevent duplicate
            processing, and maintain audit logs.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="AI processing">
        <p>
          Production AI requests are routed through OpenRouter to{' '}
          {disclosedAiProviderNames()} for scheduling-related responses, and any
          of them may serve a given request. The app sends only the conversation
          and scheduling context needed to answer the patient. The AI is
          instructed not to diagnose, provide medical advice, handle
          emergencies, or discuss legal, billing, or insurance matters.
        </p>
        <p>
          Production requests use privacy controls that request zero data
          retention and deny provider data collection where supported.
          OpenRouter may retain request metadata, and AI processing may involve
          infrastructure outside the European Economic Area.
        </p>
      </LegalSection>

      <LegalSection title="Payments">
        <p>
          POK (pokpay.io) processes card payments for paid plans. Card details
          are entered with POK and are never received or stored by Medium.
          Medium stores only the order reference, amount, currency, status, and
          period returned by POK — the information needed to activate or renew
          the plan and to show receipts.
        </p>
      </LegalSection>

      <LegalSection title="Subprocessors">
        <p>
          Medium relies on a small set of service providers to operate the
          product:
        </p>
        <ul>
          <li>Supabase for Postgres, authentication, and realtime data.</li>
          <li>Vercel for hosting the Next.js app and server functions.</li>
          <li>
            Inngest for background jobs, retries, and scheduled reminders.
          </li>
          <li>
            Meta and WhatsApp for message delivery and WhatsApp Business account
            integration.
          </li>
          <li>
            OpenRouter, with {disclosedAiProviderNames()} as the upstream model
            providers, for production AI inference.
          </li>
          <li>
            POK (pokpay.io), operated by Nebula, as the payment processor for
            card payments.
          </li>
        </ul>
        <p>We do not sell personal data.</p>
      </LegalSection>

      <LegalSection title="Retention">
        <p>
          Message retention is controlled per practice. The default retention
          period is 90 days, and older messages are purged by a scheduled job.
          Appointment, patient, account, and audit data are kept while needed to
          provide the service, meet legal obligations, resolve disputes, and
          maintain security. Aggregate anonymized metrics may be kept
          indefinitely.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          Medium uses tenant-scoped database rules, TLS in transit, encrypted
          WhatsApp access tokens, audit logging for patient-data access, and
          least-privilege application paths. Primary app data is hosted in
          EU-region infrastructure where available.
        </p>
      </LegalSection>

      <LegalSection title="Your choices and rights">
        <p>
          Practices can update account and retention settings in the dashboard.
          Patients should first contact their practice for access, correction,
          deletion, or objection requests because the practice controls the
          patient relationship.
        </p>
        <p>
          Privacy requests can also be sent to klaididingu@gmail.com. During
          early access, export and deletion requests may be handled manually
          while product workflows are completed.
        </p>
      </LegalSection>

      <LegalSection title="Cookies and local storage">
        <p>
          Medium uses authentication cookies, service worker storage, IndexedDB,
          and browser storage needed to keep users signed in, support offline
          dashboard access, queue offline changes, and remember PWA state. The
          current MVP does not use third-party marketing analytics cookies on
          public pages before consent.
        </p>
      </LegalSection>
    </article>
  );
}
