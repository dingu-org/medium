# Medium — Market Validation Survey (master spec)

Single source of truth for the survey. Both the **Albanian (sq)** and **English (en)** forms are built from this file. Deep version: ~16 questions + optional contact, ~5 min, mostly single-tap on mobile.

**Goal:** discover whether target professionals would use Medium, whether they'd pay, how much (Van Westendorp price sensitivity), what they value most, and what they'd request.

**Respondent:** the professional (the buyer) — physiotherapists first, plus dentists, trainers, and other appointment-driven solo professionals.

---

## Form settings

- **Title (sq):** Medium — pyetësor për profesionistët
- **Title (en):** Medium — a survey for independent professionals
- **Hidden field:** `source` — populated from the URL query string (`?source=...`) so every response is traceable to the channel it came from. See the build guide for the link scheme.
- **Anonymous:** yes, unless the respondent leaves contact details in the last question.
- **Progress bar:** on.
- **Branching:** the pricing questions (Q13–Q17) are shown **only if Q12 is "Yes" or "Maybe"** (skip for "Only if it's free").

---

## Intro (shown first)

**EN:**
> **Help shape Medium — 5 minutes, anonymous.**
> Medium is a new assistant that talks to your clients on WhatsApp and books their appointments for you. We're deciding what to build and how to price it — and your honest answers decide it. There are no right answers. Your responses are anonymous unless you choose to leave your contact at the end.

**SQ:**
> **Ndihmo të formësojmë Medium — 5 minuta, anonim.**
> Medium është një asistent i ri që bisedon me klientët e tu në WhatsApp dhe u rezervon takimet për ty. Po vendosim çfarë të ndërtojmë dhe si ta çmojmë — dhe përgjigjet e tua të sinqerta e vendosin. S'ka përgjigje të gabuara. Përgjigjet janë anonime, përveçse nëse zgjedh të lësh kontaktin në fund.

---

## Section 1 — You & your work / Ti dhe puna jote

### Q1. Profession *(single choice, required)*
- **EN:** What's your profession?
- **SQ:** Cili është profesioni yt?

| EN | SQ |
|---|---|
| Physiotherapist | Fizioterapeut |
| Dentist | Dentist |
| Personal trainer | Trajner personal |
| Beauty & aesthetics | Estetist / bukuri |
| Psychologist or therapist | Psikolog ose terapist |
| Nutritionist | Nutricionist |
| Consultant or coach | Konsulent ose coach |
| Other (specify) | Tjetër (specifiko) |

### Q2. How do you work? *(single choice, required)*
- **EN:** How do you work?  ·  **SQ:** Si punon?

| EN | SQ |
|---|---|
| Solo | Vetëm |
| Small team (2–5) | Ekip i vogël (2–5) |
| Clinic (6+) | Klinikë (6+) |

### Q3. Appointments per week *(single choice, required)*
- **EN:** About how many appointments do you have per week?  ·  **SQ:** Sa takime ke rreth për javë?

| EN | SQ |
|---|---|
| Under 10 | Nën 10 |
| 10–25 | 10–25 |
| 26–50 | 26–50 |
| 50+ | 50+ |

### Q4. How clients book today *(multi-select, required)*
- **EN:** How do clients book with you today? (select all that apply)
- **SQ:** Si i rezervojnë klientët takimet me ty tani? (zgjidh të gjitha që vlejnë)

| EN | SQ |
|---|---|
| WhatsApp — I reply myself | WhatsApp — përgjigjem vetë |
| Phone calls | Telefonata |
| In person | Personalisht, në vend |
| Instagram or Facebook DM | Mesazhe në Instagram ose Facebook |
| A booking app or website | Një aplikacion ose faqe rezervimi |
| A receptionist or assistant | Recepsionist ose asistent |
| Other | Tjetër |

### Q5. WhatsApp usage today *(single choice, required)*
- **EN:** Do you use WhatsApp to talk with clients today?  ·  **SQ:** E përdor WhatsApp-in për të folur me klientët sot?

| EN | SQ |
|---|---|
| Yes, every day | Po, çdo ditë |
| Sometimes | Ndonjëherë |
| No | Jo |

---

## Section 2 — Your scheduling pain / Sfidat me takimet

### Q6. Lost bookings *(single choice, required)*
- **EN:** How often do you lose a booking or client because you couldn't reply in time?
- **SQ:** Sa shpesh humbet një takim ose klient sepse s'arrite të përgjigjeshe në kohë?

