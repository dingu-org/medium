import {
  Bell,
  CalendarCheck,
  CalendarClock,
  Check,
  CheckCheck,
  Clock3,
  MessageCircle,
  Phone,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { PLANS } from '@/lib/billing/plans';
import { formatLek, t } from '@/lib/i18n';
import { remindersEnabled } from '@/lib/reminders/flag';
import { Button } from '@/components/ui/button';
import { LogoMark } from '@/components/ui/logo-mark';
import { WhatsAppMark } from '@/components/ui/whatsapp-mark';
import { cn } from '@/lib/utils';

// Demo number used for the "try it on WhatsApp" CTAs — same number referenced
// in the ops runbook (workstream A), copied literally rather than shared.
const WA_NUMBER = '355694005556';
const WA_PREFILL = 'Përshëndetje, dua të provoj medium.';
const waHref = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(WA_PREFILL)}`;

const steps = [
  {
    num: '01',
    icon: MessageCircle,
    title: 'Klienti shkruan',
    body: 'Klienti dërgon një mesazh në WhatsApp, si te çdo bisedë tjetër.',
  },
  {
    num: '02',
    icon: CalendarCheck,
    title: 'medium përgjigjet dhe rezervon',
    body: 'Asistenti propozon orë të lira, konfirmon takimin dhe e shton në kalendar — vetëm.',
  },
  {
    num: '03',
    icon: ShieldCheck,
    title: 'Ti qëndron në kontroll',
    body: 'Sheh çdo bisedë në panel dhe merr drejtimin kur të duash.',
  },
] as const;

// `reminders: true` marks the one card that promises the parked feature (see
// lib/reminders/flag.ts). This is the public marketing site, so the card is
// filtered out rather than left advertising something the product will not do —
// it is a stronger claim than the pricing bullet, since it names the KONFIRMO /
// ANULO reply words a customer would try and get no answer to.
const features = [
  {
    icon: CalendarClock,
    title: 'Rezervim automatik',
    body: 'medium cakton takime 24 orë në ditë, pavarësisht orarit tënd.',
    reminders: false,
  },
  {
    icon: Users,
    title: 'Merr drejtimin',
    body: 'Hyr në çdo bisedë dhe përgjigju vetë me një prekje.',
    reminders: false,
  },
  {
    icon: Clock3,
    title: 'Orët e tua, të respektuara',
    body: 'Cakto disponueshmërinë dhe shërbimet; medium nuk rezervon kurrë jashtë tyre.',
    reminders: false,
  },
  {
    icon: Bell,
    title: 'Kujtesa automatike',
    body: null,
    reminders: true,
  },
] as const;

export function LandingPage() {
  return (
    <div className="bg-card text-foreground min-h-dvh">
      <SiteHeader />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <Pricing />
        <WhoItsFor />
        <CtaBand />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="border-line/70 bg-card/95 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 md:px-5">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-3"
          aria-label="medium"
        >
          <LogoMark size={32} />
          <span className="font-heading text-lg font-semibold tracking-tight">
            medium
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/sign-in">Hyr</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/sign-up">Fillo tani</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden py-16 sm:py-24">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(58%_48%_at_72%_4%,var(--brand-50),rgba(255,255,255,0)_70%)]"
        aria-hidden
      />
      <div className="relative mx-auto grid max-w-5xl items-center gap-12 px-4 md:px-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="max-w-xl">
          <span className="text-[12px] font-bold tracking-[0.08em] text-[var(--brand-500)] uppercase">
            Asistent takimesh për WhatsApp
          </span>
          <h1 className="font-heading mt-4 text-4xl leading-[1.1] font-semibold tracking-tight sm:text-5xl">
            Asistenti që u përgjigjet klientëve dhe rezervon takimet e tyre.
          </h1>
          <p className="text-ink-2 mt-5 text-lg leading-relaxed">
            medium bisedon me klientët tuaj në WhatsApp, cakton takime dhe i
            mban orët tuaja të mbushura — ndërsa ju qëndroni në kontroll.
          </p>
          <div className="mt-8 inline-flex flex-col items-stretch gap-3">
            <Button asChild size="lg">
              <Link href="/sign-up">Nis me krijimin e llogarisë</Link>
            </Button>
            <Button asChild size="lg" variant="link">
              <a href={waHref} target="_blank" rel="noopener noreferrer">
                <WhatsAppMark size={18} />
                Më pyet diçka në WhatsApp
              </a>
            </Button>
          </div>
          <p className="text-ink-3 mt-5 flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-[var(--success-500)]" aria-hidden />
            Pa aplikacion për të instaluar. Funksionon brenda WhatsApp-it që
            përdorni tashmë.
          </p>
        </div>
        <div className="flex justify-center">
          <PhoneMock />
        </div>
      </div>
    </section>
  );
}

// Dummy transcript for the phone mockup, styled after the real thread screen
// (components/ui/chat-bubble.tsx, components/chat/status-row.tsx,
// components/chat/composer.tsx) rather than the generic bubbles it replaced.
const mockThread = [
  {
    role: 'customer',
    time: '10:24',
    text: 'Përshëndetje, dua një takim këtë javë.',
  },
  {
    role: 'ai',
    time: '10:24',
    text: 'Sigurisht, Elira! Kam të lira të mërkurën në 10:00 ose të enjten në 14:30. Cila ju shkon?',
  },
  { role: 'customer', time: '10:25', text: 'Të enjten, ju lutem.' },
  {
    role: 'ai',
    time: '10:25',
    text: "Ju rezervova të enjten, 8 maj, ora 14:30. Do t'ju dërgojmë një kujtesë një ditë para.",
  },
  {
    role: 'account',
    time: '10:26',
    text: 'Faleminderit, Elira — shihemi të enjten!',
  },
] as const;

function PhoneMock() {
  return (
    <div
      className="bg-dock w-[280px] rounded-[36px] p-2 shadow-[var(--shadow-dock)]"
      aria-hidden
    >
      <div className="bg-card relative flex h-[600px] flex-col overflow-hidden rounded-[28px]">
        <div className="border-line bg-card flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-50)] text-[12px] font-semibold text-[var(--brand-600)]">
            EK
          </div>
          <p className="font-heading min-w-0 flex-1 truncate text-[14px] font-semibold">
            Elira Krasniqi
          </p>
          <Phone className="text-ink-3 h-[17px] w-[17px] shrink-0" aria-hidden />
        </div>
        <div className="border-line flex h-8 shrink-0 items-center gap-2 border-b bg-[var(--brand-50)] px-4">
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--brand-500)]" />
          <p className="flex-1 truncate text-[11px] font-medium text-[var(--brand-600)]">
            medium po përgjigjet
          </p>
          <div className="flex h-[14px] w-6 shrink-0 items-center rounded-full bg-[var(--brand-500)] p-[2px]">
            <span className="ml-auto h-[10px] w-[10px] rounded-full bg-white" />
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-end gap-2 overflow-hidden px-3 py-3">
          {mockThread.map((message, i) => (
            <MockBubble key={i} {...message} />
          ))}
        </div>
        <div className="border-line bg-card flex items-center gap-2 border-t px-3 py-3">
          <div className="border-line bg-muted text-ink-3 flex h-9 flex-1 items-center rounded-full border px-3 text-xs">
            Shkruaj një mesazh…
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-500)] text-white">
            <Send className="h-4 w-4" aria-hidden />
          </div>
        </div>
      </div>
    </div>
  );
}

function MockBubble({
  role,
  time,
  text,
}: (typeof mockThread)[number]) {
  const mine = role === 'account';
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[82%]">
        {role === 'ai' && (
          <div className="text-primary mb-1 inline-flex items-center gap-1 font-mono text-[10px] font-medium tracking-[0.04em]">
            <span className="bg-sage h-1.5 w-1.5 rounded-full" aria-hidden />
            medium
          </div>
        )}
        <div
          className={cn(
            'rounded-[14px] px-3 py-1.5 text-[12.5px] leading-snug',
            mine && 'bg-primary text-primary-foreground rounded-br-[4px]',
            role === 'ai' &&
              'rounded-bl-[4px] bg-[var(--brand-50)] text-[var(--brand-600)]',
            role === 'customer' &&
              'border-line bg-card rounded-bl-[4px] border',
          )}
        >
          {text}
        </div>
        <div
          className={cn(
            'text-ink-3 mt-0.5 flex items-center gap-1 px-1 font-mono text-[9.5px]',
            mine ? 'justify-end' : 'justify-start',
          )}
        >
          <span>{time}</span>
          {mine && <CheckCheck className="text-primary h-3 w-3" aria-hidden />}
        </div>
      </div>
    </div>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="border-line border-t py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 md:px-5">
        <div className="max-w-xl">
          <span className="text-[12px] font-bold tracking-[0.08em] text-[var(--brand-500)] uppercase">
            Si funksionon
          </span>
          <h2 className="font-heading mt-3 text-3xl font-semibold tracking-tight">
            Tre hapa. Pa zakone të reja për të mësuar.
          </h2>
          <p className="text-ink-2 mt-2 text-base">
            medium qëndron aty ku janë tashmë klientët tuaj — dhe e bën
            planifikimin në heshtje për ju.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((step, i) => (
            <div
              key={step.num}
              className={cn(
                'border-line bg-card relative rounded-2xl border p-5 shadow-[var(--shadow-card)]',
                // Same odd-count handling as Features: full width at the
                // 2-column breakpoint, reset to normal at the 3-up layout.
                steps.length % 2 === 1 &&
                  i === steps.length - 1 &&
                  'sm:col-span-2 lg:col-span-1',
              )}
            >
              <span className="font-heading text-ink-3 absolute top-5 right-5 text-xs font-semibold tabular-nums">
                {step.num}
              </span>
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brand-50)] text-[var(--brand-500)]">
                <step.icon className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="font-heading text-lg font-semibold">
                {step.title}
              </h3>
              <p className="text-ink-2 mt-2 text-sm">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const showReminders = remindersEnabled();
  const shown = features.filter(
    (feature) => showReminders || !feature.reminders,
  );
  return (
    <section className="border-line bg-card border-t border-b">
      <div className="mx-auto max-w-5xl px-4 py-16 sm:py-24 md:px-5">
        <div className="max-w-xl">
          <span className="text-[12px] font-bold tracking-[0.08em] text-[var(--brand-500)] uppercase">
            Çfarë bën
          </span>
          <h2 className="font-heading mt-3 text-3xl font-semibold tracking-tight">
            Një koleg i qetë për recepsionin.
          </h2>
          <p className="text-ink-2 mt-2 text-base">
            Detyrat e vogla që ju zënë kohë çdo ditë, tani kryhen vetë.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((feature, i) => (
            <div
              key={feature.title}
              className={cn(
                'border-line bg-card rounded-2xl border p-5 shadow-[var(--shadow-card)]',
                // Dropping the reminder card leaves an odd count, and a lone
                // half-width card beside an empty cell reads as a broken grid
                // at the sm breakpoint. Let a trailing odd card span the row —
                // reset at lg, where 3 columns fit an odd count evenly.
                shown.length % 2 === 1 &&
                  i === shown.length - 1 &&
                  'sm:col-span-2 lg:col-span-1',
              )}
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brand-50)] text-[var(--brand-500)]">
                <feature.icon className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="font-heading text-lg font-semibold">
                {feature.title}
              </h3>
              <p className="text-ink-2 mt-2 text-sm">
                {feature.body ?? (
                  <>
                    Klientët marrin një kujtesë një ditë para dhe konfirmojnë
                    me{' '}
                    <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em] text-[var(--brand-600)]">
                      KONFIRMO
                    </code>{' '}
                    ose anulojnë me{' '}
                    <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em] text-[var(--brand-600)]">
                      ANULO
                    </code>
                    .
                  </>
                )}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const free = PLANS.free;
  const solo = PLANS.solo;
  // Reminders are parked (lib/reminders/flag.ts). `remindersPerMonth` stays in
  // PLANS as dormant config, but a public price card must not sell an allowance
  // for a feature that will not run.
  const showReminders = remindersEnabled();
  return (
    <section id="pricing" className="py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 md:px-5">
        <div className="max-w-xl">
          <span className="text-[12px] font-bold tracking-[0.08em] text-[var(--brand-500)] uppercase">
            {t.billing.landingEyebrow}
          </span>
          <h2 className="font-heading mt-3 text-3xl font-semibold tracking-tight">
            {t.billing.landingTitle}
          </h2>
          <p className="text-ink-2 mt-2 text-base">{t.billing.landingSub}</p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {/* Falas */}
          <div className="border-line bg-card flex h-full flex-col rounded-2xl border p-5 shadow-[var(--shadow-card)]">
            <h3 className="font-heading text-lg font-semibold">
              {t.billing.planFree}
            </h3>
            <p className="text-ink-3 mt-2 text-sm">
              {t.billing.landingStartFree}
            </p>
            <ul className="text-ink-2 mt-5 flex-1 space-y-2 text-sm">
              <PriceFeature>
                {t.billing.featConversations(free.conversationsPerMonth)}
              </PriceFeature>
              {showReminders && (
                <PriceFeature>
                  {t.billing.featReminders(free.remindersPerMonth)}
                </PriceFeature>
              )}
              <PriceFeature>{t.billing.featOneService}</PriceFeature>
            </ul>
            <Button asChild variant="outline" className="mt-6 w-full">
              <Link href="/sign-up">{t.billing.landingStartFree}</Link>
            </Button>
          </div>

          {/* Solo — favored */}
          <div className="flex h-full flex-col rounded-2xl border-2 border-[var(--brand-500)] bg-[var(--brand-50)] p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-lg font-semibold">
                {t.billing.planSolo}
              </h3>
              <span className="rounded-full bg-[var(--brand-500)] px-2 py-0.5 text-[11px] font-semibold text-white">
                {t.billing.landingSoloTag}
              </span>
            </div>
            {solo.price && (
              <div className="mt-2">
                <p className="font-heading text-2xl font-semibold tabular-nums">
                  {t.billing.priceMonthly(formatLek(solo.price.monthly))}
                </p>
                <p className="text-ink-3 mt-1 text-[13px] tabular-nums">
                  {t.billing.priceYearly(formatLek(solo.price.yearly))} ·{' '}
                  <span className="font-medium text-[var(--brand-600)]">
                    {t.billing.twoMonthsFree}
                  </span>
                </p>
              </div>
            )}
            <ul className="text-ink-2 mt-5 flex-1 space-y-2 text-sm">
              <PriceFeature>
                {t.billing.featConversations(solo.conversationsPerMonth)}
              </PriceFeature>
              {showReminders && (
                <PriceFeature>
                  {t.billing.featReminders(solo.remindersPerMonth)}
                </PriceFeature>
              )}
              <PriceFeature>{t.billing.featUnlimitedServices}</PriceFeature>
              <PriceFeature>{t.billing.featCustomAssistant}</PriceFeature>
              <PriceFeature>{t.billing.featLongRetention}</PriceFeature>
            </ul>
            <Button asChild className="mt-6 w-full">
              <Link href="/sign-up">{t.billing.landingStartFree}</Link>
            </Button>
          </div>

          {/* Dual / Multi — coming soon (muted) */}
          <div className="border-line flex h-full flex-col rounded-2xl border border-dashed p-5 opacity-70">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-ink-2 text-lg font-semibold">
                Dual / Multi
              </h3>
              <span className="border-line text-ink-3 rounded-full border px-2 py-0.5 text-[11px] font-semibold">
                {t.billing.comingSoon}
              </span>
            </div>
            <p className="text-ink-3 mt-2 text-sm leading-6">
              Për biznese me disa profesionistë. Së shpejti.
            </p>
          </div>
        </div>

        <p className="text-ink-3 mt-6 text-center text-[13px]">
          {t.billing.vatNote}
        </p>
      </div>
    </section>
  );
}

function PriceFeature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check
        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-500)]"
        aria-hidden
      />
      <span>{children}</span>
    </li>
  );
}

function WhoItsFor() {
  return (
    <section className="border-line border-t py-16 text-center sm:py-24">
      <div className="mx-auto max-w-3xl px-4 md:px-5">
        <span className="text-[12px] font-bold tracking-[0.08em] text-[var(--brand-500)] uppercase">
          Për kë është
        </span>
        <h2 className="font-heading mt-3 text-3xl font-semibold tracking-tight">
          Për çdo profesionist që punon me takime.
        </h2>
        <p className="text-ink-2 mt-2 text-lg leading-relaxed">
          Fizioterapistë, dentistë, stilistë, trajnerë, konsulentë — nëse dita
          juaj ndahet në takime, medium i mban ato të mbushura pa ju zënë kohën
          pas telefonit.
        </p>
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="bg-[var(--brand-600)] py-16 text-white sm:py-24">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-5 px-4 text-center md:px-5">
        <LogoMark size={40} variant="dark" />
        <h2 className="font-heading max-w-xl text-3xl font-semibold tracking-tight text-white">
          Lëre medium të mbajë bisedat. Ti mbaj klientët.
        </h2>
        <p className="max-w-md text-base text-white/72">
          Nis një bisedë tani dhe shih si e rezervon një takim.
        </p>
        <Button asChild size="lg" variant="outline">
          <Link href="/sign-up">Fillo tani</Link>
        </Button>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-line bg-card border-t">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 py-10 sm:flex-row sm:justify-between md:px-5">
        <div className="flex items-center gap-3">
          <LogoMark size={24} />
          <div>
            <p className="text-ink-2 text-sm">
              mediumi mes biznesit tënd dhe klientëve të tij.
            </p>
            <p className="text-ink-3 text-xs">© 2026 medium</p>
          </div>
        </div>
        <div className="text-ink-2 flex gap-4 text-sm [&>a]:inline-flex [&>a]:min-h-11 [&>a]:items-center">
          <Link href="/privacy" className="hover:text-foreground">
            Politika e privatësisë
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Kushtet e shërbimit
          </Link>
          <Link href="/help" className="hover:text-foreground">
            Ndihmë
          </Link>
        </div>
      </div>
    </footer>
  );
}
