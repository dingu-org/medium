import type { ReactNode } from 'react';

export const metadata = {
  title: 'Terms of service · Medium',
  description:
    'Terms for using Medium, the WhatsApp scheduling assistant for practices.',
};

const updatedAt = 'July 14, 2026';

export default function TermsPage() {
  return (
    <article className="space-y-10">
      <header className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Last updated: {updatedAt}
        </p>
        <h1 className="font-heading text-3xl font-medium tracking-normal">
          Terms of service
        </h1>
        <p className="text-muted-foreground text-base leading-7">
          These terms govern access to Medium, a scheduling assistant that helps
          practices manage WhatsApp conversations, appointments, reminders, and
          related dashboard workflows.
        </p>
      </header>

      <TermsSection title="Who may use Medium">
        <p>
          Medium is for practices and business users, not for consumer or
          patient self-service use. You must be allowed to act for the practice
          you register and to connect the WhatsApp Business account you use with
          Medium.
        </p>
      </TermsSection>

      <TermsSection title="Your responsibilities">
        <ul>
          <li>
            Provide accurate account, practice, availability, and WhatsApp
            connection details.
          </li>
          <li>
            Keep your login credentials secure and notify us of unauthorized
            access.
          </li>
          <li>
            Obtain any patient permissions needed to communicate over WhatsApp.
          </li>
          <li>
            Review appointments, conversations, reminders, and escalations for
            your practice.
          </li>
          <li>
            Comply with applicable privacy, healthcare, consumer, and messaging
            laws.
          </li>
        </ul>
      </TermsSection>

      <TermsSection title="WhatsApp and third-party services">
        <p>
          Medium depends on Meta WhatsApp Business APIs, Supabase, Vercel,
          Inngest, OpenRouter, OpenAI, and other infrastructure providers. Your
          use of WhatsApp is also subject to Meta WhatsApp Business terms and
          policies.
        </p>
        <p>
          We are not responsible for outages, review delays, account
          restrictions, template rejections, API changes, or pricing changes
          from third-party providers.
        </p>
      </TermsSection>

      <TermsSection title="AI and clinical limits">
        <p>
          The Medium AI is designed for scheduling workflows only. It must not
          be used for diagnosis, medical advice, emergency triage, legal advice,
          billing disputes, or insurance decisions.
        </p>
        <p>
          You remain responsible for supervising the assistant, keeping a human
          escalation path available, and correcting any incorrect or incomplete
          appointment information.
        </p>
      </TermsSection>

      <TermsSection title="Patient data">
        <p>
          For patient data, the practice is the controller and Medium is the
          processor. You instruct Medium to process patient data only as needed
          to provide the scheduling assistant, dashboard, reminders, support,
          security, retention, and audit-log functions.
        </p>
      </TermsSection>

      <TermsSection title="Service changes and availability">
        <p>
          Medium is an early-stage service. Features may change, be paused, or
          be removed as the product improves or as third-party platform
          requirements change. We aim to keep the service reliable, but we do
          not guarantee uninterrupted availability.
        </p>
      </TermsSection>

      <TermsSection title="Acceptable use">
        <ul>
          <li>
            Do not use Medium for spam, deceptive messaging, harassment, or
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
            Do not use Medium to make emergency, diagnostic, legal, billing, or
            insurance decisions.
          </li>
        </ul>
      </TermsSection>

      <TermsSection title="Plans and fees">
        <p>
          Medium offers a free plan and a paid Solo plan. The Solo plan costs
          2,500 ALL per month or 25,000 ALL per year (two months free),
          VAT-inclusive. The current prices, billing periods, and plan limits
          are shown in the app and may change with notice. You are responsible
          for any additional taxes or third-party charges that apply to your use
          unless a written agreement says otherwise.
        </p>
      </TermsSection>

      <TermsSection title="Prepaid periods and renewals">
        <p>
          Paid plans are prepaid for a fixed period of one month or twelve
          months. This version has no automatic recurring subscription and does
          not charge a saved payment method on its own — to continue after a
          period ends, you pay again for a new period. A purchased plan runs
          until the end of the period you paid for.
        </p>
      </TermsSection>

      <TermsSection title="Cancellation and refunds">
        <p>
          You may stop using a paid plan at any time. Stopping does not refund
          the current period; the plan remains active until the end of the
          period you already paid for. This version does not offer refunds.
        </p>
      </TermsSection>

      <TermsSection title="Expiry, grace, and downgrade">
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
      </TermsSection>

      <TermsSection title="Plan limits">
        <p>
          Each plan includes a monthly limit on the number of conversations and
          the number of reminders. When usage reaches 100% of a limit, the
          assistant stops sending automated replies, sends a single handoff
          message telling the patient that someone will follow up, and flags the
          conversation for review. The practice&apos;s own inbox and manual
          replies are never blocked by these limits.
        </p>
      </TermsSection>

      <TermsSection title="Payments">
        <p>
          Card payments are processed by POK (pokpay.io). Card details are
          entered with POK and never pass through or are stored by Medium.
        </p>
      </TermsSection>

      <TermsSection title="Suspension and termination">
        <p>
          You may stop using Medium at any time. We may suspend or terminate
          access if you breach these terms, create security or legal risk,
          violate WhatsApp policies, or use the product in a way that could harm
          patients, practices, Medium, or third-party platforms.
        </p>
      </TermsSection>

      <TermsSection title="Disclaimers and liability">
        <p>
          Medium is provided as available and without warranties to the fullest
          extent permitted by law. We are not liable for indirect, incidental,
          special, consequential, exemplary, or lost profit damages. Nothing in
          these terms limits liability that cannot legally be limited.
        </p>
      </TermsSection>

      <TermsSection title="Contact">
        <p>Questions about these terms can be sent to klaididingu@gmail.com.</p>
      </TermsSection>
    </article>
  );
}

function TermsSection({
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
