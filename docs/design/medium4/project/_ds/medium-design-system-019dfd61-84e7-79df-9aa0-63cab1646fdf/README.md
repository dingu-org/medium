# Medium — Design System

**Medium** is an AI assistant that handles appointment communications and bookings for service businesses. It talks to clients autonomously over WhatsApp (and, eventually, Instagram and other chat platforms), and gives the business owner — initially physical therapists, eventually all kinds of independent professionals — a single dashboard to see the calendar, inspect conversations, take over a chat manually, and manage availability.

The brand name **Medium** plays on two ideas: the *medium* through which a business and its clients communicate, and the *happy medium* between full automation and a human touch. The product should feel like a calm, capable colleague — never chatty, never decorative.

## Sources

This design system was generated from a verbal brief — there is no codebase, Figma, or existing brand assets behind it. The directional choices (modern clinical, cool neutrals, restrained type, single deep-blue accent, Albanian sample copy, PT as the canonical persona) come from the project brief on **6 May 2026**.

If/when there is a real codebase or Figma file, this README should be the first thing rewritten — currently it documents an *invented* system, not an observed one.

## Index

| File / folder | What's in it |
|---|---|
| `colors_and_type.css` | All design tokens — colors, type families & scale, spacing, radius, shadow, motion. Single source of truth. Imports the webfonts. |
| `assets/` | Logos (mark, wordmark, inverse) and any imagery. SVG-first. |
| `preview/` | The cards that populate the Design System tab — colors, type specimens, components, etc. Not for production use; visual specimen only. |
| `ui_kits/pwa/` | The manager-facing PWA: calendar, appointment detail, chat takeover, availability. `index.html` is the click-thru. |
| `ui_kits/onboarding/` | The signup / first-run flow for a new practitioner. `index.html` is the click-thru. 5 steps + done. |
| `SKILL.md` | Cross-compatible Skill manifest so this folder works as an Agent Skill in Claude Code or similar. |

### UI kits at a glance

Both kits are **mobile-first** — designed for a 390×844 viewport (iPhone 14/15) and shown inside on-canvas iPhone frames so the layouts can be evaluated at 1× device pixels without a real device.

- **`ui_kits/pwa/`** — `PhoneFrame`, `MobileShell` (`BottomTabs` + `MobileAppBar`), `MobileScreens` (Today, Calendar day-view, Chats list, Chat thread with takeover, Appointment detail, Availability). The `index.html` lays the home-shell screens and pushed detail flows out side-by-side in iPhone frames.
- **`ui_kits/onboarding/`** — `OnboardingShell` (mobile chrome with dotted progress), `OnboardingFields`, `OnboardingSteps` (Welcome, Profile, WhatsApp, Hours, Services, Done). All six steps render in iPhone frames in a horizontal scroller. Shared `Icon.jsx` is borrowed from the PWA kit.

### Mobile-first principles

- **Bottom tab bar** is the spine of the PWA: 5 tabs (Sot · Kalendari · Bisedat · Pacientët · Ti). iOS-friendly safe-area padding (22px bottom). Active tint is brand-500; inactive is neutral. Unread counts ride on the icon as a 16px red dot.
- **Two app-bar variants:** *large title* on top-level destinations (Sot, Bisedat, Disponueshmëria), and *centered title with back chevron* on pushed detail views (Detajet, single chat thread). Pushed views hide the bottom tabs.
- **Touch targets** are 44px minimum. Pills for filters; rounded 6px buttons for primary CTAs; 999px for switches and channel-state chips.
- **Single-hand reach.** Primary actions sit at the bottom of the screen (chat composer, appointment action row); destructive actions get equal weight to neutral ones — never hidden in a menu.

---

## Content Fundamentals

### Voice

Medium speaks like a **calm, competent receptionist** — the kind that's been with the practice for ten years and knows everyone's name. Never salesy, never jokey, never effusive. The AI's job is to make a booking happen with as few words as possible; the dashboard's job is to make the practitioner feel in control.

