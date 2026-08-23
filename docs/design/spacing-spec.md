# Medium — Apple HIG spacing spec

> Adopted 2026-08-23. This is the source of truth for spacing in `app/**` and `components/**`.
> New UI must use these values; a deviation needs a code comment saying why.
> Derived from a full 134-file audit against Apple HIG (8pt grid, 16pt margins, 44pt targets).

Scope: `app/**` and `components/**` `.tsx` only. Radii, colours, typography, shadows, icon/decoration
sizes are OUT OF SCOPE and must not change. Every edit below is a padding / margin / gap / control-height
/ hit-area change.

## D. Decision table

| # | Decision | Value / mechanism | Owner file | Supersedes |
|---|---|---|---|---|
| D1 | Screen edge margin | **16px (`px-4`) on every screen at every width.** No 20px step is introduced: every app container is `max-w-md` (448) so the ≥744px branch would never render inside the app; legal/landing get `md:px-5` only where their container really exceeds 744. | `components/dashboard/dashboard-chrome.tsx` (top-level), each pushed screen's content wrapper | auth `px-7`, landing `px-6`, pushed-screen `px-5`, dock `px-3.5`, row `px-[18px]`, `error.tsx` `px-6`, `global-error` 24px |
| D2 | Who owns the margin | **Top-level screens: `main` pads `px-4`. Pushed screens: `main` does NOT pad horizontally; the screen's own content wrapper carries `px-4` and `NavBar` keeps its `px-4`.** All 11 `-mx-4 -mt-4` negation wrappers are deleted. | `dashboard-chrome.tsx:102-104` | the "chrome pads everything + NavBar drops px-4" variant proposed by shared-components (nav-bar.tsx:31) |
| D3 | Pushed-screen wrapper | **one string: `px-4 pt-2 pb-4`** (services gets it too; chat-thread and its loading skeleton stay full-bleed flex columns with no wrapper padding) | 10 screen files | `pt-1/pt-4`, `pb-4/6/7/8` |
| D4 | Card inner padding | **`p-4` (16) regular, `p-5` (20) hero/featured only** (PlanCard, WAHero + its whatsapp/page twin, landing marketing cards, revoked hero, `today-client.tsx:105` quiet card keeps `py-5`) | every card | 12 / 14 / 15 / 18 / 20 / 24 mixtures |
| D5 | Stacked-card gap | **12–16; use `space-y-3` (12) for card lists, `gap-4` for grids** | — | `space-y-[11px]`, `gap-5` |
| D6 | List row | **`min-h-11 … gap-3 px-4 py-3`** — row inset == layout margin; separators inset to `px-4` | `components/ui/grouped-list.tsx:110/25` | `min-h-[46px]`, `px-[18px]`, `px-3.5`, `gap-[13px]`, `py-[13px]/[11px]/[14px]` |
| D7 | Section / group rhythm | **24px (`space-y-6`, `mb-6`) between groups on one screen; 8px (`pb-2`) section-header→first row; 8px heading→body; 12–16 paragraph gap** | — | `space-y-4/5/[18px]`, `mb-5/7`, `mt-3/5` heading→body |
| D8 | Row title→subtitle | **4px (`mt-1`) everywhere.** 1/2/3/5px variants all snap up; 2px stays only for true icon/glyph nudges. | — | `mt-px`, `mt-0.5` (text), `mt-[3px]`, `mt-[5px]`, `mb-[3px]` |
| D9 | Field & primary-CTA height | **48px.** `Input` → `h-12`; `Button` `default` → `h-12 gap-2 px-5` (pills ≥20 horizontal); `lg` becomes an alias of `default` (48) so existing `size="lg"` call sites are untouched; `SelectTrigger` default → `h-12`, sm → `h-11`; the native `<select>` on calendar-fab → `h-12`. | `components/ui/{input,button,select}.tsx` | Input 50, Button default 44, Select 40, WhatsApp CTA 52, `h-[50px]` overrides, and **all 14 per-call-site `size="lg"` findings** |
| D10 | Small buttons | **`sm`/`xs`/`icon-sm`/`icon-xs` keep their visual size and gain a pseudo-element hit expansion to ≥44** in the primitive. | `components/ui/button.tsx:31-36` | **all 13 per-call-site `size="sm"` → `size="default"` findings** (appointment-sheet ×3, pwa-provider ×5, client-detail, assistant-identity, onboarding skip, landing ×2) |
| D11 | Bare text links / text buttons | one recipe: **`inline-flex min-h-11 items-center px-2`**, plus negative margins (`-my-3` / `-mr-2`) only where the surrounding line rhythm must not grow. | — | four hand-rolled variants |
| D12 | Dock geometry | pill `p-2` + items `h-12 w-12` = **64px pill**; nav `px-4 pt-2 pb-[max(16px,env(safe-area-inset-bottom))]` → dock block = `8 + 64 + max(16, inset)` = 88 / 106px | `components/dashboard/bottom-nav.tsx` | `px-3.5`, `p-1.5`, `h-[52px]`, dot `top-[11px] right-[11px]` |
| D13 | Content bottom reserve above the dock | **one derived expression, `calc(6rem+max(16px,env(safe-area-inset-bottom)))`** = dock block + 24px breathing (112 at inset 0, 130 at 34). Used verbatim by `main`'s top-level `pb-…`, the calendar FAB's `bottom-…`, and the toaster's offset. Not registered as a `@theme` token because two of the three uses are not Tailwind spacing slots. | `dashboard-chrome.tsx:103`, `calendar-fab.tsx:56`, `sonner.tsx:13` | `pb-28`, `bottom-28`, sonner's 16px default offset |
| D14 | Content top reserve | TopHeader is **sticky**, NavBar is **in flow** — no height reserve is needed. The safe-area top inset is owned in exactly two places: `TopHeader` (`pt-[calc(0.75rem+env(safe-area-inset-top))]`) for top-level screens and `main`'s pushed branch (`pt-[env(safe-area-inset-top)]`). | `top-header.tsx:35`, `dashboard-chrome.tsx:103` | per-screen top insets |
| D15 | Safe areas | **`viewportFit: 'cover'` in `app/layout.tsx`** — prerequisite; ships in the same change as D13, the SheetContent inset and the toaster offset. `SheetContent` carries the bottom/top inset; the 4 per-call-site `pb-[calc(1rem+env(...))]` copies drop the `env()` term to `pb-4`. | `app/layout.tsx:47`, `components/ui/sheet.tsx:66` | 6 per-call-site implementations |
| D16 | Full-height surfaces | **`min-h-dvh`** on every root; `100vh`→`100dvh`, `60vh`→`60dvh` | 7 files | `min-h-screen` |
| D17 | Header primitives title→description | **8px (`gap-2`)** across Card / Dialog / Sheet / Popover headers | — | 4 / 2 / 2 |
| D18 | Chips & dot+label clusters | dot→label **4px (`gap-1`)**; token→token **8px (`gap-2`)**; chip padding on-grid (`px-2`/`px-3`, `py-1`) | — | `gap-[5px]`, `gap-[7px]`, `gap-1.5`, `py-[5px]`, `pr-[11px]`, `px-2.5` |
| D19 | Container width | **`max-w-md` (448)** on auth and onboarding, matching the dashboard, so the content edge is 16 on every phone | `(auth)/layout.tsx:15`, `onboarding/page.tsx:148` | `max-w-sm` |
| D20 | No new `@theme` tokens | Every off-scale literal is snapped to an existing Tailwind step. 18/15/14/13/11/10/9/7/5/3 are retired, never registered. | — | — |

