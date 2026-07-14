# Survey build guide — Tally (fallback: Google Forms)

How to turn [medium-validation-survey.md](./medium-validation-survey.md) into two live forms (Albanian + English) with channel attribution. Aim: ~15 minutes to build.

## Why Tally

- Free, **unlimited responses** and questions.
- **Conditional logic** (needed for the pricing branch).
- **Hidden fields** populated from the URL — gives us per-channel attribution.
- Clean mobile UX, no login required for respondents, one-click **CSV / Google Sheets export**.

Google Forms works too (see the fallback at the bottom) but is uglier, has clunkier logic, and needs a Google account to build.

---

## Build steps (Albanian form first)

1. **Create the form.** Tally → **New form** → start blank. Title: `Medium — pyetësor për profesionistët`.
2. **Add the intro** as a *Text block* (not a question) using the SQ intro copy. Turn the **progress bar on** (form settings).
3. **Add each question** in order from the spec. Field-type mapping:

| Spec question | Tally block | Settings |
|---|---|---|
| Q1 Profession | Multiple choice | Required. Last option "Tjetër" → enable **"Add 'Other' option"** |
| Q2 How you work | Multiple choice | Required |
| Q3 Appts/week | Multiple choice | Required |
| Q4 How clients book | **Checkboxes** | Required (multi-select) |
| Q5 WhatsApp usage | Multiple choice | Required |
| Q6 Lost bookings | Multiple choice | Required |
| Q7 Headaches | **Checkboxes** | Required. Set **max selections = 2** |
| Q8 Interest | **Linear scale** | 1–5, labels "Aspak" → "Shumë" |
| Q9 Would use | Multiple choice | Required |
| Q10 Valuable parts | **Checkboxes** | Required. Set **max selections = 3** |
| Q11 Concerns | **Checkboxes** | Required |
| Q12 Would pay | Multiple choice | Required |
| Q13–Q16 Price points | Multiple choice ×4 | Each uses the identical **Lek ladder** |
| Q17 Pay model | Multiple choice | Required |
| Q18 Requests | **Long text** | Optional |
| Q19 Early access | Short text | Optional |
| Q19 consent | **Checkbox** (single) | Optional |

4. **Section breaks.** Use Tally *Page breaks* between the 5 sections so it feels like short steps, not a wall. Put the **concept blurb** (SQ) as a Text block at the top of the Section 3 page.
5. **Pricing branch (conditional logic).** On Q12, add logic:
   - If **"Vetëm nëse është falas"** → **Skip to Q18** (jump past all pricing).
   - Otherwise continue to Q13.
   This keeps free-only respondents from answering price questions that don't apply.
6. **Hidden field for attribution.** Form settings → **Hidden fields** → add one named `source`. Tally auto-fills it from `?source=...` in the URL. It's stored on every response.
7. **End screen.** Set the "Thank you" page to the SQ end-screen copy.
8. **Publish**, copy the base share URL (e.g. `https://tally.so/r/abc123`).

### English form
Duplicate the Albanian form (Tally → form menu → **Duplicate**), then swap every label to the EN column from the spec. Same structure, same logic, same `source` hidden field. Publish → second URL (e.g. `https://tally.so/r/xyz789`).

> Alternative if you'd rather maintain **one link**: build a single form with each label written as `SQ / EN` on two lines. Cleaner to share, slightly noisier to read. The two-form approach is recommended — pick one and stay consistent.

---

## Attribution: tagged share links

Append `?source=<channel>` to the base URL per place you post. Tally records it in the `source` hidden field so you can see which channel converts.

| Channel | Example link (Albanian form) |
|---|---|
| Facebook PT group | `https://tally.so/r/abc123?source=fb-pt-group` |
| Instagram bio/story | `https://tally.so/r/abc123?source=ig` |
| WhatsApp broadcast | `https://tally.so/r/abc123?source=wa` |
| Personal DMs | `https://tally.so/r/abc123?source=dm` |
| Dentist group | `https://tally.so/r/abc123?source=fb-dentist` |
| Reddit / forums (EN form) | `https://tally.so/r/xyz789?source=reddit` |

Keep `source` values short and consistent. The share-kit file has post copy pre-tagged — just paste your real base URL in.

---

## Reading the results

- **Would-use rate:** Q9 "Po" share, segmented by Q1 profession — tells you which beachhead is hottest.
- **Value ranking:** Q10 selection counts → what to lead with in marketing/onboarding.
- **Willingness to pay:** Q12 "Po/Ndoshta" share.
- **Van Westendorp Price Sensitivity Meter:** export CSV, plot cumulative curves of Q13–Q16. The intersection of "too cheap" and "too expensive" curves ≈ the acceptable price band; "bargain" × "getting expensive" ≈ the optimal price point. Even a rough read on the Lek bands beats guessing.
- **Objections:** Q11 → address the top one or two directly in your pitch.
- **Leads:** Q19 contacts → your early-adopter / beta list.

---

## Google Forms fallback

If you'd rather use Google Forms:
- Multi-select → **Checkboxes**; single → **Multiple choice**; Q8 → **Linear scale (1–5)**; Q18 → **Paragraph**; Q19 → **Short answer** + a separate **Checkboxes** consent.
- Max-selection caps (Q7=2, Q10=3): Forms can't hard-limit, so add "(choose up to N)" to the label and enforce softly.
- Branching (Q12): use **"Go to section based on answer"** — send "Only if it's free" to the requests section.
- Attribution: Forms has **no hidden URL fields**. Either make separate copies per channel, or prefill a "Where did you find this?" question. (This is the main reason Tally wins here.)
- Export: responses → **Link to Sheets**.
