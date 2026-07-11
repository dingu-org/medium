import {
  Bell,
  CalendarCheck,
  CalendarClock,
  Check,
  Clock3,
  MessageCircle,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LogoMark } from '@/components/ui/logo-mark';
import { WhatsAppMark } from '@/components/ui/whatsapp-mark';

// Demo number used for the "try it on WhatsApp" CTAs — same number referenced
// in the ops runbook (workstream A), copied literally rather than shared.
const WA_NUMBER = '355694005556';
const WA_PREFILL = 'Përshëndetje, dua të provoj Medium.';
const waHref = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(WA_PREFILL)}`;

const steps = [
  {
    num: '01',
    icon: MessageCircle,
    title: 'Pacienti shkruan',
    body: 'Pacienti dërgon një mesazh në WhatsApp, si te çdo bisedë tjetër.',
  },
  {
    num: '02',
    icon: CalendarCheck,
    title: 'Medium përgjigjet dhe rezervon',
    body: 'Asistenti propozon orë të lira, konfirmon takimin dhe e shton në kalendar — vetëm.',
  },
  {
    num: '03',
    icon: ShieldCheck,
    title: 'Ti qëndron në kontroll',
    body: 'Sheh çdo bisedë në panel dhe merr drejtimin kur të duash.',
  },
] as const;

const features = [
  {
    icon: CalendarClock,
    title: 'Rezervim automatik',
    body: 'Medium cakton takime 24 orë në ditë, edhe kur klinika është mbyllur.',
  },
  {
    icon: Users,
    title: 'Merr drejtimin',
    body: 'Hyr në çdo bisedë dhe përgjigju vetë me një prekje.',
  },
  {
    icon: Clock3,
    title: 'Orët e tua, të respektuara',
    body: 'Cakto disponueshmërinë dhe shërbimet; Medium nuk rezervon kurrë jashtë tyre.',
  },
  {
    icon: Bell,
    title: 'Kujtesa automatike',
    body: null,
  },
] as const;

export function LandingPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <SiteHeader />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <WhoItsFor />
        <CtaBand />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="border-line/70 bg-background/95 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Medium">
          <LogoMark size={32} />
          <span className="font-heading text-lg font-semibold tracking-tight">
            Medium
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
      <div className="relative mx-auto grid max-w-5xl items-center gap-12 px-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="max-w-xl">
          <span className="text-[12px] font-bold tracking-[0.08em] text-[var(--brand-500)] uppercase">
            Asistent takimesh për WhatsApp
          </span>
          <h1 className="font-heading mt-4 text-4xl leading-[1.1] font-semibold tracking-tight sm:text-5xl">
            Asistenti që u përgjigjet pacientëve dhe rezervon takimet e tyre.
          </h1>
          <p className="text-ink-2 mt-5 text-lg leading-relaxed">
            Medium bisedon me pacientët tuaj në WhatsApp, cakton takime dhe i
            mban orët tuaja të mbushura — ndërsa ju qëndroni në kontroll.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/sign-up">Fillo tani</Link>
            </Button>
            <Button asChild size="lg" variant="tinted">
              <a href={waHref} target="_blank" rel="noopener noreferrer">
                <WhatsAppMark size={18} />
                Provoje në WhatsApp
              </a>
            </Button>
          </div>
          <p className="text-ink-3 mt-5 flex items-center gap-2 text-sm">
            <Check
              className="h-4 w-4 text-[var(--success-500)]"
              aria-hidden
            />
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

function PhoneMock() {
  return (
    <div
      className="bg-dock w-[280px] rounded-[36px] p-2 shadow-[var(--shadow-dock)]"
      aria-hidden
    >
      <div className="bg-background relative flex h-[560px] flex-col overflow-hidden rounded-[28px]">
        <div className="border-line bg-card flex items-center gap-3 border-b px-4 py-3 pt-7">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-500)]">
            <span className="font-heading text-sm font-semibold text-white">
              M
            </span>
            <span className="bg-sage absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full" />
          </div>
          <div>
            <p className="font-heading text-sm font-semibold">Medium</p>
            <p className="text-xs text-[var(--success-500)]">në linjë</p>
          </div>
          <span className="ml-auto">
            <WhatsAppMark size={18} />
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-2 overflow-hidden p-4">
          <ChatBubble out>Përshëndetje, dua një takim këtë javë.</ChatBubble>
          <ChatBubble>
            Sigurisht. Cili shërbim ju duhet — vlerësim i parë apo seancë
            vijuese?
          </ChatBubble>
          <ChatBubble out>Vijuese.</ChatBubble>
          <ChatBubble>
            Kam të lirë të mërkurën në 10:00 ose të enjten në 14:30. Cila ju
            shkon?
          </ChatBubble>
          <ChatBubble out>Të enjten.</ChatBubble>
          <ChatBubble>
            Mirë, ju kam rezervuar të enjten më 8 maj në orën 14:30.
          </ChatBubble>
        </div>
        <div className="border-line bg-card flex items-center gap-2 border-t px-3 py-3">
          <div className="border-line bg-muted text-ink-3 flex h-8 flex-1 items-center rounded-full border px-3 text-xs">
            Mesazh
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand-500)] text-white">
            <Send className="h-4 w-4" aria-hidden />
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({
  out = false,
  children,
}: {
  out?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        out
          ? 'ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-[var(--brand-500)] px-3 py-1.5 text-[13px] leading-snug text-white'
          : 'border-line bg-card mr-auto max-w-[80%] rounded-2xl rounded-bl-md border px-3 py-1.5 text-[13px] leading-snug'
      }
    >
      {children}
    </div>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="max-w-xl">
          <span className="text-[12px] font-bold tracking-[0.08em] text-[var(--brand-500)] uppercase">
            Si funksionon
          </span>
          <h2 className="font-heading mt-3 text-3xl font-semibold tracking-tight">
            Tre hapa. Pa zakone të reja për të mësuar.
          </h2>
          <p className="text-ink-2 mt-3 text-base">
            Medium qëndron aty ku janë tashmë pacientët tuaj — dhe e bën
            planifikimin në heshtje për ju.
          </p>
        </div>
        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {steps.map((step) => (
            <div key={step.num} className="relative">
              <span className="font-heading text-ink-3 absolute top-0 right-0 text-xs font-semibold tabular-nums">
                {step.num}
              </span>
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brand-50)] text-[var(--brand-500)]">
                <step.icon className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="font-heading text-lg font-semibold">
                {step.title}
              </h3>
              <p className="text-ink-2 mt-1.5 text-sm">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="border-line bg-card border-t border-b">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <div className="max-w-xl">
          <span className="text-[12px] font-bold tracking-[0.08em] text-[var(--brand-500)] uppercase">
            Çfarë bën
          </span>
          <h2 className="font-heading mt-3 text-3xl font-semibold tracking-tight">
            Një koleg i qetë për recepsionin.
          </h2>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="border-line bg-background rounded-2xl border p-6 shadow-[var(--shadow-card)]"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brand-50)] text-[var(--brand-500)]">
                <feature.icon className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="font-heading text-lg font-semibold">
                {feature.title}
              </h3>
              <p className="text-ink-2 mt-1.5 text-sm">
                {feature.body ?? (
                  <>
                    Pacientët marrin një kujtesë një ditë para dhe konfirmojnë
                    me{' '}
                    <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--brand-600)]">
                      KONFIRMO
                    </code>{' '}
                    ose anulojnë me{' '}
                    <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--brand-600)]">
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

function WhoItsFor() {
  return (
    <section className="py-16 text-center sm:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <span className="text-[12px] font-bold tracking-[0.08em] text-[var(--brand-500)] uppercase">
          Për kë është
        </span>
        <h2 className="font-heading mt-3 text-3xl font-semibold tracking-tight">
          Ndërtuar për fizioterapeutët. Po zgjerohet te çdo profesionist i
          pavarur.
        </h2>
        <p className="text-ink-2 mt-5 text-lg leading-relaxed">
          Medium nisi me fizioterapinë, ku çdo takim i humbur ka rëndësi. Më
          pas vjen për këdo që jeton me kalendarin e vet — dentistë, trajnerë,
          konsulentë.
        </p>
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="bg-[var(--brand-600)] py-16 text-white sm:py-24">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-5 px-6 text-center">
        <LogoMark size={40} />
        <h2 className="font-heading max-w-xl text-3xl font-semibold tracking-tight text-white">
          Lëre Medium të mbajë bisedat. Ti mbaj pacientët.
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
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-6 py-10 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2.5">
          <LogoMark size={24} />
          <div>
            <p className="text-ink-2 text-sm">
              Mediumi mes biznesit tënd dhe klientëve të tij.
            </p>
            <p className="text-ink-3 text-xs">© 2026 Medium</p>
          </div>
        </div>
        <div className="text-ink-2 flex gap-4 text-sm">
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