## Conflicts resolved

1. **primitives vs screens on `size="sm"` / `size="lg"`** — fixed once at the primitive (D9, D10); 27 per-call-site
   findings dropped. `assistant-identity.tsx:108`, `appointment-sheet.tsx:278/402/428`, `pwa-provider.tsx:335/343/394/427/474`,
   `client-detail.tsx:199`, `onboarding/page.tsx:286`, `landing-page.tsx:97/100` keep `size="sm"`;
   `forgot-password/form.tsx:40`, `reset-password/form.tsx:49`, `sign-in/form.tsx:96`, `sign-up/form.tsx:43`,
   `onboarding/page.tsx:64/168/252/271/277`, `landing-page.tsx:344/383`, `calendar-fab.tsx:205/439` keep the default size.
2. **Input 50 vs Button 44** — both become 48 (D9); `new-client-form.tsx:95`'s `h-[50px]` override and
   `calendar-fab.tsx:425`'s `h-10` select both resolve to the same 48.
3. **who owns the pushed-screen margin** — shared-components proposed chrome-pads-everything + NavBar loses `px-4`;
   settings/dashboard groups proposed screens keep `px-4`. Resolved in favour of D2 (chrome pads only top-level)
   because chat-thread and its loading skeleton are genuinely full-bleed (edge-to-edge notice/status separators) and
   would otherwise need a re-introduced negation. Consequence: `nav-bar.tsx:31` keeps `px-4` (only `h-[60px]`→`h-16`
   is applied), and `dashboard-chrome.tsx:103` drops `px-4 pt-4` from the pushed branch.
