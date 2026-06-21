import type { ReactNode } from 'react';

export const metadata = {
  title: 'Privacy policy · Medium',
  description:
    'How Medium handles account, patient, WhatsApp, and scheduling data.',
};

const updatedAt = 'June 21, 2026';

export default function PrivacyPolicyPage() {
  return (
    <article className="space-y-10">
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
      </header>

      <PolicySection title="Roles">
        <p>
          Each physical therapist or practice using Medium is the controller for
          their patient data. Medium acts as a processor and handles that data
          under instructions from the practice.
        </p>
        <p>
          For account data about the practice owner, Medium acts as controller
          so we can provide, secure, and support the service.
        </p>
      </PolicySection>

      <PolicySection title="Data we process">
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
            Operational data, such as audit logs, security logs, idempotency
            records, delivery status, and aggregate product metrics.
          </li>
        </ul>
      </PolicySection>

      <PolicySection title="How we use data">
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
      </PolicySection>

      <PolicySection title="AI processing">
        <p>
          Production AI requests are routed through OpenRouter to OpenAI for
          scheduling-related responses. The app sends only the conversation and
          scheduling context needed to answer the patient. The AI is instructed
          not to diagnose, provide medical advice, handle emergencies, or
          discuss legal, billing, or insurance matters.
        </p>
        <p>
          Production requests use privacy controls that request zero data
          retention and deny provider data collection where supported.
          OpenRouter may retain request metadata, and AI processing may involve
          infrastructure outside the European Economic Area.
        </p>
      </PolicySection>

      <PolicySection title="Subprocessors">
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
          <li>OpenRouter and OpenAI for production AI inference.</li>
        </ul>
        <p>We do not sell personal data.</p>
      </PolicySection>

      <PolicySection title="Retention">
        <p>
          Message retention is controlled per practice. The default retention
          period is 90 days, and older messages are purged by a scheduled job.
          Appointment, patient, account, and audit data are kept while needed to
          provide the service, meet legal obligations, resolve disputes, and
          maintain security. Aggregate anonymized metrics may be kept
          indefinitely.
        </p>
      </PolicySection>

      <PolicySection title="Security">
        <p>
          Medium uses tenant-scoped database rules, TLS in transit, encrypted
          WhatsApp access tokens, audit logging for patient-data access, and
          least-privilege application paths. Primary app data is hosted in
          EU-region infrastructure where available.
        </p>
      </PolicySection>

      <PolicySection title="Your choices and rights">
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
      </PolicySection>

      <PolicySection title="Cookies and local storage">
        <p>
          Medium uses authentication cookies, service worker storage, IndexedDB,
          and browser storage needed to keep users signed in, support offline
          dashboard access, queue offline changes, and remember PWA state. The
          current MVP does not use third-party marketing analytics cookies on
          public pages before consent.
        </p>
      </PolicySection>
    </article>
  );
}

function PolicySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-xl font-medium tracking-normal">
        {title}
      </h2>
      <div className="text-muted-foreground space-y-3 text-sm leading-7 [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
    </section>
  );
}