- **Pronouns:** the AI addresses patients with the formal *Ju* in Albanian (the polite second-person plural), never the informal *ti*. In product UI for practitioners, copy uses the second-person singular *ti* — they're the user, not the customer.
- **Casing:** sentence case everywhere. Never Title Case, never ALL CAPS except for the eyebrow micro-label style and channel-protocol keywords (`CONFIRM`, `ANULO`, `RICAKTO`).
- **Length:** chat messages are at most two short sentences. Empty states are one sentence plus one action. Headings are 1–4 words.
- **No emoji.** Not in product UI, not in chat, not in marketing. The brand earns warmth through pacing and word choice, not symbols.
- **No exclamation marks** in chat. One is permitted in onboarding ("U regjistrove.") if a moment genuinely deserves a pulse — never two in a row.
- **Numbers and times:** 24-hour time (`14:30`), Albanian day names abbreviated (`E hënë`, `E mar.`), dates as `6 maj`. Tabular numerals throughout the dashboard.

### Tone — by surface

| Surface | Tone | Example |
|---|---|---|
| AI → patient (WhatsApp) | Polite, brief, transactional | *"Mirë, ju kam rezervuar të enjten më 8 maj në orën 14:30. A doni një kujtesë një ditë para?"* |
| Patient → AI keywords | Single uppercase verb | `KONFIRMO`, `ANULO`, `RICAKTO`, `NDIHMË` |
| PT dashboard — labels | Nouns, no verbs | "Takime", "Disponueshmëria", "Bisedat" |
| PT dashboard — empty states | Statement + one action | *"Asnjë takim sot. Shiko javën →"* |
| PT dashboard — destructive | Plain, no euphemism | "Anulo takimin" — never "Largo" or "Hiq" |
| Onboarding | Encouraging but quiet | *"Të mbeten dy hapa."* |

### Sample copy snippets

> **Patient (WhatsApp):** Përshëndetje, dua një takim këtë javë.
> **Medium:** Sigurisht. Cili shërbim ju duhet — vlerësim i parë apo seancë vijuese?
> **Patient:** Vijuese.
> **Medium:** Kam të lirë të mërkurën në 10:00 ose të enjten në 14:30. Cila ju shkon?

> **Reminder template (24h):** Kujtesë: keni një takim me Dr. Hoxhën nesër në 14:30. Përgjigjuni `KONFIRMO` për të konfirmuar ose `ANULO` për të anuluar.

### What we never write

- "Hello there!" / "Hey!" / anything with stacked punctuation
- "Awesome!", "Great!", "Perfect!" — affirmation theatre
- "Just a sec…" — the AI never apologizes for time
- Medical advice, opinions, or anything outside booking
- Marketing-speak in the dashboard ("Supercharge your practice")

---

## Visual Foundations

### Color

A **cool neutral spine** carries 95% of the surface area. The brand accent — a single deep clinical blue (`--brand-500: #1F5D86`) — is reserved for primary actions, the active calendar slot, the assistant's avatar dot, and key data. Semantic colors (success / warning / danger / info) appear only in their semantic role; they are never decorative.

Backgrounds are **flat**. No gradients except a single ~3% radial wash behind the auth screen for depth. No imagery fills, no patterns, no textures. The product earns warmth through whitespace and typography, not through paint.

### Type

- **Display** — *Inter Tight* 600, tracking `-0.025em`. Used for h1/h2/h3 and large numerals on the dashboard.
- **Body** — *Inter* 400/500/600, tracking `-0.005em`. Default at 15px.
- **Mono** — *JetBrains Mono* 400/500. Used for keywords (`KONFIRMO`), API-style references, and the chat-thread metadata strip.
- **No serifs anywhere.** No script faces.