4. **chat composer vs dock** — they are never on screen together (composer is on a pushed screen, dock on top-level),
   so no z/offset conflict; both simply sit on the 16px margin line and both carry the bottom inset.
5. **title→subtitle 2 vs 4** — 4 wins (D8); the settings group's `mt-[3px]`→`mt-0.5` proposals are re-pointed to `mt-1`,
   and the existing text `mt-0.5` sites are swept to `mt-1` in the same change.
6. **grouped-list eyebrow `px-2` vs row `px-4`** — eyebrow and footer move to `px-4` (D6) so header, rows and footer
   share one text line; `section-label.tsx:17` follows.
7. **empty-state top offset (40/56/56/64) and Today's hand-rolled empty state** — one value, `pt-14` (56), and Today's
   container snaps to `<EmptyState>`'s `px-6 py-10`.
8. **AppBanner / notice strip padding** — one value: `px-4 py-3` with `min-h-11` where the strip hosts a control.

## Findings dropped

- 27 per-call-site button-size findings (D9/D10 above).
- `nav-bar.tsx:31` `px-4` removal (conflict 3); the `h-[60px]`→`h-16` half survives.
- `dashboard-chrome.tsx:103` "`topLevel ? 'pt-2 pb-28' : 'pb-6'`" — replaced by the D2/D13/D14 form.
- `chat-list.tsx:166` `pt-16`→`pt-14` kept, but the *proposed* value in the calendar week finding (`pt-10`→`pt-14`) is
  the same decision, merged into D7.
- `legal/layout.tsx:14/46/48` `md:px-5` — kept (those containers really do exceed 744px), but `max-w-4xl`→`max-w-3xl`
  is kept only for header and footer so all three share the article's line.
- Duplicate reports of the same line across groups (`grouped-list.tsx:110` vs `today-client.tsx:368`;
  `assistant-card.tsx:29-30` vs `device-push-card.tsx:73`; `wa-hero.tsx:17` vs `whatsapp/page.tsx:70`;
  `status-row.tsx:49` vs `chat/loading.tsx:27`) are each assigned to exactly one plan, in the group that owns the file.

## Tiers kept as filed

- **release-blocker (2):** `chat-thread.tsx:615` composer reserve; `calendar-client.tsx:158` week list under the FAB.
- **fix-this-sprint:** margins, sub-44 targets on primary screens, safe-area/viewport work, the primitive height/hit-area changes.
- **backlog:** off-grid values with no visible consequence (chips, nudges, marketing page).
