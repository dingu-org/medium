import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const wiredItems = [
  'Next.js App Router scaffold at the repo root',
  'Tailwind 4 plus shadcn UI primitives',
  'Prettier, lint-staged, and Husky pre-commit flow',
  'Placeholder routes for WhatsApp, Meta auth, and Inngest',
];

const manualBlockers = [
  'Meta business app, app review, and system-user token',
  'Supabase, Vercel, Inngest, Anthropic, Sentry, and PostHog accounts',
  'Real environment values for local and hosted deploys',
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-1 bg-[radial-gradient(circle_at_top_left,_rgba(210,227,215,0.75),_transparent_32%),linear-gradient(180deg,_#f7f3ea_0%,_#eef1ed_55%,_#f6f7f4_100%)]">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-10 sm:px-10 lg:px-12">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-5">
            <Badge className="bg-primary/10 text-primary hover:bg-primary/10 rounded-full px-4 py-1">
              Phase 0 bootstrap
            </Badge>
            <div className="space-y-3">
              <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Medium now has the actual scaffold instead of the default
                starter.
              </h1>
              <p className="text-muted-foreground max-w-2xl text-base leading-7 sm:text-lg">
                The repo has the baseline Next.js app, shared UI primitives, env
                contract, and placeholder integration routes that later phases
                will fill in.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="rounded-full px-6">
              <Link href="/api/webhooks/whatsapp">Webhook placeholder</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full bg-white/70 px-6"
            >
              <Link href="/api/inngest">Inngest placeholder</Link>
            </Button>
          </div>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
          <Card className="border-white/70 bg-white/80 shadow-lg shadow-black/5 backdrop-blur">
            <CardHeader>
              <CardTitle>What is wired</CardTitle>
              <CardDescription>
                Local bootstrap work completed in the repo.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground grid gap-3 text-sm sm:grid-cols-2">
              {wiredItems.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </CardContent>
          </Card>

          <Card className="border-white/70 bg-white/72 shadow-lg shadow-black/5 backdrop-blur">
            <CardHeader>
              <CardTitle>Manual blockers</CardTitle>
              <CardDescription>
                Still requires browser-based setup outside the repo.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-2 text-sm">
              {manualBlockers.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </CardContent>
          </Card>

          <Card className="border-white/70 bg-white/72 shadow-lg shadow-black/5 backdrop-blur">
            <CardHeader>
              <CardTitle>Reference docs</CardTitle>
              <CardDescription>
                Planning and architecture remain alongside the app.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-2 text-sm">
              <p>
                <span className="text-foreground font-medium">
                  Task manager:
                </span>{' '}
                <code>task-manager/README.md</code>
              </p>
              <p>
                <span className="text-foreground font-medium">
                  Architecture:
                </span>{' '}
                <code>docs/tech-stack-and-architecture.md</code>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