The type scale is deliberately compact (12 / 13 / 14 / 15 / 16 / 18 / 20 / 24 / 28 / 32 / 40 / 56). Most of the product lives at 14 and 15px — readability over impact. Hero numerals (today's appointment count, etc.) are the *only* place 40+ pt type is used.

### Spacing & layout

- 4px base, with the working scale `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 80`.
- The dashboard uses an **8px column rhythm** with a 240px sidebar and a 320px right-rail (chat thread). Content centers at a 1120px max width on the marketing-adjacent surfaces; the app itself fills.
- Generous whitespace: cards have `--s-6` (24px) interior padding minimum. Section headers carry `--s-8` (32px) above.

### Borders, radius, elevation

- **Hairlines do most of the work.** `1px solid var(--border-1)` (`#e3e7ed`) is the default separator. Never use box-shadow where a hairline will do.
- **Radius is restrained.** Cards: 10px. Buttons & inputs: 6px. Pills (status chips): 999px. Nothing is more rounded than 14px except pills.
- **Three elevation levels, low spread, near-zero blur on the first layer.**
  - `--sh-1`: hairline + 1px shadow — for resting cards.
  - `--sh-2`: 4–12px blur — for menus and popovers.
  - `--sh-3`: 12–32px blur — for modals only.
  - Focus is a **3px brand-tinted ring** at 18% opacity — never a default browser outline.

### Hover, press, focus

- **Hover** on tappable surfaces: background steps to `--bg-hover` (a 4% darker neutral). Buttons step to a `-1` shade in their own ramp. No size change.
- **Press**: background steps to `--bg-press` (8% darker). Optional 1% scale-down (`scale(0.99)`) on primary CTAs only.
- **Focus**: 3px ring `rgba(31, 93, 134, 0.18)` — visible only on keyboard focus (`:focus-visible`).
- **Disabled**: 40% opacity, no pointer.

### Transparency & blur

- Used only in the mobile sheet backdrop (`rgba(15, 20, 32, 0.4)` + 8px backdrop blur) and the keyboard-shortcut overlay.
- Never on cards, never on chrome. The product is a solid object.

### Imagery

- **Photography:** if used, cool-toned, evenly lit, subjects mid-action. No grain, no warm filters, no stock-tropes (handshakes, headsets). For now there is none in the kit — the brand carries itself on type.
- **Illustration:** none. We do not commission illustration. Empty states use a single muted icon at 32px and one line of copy.

### Animation

- **Snappy, not bouncy.** Cubic ease-out (`cubic-bezier(0.2, 0.7, 0.2, 1)`) for everything entering or moving. Cubic ease-in-out for transforms in place.
- **Durations: 120ms** (state changes — hovers, toggles), **180ms** (sheets, popovers), **280ms** (page-level transitions). Nothing animates longer than 280ms.
- **No spring physics.** No bounce. No looping idle animations.
- Layout shifts cross-fade through opacity; they do not slide.

### Iconography

See the **Iconography** section below.

---

## Iconography

Medium uses **[Lucide](https://lucide.dev/)** at `1.5px` stroke weight, `20px` default size (16px in dense rows, 24px in primary nav). Lucide is loaded from CDN — see `assets/icons.html` for the inventory used in the kits.

- **Stroke only.** Never filled icons. Never duo-tone.
- **No emoji** anywhere in product UI, chat, or marketing.
- **No unicode dingbats** as icons (`✓`, `→`, etc.). The check on a confirmed appointment uses the Lucide `check` glyph; arrows use `arrow-right` / `chevron-right`.
- **Channel marks** (WhatsApp, Instagram) are the brand-true SVG of each platform, never recolored — they identify a third party and must read as such.
- **App icon** is the `M`-mark (see `assets/logo-mark.svg`) — a square `M` over a single sage-green dot, signifying the *medium* channel between two parties. The dot is the only place sage (`#7CC4A8`) appears in the system.

If a future codebase ships its own icon set, this should switch to that set wholesale and these notes should be rewritten.

---

## Caveats

- **Invented system, not observed.** No codebase or Figma was provided.
- **Fonts are Google Fonts** — Inter Tight, Inter, JetBrains Mono. If a real brand font emerges, swap it in `colors_and_type.css` and copy the file into `fonts/`.
- **WhatsApp UI kit was deprioritized** at the user's request — the product is the dashboard and onboarding. Sample chats appear *inside* the dashboard's chat-thread panel.
- **Albanian copy** was written by an assistant, not a native speaker. Have a fluent reviewer pass before shipping anything customer-facing.
