# Medium docs

Medium is an appointment-booking product for small service businesses: an AI assistant handles customers on the business's own WhatsApp number, and the owner supervises from a mobile-first PWA. This page indexes every document in `docs/`, grouped by the question it answers.

Code is the source of truth. Where a document and the code disagree, believe the code and fix the document.

## Start here

Three reading paths cover most reasons to open this directory. Follow one in order rather than browsing the tables below.

| You are                     | Read in this order                                                                                                                                                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A new engineer              | [Product overview](./product/overview.md) → [data model](./features/data-model.md) → [events and background jobs](./features/events-and-background-jobs.md) → [the assistant and conversation engine](./features/assistant-conversation-engine.md) |
| A founder or product reader | [Product overview](./product/overview.md) → [the owner app](./product/owner-app.md) → [billing and plans](./features/billing-and-plans.md)                                                                                                         |
| On call                     | [Runbook](./runbook.md) → [environments](./environments.md) → [events and background jobs](./features/events-and-background-jobs.md) → [observability and admin](./features/observability-and-admin.md)                                            |

## Product

These two documents describe what Medium is and what the person using it sees. Start with the overview whatever you came for.

| Document                                  | Read this to                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [Product overview](./product/overview.md) | Understand the product, its three actors, its vocabulary, and how one conversation becomes a booked appointment     |
| [The owner app](./product/owner-app.md)   | Learn what each of the five tabs shows, what every settings page reads and writes, and how a screen behaves offline |

## Features

Each feature document owns one mechanism end to end and links out for everything else. They are explanation documents except where noted.

| Document                                                                             | Read this to                                                                                                                               |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [Accounts, auth, and onboarding](./features/accounts-auth-onboarding.md)             | Follow sign-up, sign-in, emailed links, the password-recovery gate, session middleware, and the five data-derived onboarding steps         |
| [WhatsApp connection](./features/whatsapp-connection.md)                             | Understand Embedded Signup, connection modes, token encryption, the inbound webhook, the 24-hour service window, templates, and revocation |
| [The assistant and conversation engine](./features/assistant-conversation-engine.md) | See how one inbound message picks exactly one reply, and what the AI turn, its tools, and its prompt can and can't do                      |
| [Human handoff](./features/human-handoff.md)                                         | Follow every path that moves a thread from the assistant to a person, what the customer and owner see, and how a thread comes back         |
| [Appointments and availability](./features/appointments-availability.md)             | Learn how free slots are computed in the account's timezone and how bookings, reschedules, and status changes stay collision-free          |
| [Reminders](./features/reminders.md)                                                 | Trace a reminder from scheduling to send to delivery, and read the Albanian keyword grammar that answers it                                |
| [Notifications](./features/notifications.md)                                         | Find which events reach the owner, as a bell entry or a Web Push, and which per-account toggle gates each one                              |
| [PWA and offline](./features/pwa-offline.md)                                         | Understand the service worker's caching policy, the offline mutation queue, and the server ledger that makes replays exactly-once          |
| [Billing and plans](./features/billing-and-plans.md)                                 | Work through plan limits, conversation-day metering, reminder quota, POK checkout, renewals, and downgrades                                |
| [Events and background jobs](./features/events-and-background-jobs.md)               | Look up any domain event or Inngest function — trigger, schedule, consumer — in one reference (reference)                                  |
| [Data model](./features/data-model.md)                                               | Look up any table, enum, or constraint, and see how tenant isolation is enforced (reference)                                               |
| [Privacy and GDPR](./features/privacy-and-gdpr.md)                                   | Answer a data-subject request: what erasure deletes, what export returns, what retention purges, and what survives on purpose              |
| [Observability and admin](./features/observability-and-admin.md)                     | Read a log line, follow a trace across a webhook and a job, and interpret the admin dashboard and cost rollup                              |

## Operations

These documents tell you how to run and change the deployed system. They own their procedures; the feature documents link here rather than repeating them.

| Document                                                                    | Read this to                                                                                                                                                                    |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Environments](./environments.md)                                           | Learn what development, preview, and production each own, how configuration is verified, and how to run migrations and rollbacks                                                |
| [Runbook](./runbook.md)                                                     | Work the most likely incidents — revoked tokens, stuck jobs, failed sends — as a one-page reference                                                                             |
| [Launch log review](./observability/launch-log-review.md)                   | Run the daily and weekly structured-log review checklist                                                                                                                        |
| [WhatsApp Embedded Signup v4 setup](./whatsapp/embedded-signup-v4-setup.md) | Configure the Meta App Dashboard as an operator (an operator guide with dated, deadline-bound claims — verify against Meta before acting)                                       |
| [Tech stack and architecture](./tech-stack-and-architecture.md)             | See the technical foundation and the reasoning behind each choice (predates the `accounts`/`customers` rename and refers to a product canvas directory that isn't in this repo) |

## Privacy and legal

These support data-protection obligations and customer contracts. The mechanisms behind them are explained in [privacy and GDPR](./features/privacy-and-gdpr.md).

| Document                                 | Read this to                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [Cookie audit](./gdpr/cookie-audit.md)   | Check the grep-verified inventory of every cookie the app sets                                          |
| [Subprocessors](./gdpr/subprocessors.md) | List every third party that processes data, its role, and where it processes                            |
| [DPA template](./gdpr/dpa-template.md)   | Start a data-processing agreement for a business customer that asks for one (draft; needs legal review) |
| [Key rotation](./gdpr/key-rotation.md)   | Rotate `TOKEN_ENCRYPTION_KEY` without breaking a single WhatsApp connection                             |

## Design

One document governs visual consistency in the app shell and components.

| Document                                 | Read this to                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [Spacing spec](./design/spacing-spec.md) | Apply the spacing, control-height, and hit-area values that `app/**` and `components/**` must use |

## Research

Market-validation material for the product, kept for the reasoning behind the plan and pricing decisions.

| Document                                                           | Read this to                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| [Market validation survey](./research/medium-validation-survey.md) | Read the master survey spec both language versions are built from |
| [Survey share kit](./research/survey-share-kit.md)                 | Reuse the ready-to-post copy for distributing the survey          |

## Elsewhere in the repo

Three references live outside `docs/` and are worth knowing about.

| Location                      | Read this to                                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`CONTEXT.md`](../CONTEXT.md) | Get the ubiquitous language for environments — what "borrow", "the train", and "fail closed" mean here                                                               |
| [`README.md`](../README.md)   | Set up the repo and run the commands (its "Current scope" section describes an early scaffold and uses the pre-rename vocabulary)                                    |
| `task-manager/`               | See how the build was planned and sequenced — a historical log, not a description of the system; code wins over anything in `task-manager/phases/*` or `progress.md` |