| EN | SQ |
|---|---|
| Often | Shpesh |
| Sometimes | Ndonjëherë |
| Rarely | Rrallë |
| Never | Kurrë |

### Q7. Biggest headaches *(multi-select, max 2, required)*
- **EN:** What are your biggest headaches with appointments? (choose up to 2)
- **SQ:** Cilat janë sfidat më të mëdha me takimet? (zgjidh deri në 2)

| EN | SQ |
|---|---|
| Replying after working hours | Të përgjigjesh jashtë orarit |
| No-shows (clients who don't turn up) | Klientë që s'paraqiten |
| Back-and-forth to find a time | Shkëmbimi i mesazheve për të gjetur një orë |
| Double-bookings | Mbivendosje orësh (takime të dyfishta) |
| Sending reminders | Dërgimi i kujtesave |
| Filling last-minute cancellations | Mbushja e anulimeve në minutën e fundit |
| Other | Tjetër |

---

## Section 3 — The idea / Ideja

**Concept blurb (shown above Q8):**

- **EN:** *Imagine an assistant that chats with your clients on WhatsApp, answers their questions, offers your free time slots, and books the appointment into your calendar — automatically, 24/7, even after hours. You see every conversation and can take over anytime.*
- **SQ:** *Imagjino një asistent që bisedon me klientët e tu në WhatsApp, u përgjigjet pyetjeve, u ofron oraret e tua të lira dhe e rezervon takimin në kalendar — vetvetiu, 24/7, edhe jashtë orarit. Ti sheh çdo bisedë dhe merr drejtimin kur të duash.*

### Q8. Interest *(linear scale 1–5, required)*
- **EN:** How interested are you in something like this? (1 = not at all, 5 = very interested)
- **SQ:** Sa i interesuar je për diçka të tillë? (1 = aspak, 5 = shumë i interesuar)

### Q9. Would you use it *(single choice, required)* — **core intent**
- **EN:** Would you actually use it in your practice?  ·  **SQ:** A do ta përdorje vërtet në praktikën tënde?

| EN | SQ |
|---|---|
| Yes | Po |
| Maybe | Ndoshta |
| No | Jo |

### Q10. Most valuable parts *(multi-select, max 3, required)*
- **EN:** Which parts would be most valuable to you? (choose up to 3)
- **SQ:** Cilat pjesë do të ishin më të vlefshme për ty? (zgjidh deri në 3)

| EN | SQ |
|---|---|
| Replies to clients 24/7 | U përgjigjet klientëve 24/7 |
| Books straight into your calendar | I rezervon takimet direkt në kalendarin tënd |
| Reminders that cut no-shows | Kujtesa që ulin mungesat |
| You can take over any chat anytime | Merr drejtimin e çdo bisede kur të duash |
| Works inside WhatsApp (clients install nothing) | Punon brenda WhatsApp-it (klientët s'instalojnë asgjë) |
| Never books outside your hours & services | Nuk rezervon kurrë jashtë orarit e shërbimeve të tua |
| Client list + calendar in one app | Lista e klientëve + kalendari në një aplikacion |

### Q11. Concerns *(multi-select, required)*
- **EN:** Any concerns about an AI answering your clients? (select all that apply)
- **SQ:** A ke shqetësime që një AI t'u përgjigjet klientëve? (zgjidh të gjitha që vlejnë)

| EN | SQ |
|---|---|
| It might make mistakes | Mund të bëjë gabime |
| Clients prefer a human | Klientët preferojnë një njeri |
| Privacy of client data | Privatësia e të dhënave të klientëve |
| Losing the personal touch | Humbja e kontaktit personal |
| Sounds hard to set up | Duket e vështirë për t'u konfiguruar |
| No concerns | Pa shqetësime |
| Other | Tjetër |

---

## Section 4 — Pricing / Çmimi

> **Branching:** show Q13–Q17 only if Q12 = "Yes" or "Maybe".

### Q12. Would you pay? *(single choice, required)*
- **EN:** Would you pay for a tool like this?  ·  **SQ:** A do të paguaje për një mjet të tillë?

| EN | SQ |
|---|---|
| Yes | Po |
| Maybe, if it proves its value | Ndoshta, nëse e provon vlerën |
| Only if it's free | Vetëm nëse është falas |

**The Lek price ladder (used identically on Q13–Q16):**

| EN | SQ |
|---|---|
| Up to 500 Lekë (≈ €5) | Deri në 500 Lekë (≈ €5) |
| 501–1,000 Lekë | 501–1.000 Lekë |
| 1,001–2,000 Lekë | 1.001–2.000 Lekë |
| 2,001–3,500 Lekë | 2.001–3.500 Lekë |
| 3,501–5,000 Lekë | 3.501–5.000 Lekë |
| Over 5,000 Lekë (≈ €50+) | Mbi 5.000 Lekë (≈ €50+) |

### Q13. (Too cheap) *(single choice — Lek ladder)* — **optional, drop for higher completion**
- **EN:** At what monthly price would it be so cheap that you'd doubt it really works?
- **SQ:** Në çfarë çmimi mujor do të ishte aq lirë sa të dyshoje se vërtet funksionon?

### Q14. (Bargain) *(single choice — Lek ladder)* — **optional, drop for higher completion**
- **EN:** At what monthly price would it feel like a great deal?
- **SQ:** Në çfarë çmimi mujor do të të dukej një ofertë shumë e mirë?

### Q15. (Getting expensive) *(single choice — Lek ladder)*
- **EN:** At what monthly price would it start to feel expensive, but still worth considering?
- **SQ:** Në çfarë çmimi mujor do të fillonte të dukej i shtrenjtë, por ende ia vlen ta mendosh?

### Q16. (Too expensive) *(single choice — Lek ladder)*
- **EN:** At what monthly price would it be too expensive to consider?
- **SQ:** Në çfarë çmimi mujor do të ishte tepër i shtrenjtë për ta marrë parasysh?

> **Van Westendorp note:** Q13–Q16 are the four classic price-sensitivity questions. Together they produce a Price Sensitivity Meter (optimal price point + acceptable range). Q13/Q14 (the low-end pair) add length for less founder value — **drop them if completion rate matters more than a full PSM**, keeping only Q15/Q16 (the ceiling) plus the direct Q12.

### Q17. Preferred way to pay *(single choice, required)*
- **EN:** How would you prefer to pay?  ·  **SQ:** Si do të preferoje të paguaje?

| EN | SQ |
|---|---|
| Monthly | Mujore |
| Yearly (if cheaper) | Vjetore (nëse më lirë) |
| Per booking | Për çdo rezervim |
| One-time | Një herë |
| Not sure | S'e di |

---

## Section 5 — Requests & contact / Kërkesa dhe kontakt

### Q18. Special requests *(long text, optional)*
- **EN:** What would make this a must-have for you? Any special requests?
- **SQ:** Çfarë do ta bënte këtë të domosdoshme për ty? Ndonjë kërkesë e veçantë?

### Q19. Early access *(short text + consent checkbox, optional)*
- **EN:** Want early access or to be a test user? Leave your WhatsApp number or email.
- **SQ:** Dëshiron akses të hershëm ose të jesh përdorues testues? Lër numrin e WhatsApp ose email-in.
- **Consent checkbox — EN:** I agree to be contacted about Medium.
- **Consent checkbox — SQ:** Pranoj të kontaktohem në lidhje me Medium.

---

## End screen / Ekrani i fundit

- **EN:** Thank you 🙏 Your answers go straight to the team building Medium. If you left your contact, we'll reach out when early access opens.
- **SQ:** Faleminderit 🙏 Përgjigjet e tua shkojnë direkt te ekipi që ndërton Medium. Nëse le kontaktin, do të të shkruajmë kur të hapet aksesi i hershëm.

---

## Question → goal map (design rationale)

| Q | Founder goal it serves |
|---|---|
| Q1–Q3 | Segmentation — which professions/scale respond, validate expansion beyond PTs |
| Q4–Q5 | Fit — is WhatsApp already their channel (product's core assumption) |
| Q6–Q7 | Problem validation — is the pain Medium solves real and felt |
| Q8–Q9 | **Would they use it** (interest + hard intent) |
| Q10 | **How they value the services** (feature prioritization) |
| Q11 | Objections to pre-empt in messaging/onboarding |
| Q12 | **Are they willing to pay** |
| Q13–Q16 | **How much** — Van Westendorp price point |
| Q17 | Billing model preference |
| Q18 | **Special requests** (open) |
| Q19 | Waitlist / early-adopter capture |
