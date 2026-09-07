import type { Metadata } from 'next';
import { disclosedAiProviderNames } from '../../privacy/ai-providers';
import { LanguageSwitch, LegalSection } from '../../legal-section';

export const metadata: Metadata = {
  title: 'Terms of service · medium',
  description:
    'Terms for using medium, the WhatsApp scheduling assistant for appointment-based businesses.',
  alternates: {
    canonical: '/en/terms',
    languages: {
      sq: '/terms',
      en: '/en/terms',
      'x-default': '/terms',
    },
  },
};

const updatedAt = 'July 30, 2026';

/** English reading copy of `/terms`, kept for Meta App Review and Business
 * Verification. The Albanian version at `/terms` is the one the practice
 * accepts; both must be edited together. */
export default function EnglishTermsPage() {
  return (
    <article lang="en" className="space-y-10">
      <header className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Last updated: {updatedAt}
        </p>
        <h1 className="font-heading text-3xl font-medium tracking-normal">
          Terms of service
        </h1>
        <p className="text-muted-foreground text-base leading-7">
          These terms govern access to medium, a scheduling assistant that
          helps businesses of any appointment-based profession manage WhatsApp
          conversations, appointments, reminders, and related dashboard
          workflows.
        </p>
        <LanguageSwitch href="/terms" lang="sq" label="Versioni në shqip" />
      </header>

      <LegalSection title="Who may use medium">
        <p>
          medium is for businesses and their staff, not for consumer or
          customer self-service use. You must be allowed to act for the
          business you register and to connect the WhatsApp Business account
          you use with medium.
        </p>
      </LegalSection>

      <LegalSection title="Your responsibilities">
        <ul>
          <li>
            Provide accurate account, business, availability, and WhatsApp
            connection details.
          </li>
          <li>
            Keep your login credentials secure and notify us of unauthorized
            access.
          </li>
          <li>
            Obtain any customer permissions needed to communicate over WhatsApp.
          </li>
          <li>
            Review appointments, conversations, reminders, and escalations for
            your business.
          </li>
          <li>
            Comply with applicable privacy, consumer, messaging, and
            industry-specific laws.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="WhatsApp and third-party services">
        <p>
          medium depends on Meta WhatsApp Business APIs, Supabase, Vercel,
          Inngest, OpenRouter, {disclosedAiProviderNames()}, and other
          infrastructure providers. Your use of WhatsApp is also subject to
          Meta WhatsApp Business terms and policies.
        </p>
        <p>
          We are not responsible for outages, review delays, account
          restrictions, template rejections, API changes, or pricing changes
          from third-party providers.
        </p>
      </LegalSection>

      <LegalSection title="AI and service limits">
        <p>
          The medium AI is designed for scheduling workflows only. It must not
          be used for professional advice specific to your service, emergency
          triage, legal advice, billing disputes, or insurance decisions.
        </p>
        <p>
          You remain responsible for supervising the assistant, keeping a human
          escalation path available, and correcting any incorrect or incomplete
          appointment information.
        </p>
      </LegalSection>

      <LegalSection title="Customer data">
        <p>
          For customer data, the business is the controller and medium is the
          processor. You instruct medium to process customer data only as needed
          to provide the scheduling assistant, dashboard, reminders, support,
          security, retention, and audit-log functions.
        </p>
      </LegalSection>

      <LegalSection title="Service changes and availability">
        <p>
          medium is an early-stage service. Features may change, be paused, or
          be removed as the product improves or as third-party platform
          requirements change. We aim to keep the service reliable, but we do
          not guarantee uninterrupted availability.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <ul>
          <li>
            Do not use medium for spam, deceptive messaging, harassment, or
            unlawful content.
          </li>
          <li>
            Do not attempt to bypass tenant isolation, rate limits,
            authentication, or security controls.
          </li>
          <li>
            Do not upload malware or interfere with the operation of the
            service.
          </li>
          <li>
            Do not use medium to make emergency, professional-advice, legal,
            billing, or insurance decisions.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Plans and fees">
        <p>
          medium offers a free plan and a paid Solo plan. The Solo plan costs
          2,500 ALL per month or 25,000 ALL per year (two months free),
          VAT-inclusive. The current prices, billing periods, and plan limits
          are shown in the app and may change with notice. You are responsible
          for any additional taxes or third-party charges that apply to your use
          unless a written agreement says otherwise.
        </p>
      </LegalSection>

      <LegalSection title="Prepaid periods and renewals">
        <p>
          Paid plans are prepaid for a fixed period of one month or twelve
          months. This version has no automatic recurring subscription and does
          not charge a saved payment method on its own — to continue after a
          period ends, you pay again for a new period. A purchased plan runs
          until the end of the period you paid for.
        </p>
      </LegalSection>

      <LegalSection title="Cancellation and refunds">
        <p>
          You may stop using a paid plan at any time. Stopping does not refund
          the current period; the plan remains active until the end of the
          period you already paid for. This version does not offer refunds.
        </p>
      </LegalSection>

      <LegalSection title="Expiry, grace, and downgrade">
        <p>
          When a paid period ends without renewal, a 3-day grace period keeps
          Solo benefits active. After the grace period, the account is
          automatically downgraded to the free plan.
        </p>
        <p>
          A downgrade deletes no data. If the account has more active services
          than the free plan allows, services beyond that limit are deactivated;
          the oldest active service remains and can be swapped for another.
          Message retention is clamped to the free plan maximum after a further
          30-day grace period following the downgrade.
        </p>
      </LegalSection>

      <LegalSection title="Plan limits">
        <p>
          Each plan includes a monthly limit on the number of conversations and
          the number of reminders. When usage reaches 100% of a limit, the
          assistant stops sending automated replies, sends a single handoff
          message telling the customer that someone will follow up, and flags the
          conversation for review. The business&apos;s own inbox and manual
          replies are never blocked by these limits.
        </p>
      </LegalSection>

      <LegalSection title="Payments">
        <p>
          Card payments are processed by POK (pokpay.io). Card details are
          entered with POK and never pass through or are stored by medium.
        </p>
      </LegalSection>

      <LegalSection title="Suspension and termination">
        <p>
          You may stop using medium at any time. We may suspend or terminate
          access if you breach these terms, create security or legal risk,
          violate WhatsApp policies, or use the product in a way that could harm
          customers, businesses, medium, or third-party platforms.
        </p>
      </LegalSection>

      <LegalSection title="Disclaimers and liability">
        <p>
          medium is provided as available and without warranties to the fullest
          extent permitted by law. We are not liable for indirect, incidental,
          special, consequential, exemplary, or lost profit damages. Nothing in
          these terms limits liability that cannot legally be limited.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>Questions about these terms can be sent to klaididingu@gmail.com.</p>
      </LegalSection>
    </article>
  );
}
