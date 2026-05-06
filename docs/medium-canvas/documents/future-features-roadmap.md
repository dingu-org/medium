# Future features roadmap

This document outlines features beyond MVP to guide architectural decisions. Building for future expansion without over-engineering the first version.

---

## Post-MVP priorities (V2)

### Instagram integration

**Why:** Unique differentiator - no competitor offers Instagram booking. Younger patient demographic uses Instagram more than WhatsApp.

**User flow:**
- Patient sends DM to PT's Instagram business account
- AI handles conversation same as WhatsApp
- Appointment books into same calendar
- PT sees channel indicator (Instagram icon) in chat view

**Key differences from WhatsApp:**
- Cannot send reminders after 24h window (Instagram has no template messages)
- Solution: Capture phone number during booking, send reminders via WhatsApp or SMS
- Instagram API is free (no per-message cost)
- Same Meta Business account and webhook infrastructure

**Architecture implications:**
- Need `channel` field on messages and conversations
- Webhook handler routes Instagram events to same conversation engine
- Template reminder system skips Instagram-only conversations (or switches to SMS)
- Chat interface shows channel source icon

**V2 scope:**
- Instagram webhook integration
- Dual-channel patient profiles (Instagram handle + phone number)
- Channel switching for reminders
- Channel analytics (which channel books more?)

---

### Facebook Messenger integration

**Why:** Completes the Meta platform coverage. Some PTs have Facebook Business Pages patients already message.

**Similar to Instagram:**
- Free API
- Same Meta account
- Can use Marketing Messages API for reminders (paid)
- Same conversation logic

**Lower priority than Instagram** because fewer patients initiate contact via Facebook Messenger for local services compared to Instagram DMs.

**V2 or V3 depending on demand.**

---

### Waitlist management

**Why:** Research showed PTs struggle when no available slots match patient request. Waitlist lets PT fill cancellations efficiently.

**User flow:**

Patient: "Do you have anything tomorrow morning?"

AI (no slots): "I don't have any morning slots available tomorrow. Would you like me to add you to the waitlist? I'll notify you immediately if a morning slot opens up."

Patient: "Yes"

AI: "You're on the waitlist for morning appointments. I'll message you as soon as one becomes available."

**When slot opens (patient cancels):**
- System identifies waitlisted patients matching that time slot
- Sends message to first person on waitlist: "A slot just opened up: Tomorrow at 9:00 AM. Would you like to book it? Reply YES to claim it."
- First to reply gets the slot
- Others get notified: "That slot was just filled. You're still on the waitlist and I'll notify you when another becomes available."

**PT dashboard:**
- Shows waitlist count on calendar view
- PT can manually notify waitlisted patients
- PT can see who's on waitlist for what timeframe

**Architecture implications:**
- `waitlist` table: patient_id, requested_timeframe, priority, created_at
- Background job monitors for cancellations and matches against waitlist
- Notification system triggers WhatsApp messages to waitlisted patients

**V2 priority** - this directly addresses the no-show problem by helping fill cancelled slots.

---

### Multi-location scheduling

**Why:** Research validated this as pain point for mobile PTs who work across cities/clinics on different days.

**User flow:**

PT sets up multiple locations:
- Location A: Monday, Wednesday, Friday
- Location B: Tuesday, Thursday

When patient books:

AI: "I have availability this week:

**[Location A - City Center]**
- Wednesday at 2:00 PM
- Friday at 10:00 AM

**[Location B - North Clinic]**
- Thursday at 3:00 PM

Which location and time work best for you?"

Patient selects → Appointment booked at specific location

Reminder includes location address.

**PT dashboard:**
- Calendar view can filter by location
- Different colors per location (optional)
- Availability settings per location

**Architecture implications:**
- `locations` table: PT can configure multiple locations
- `availability` table links to location_id
- `appointments` table includes location_id
- AI availability logic filters by location + day of week

**V2-V3 priority** - important for specific customer segment (mobile PTs) but not universal pain point.

---

## V3 and beyond

### Recurring appointments

**Why:** Some patients need weekly or bi-weekly appointments (e.g., ongoing rehab, chronic pain management).

**User flow:**

During booking:

AI: "Would you like to book a single appointment or set up recurring appointments?"

Patient: "Recurring, weekly"

AI: "I can book you for every Tuesday at 2:00 PM for the next 4 weeks. Does that work?"

Patient confirms → 4 appointments booked at once

**PT dashboard:**
- Recurring appointment indicator
- Option to cancel/modify entire series or single instance
- "Skip next week" without cancelling series

**Architecture implications:**
- `appointments.recurrence_rule` field (cron-like format or JSON)
- `appointments.series_id` to group related appointments
- Background job creates future instances automatically
- Reminder system handles series appropriately

---

### Service types and pricing

**Why:** Many PTs offer different services at different durations and prices (initial eval, standard treatment, specialized therapy).

**User flow:**

Patient: "I want to book"

AI: "What type of appointment do you need?

1. Initial Evaluation (60 min)
2. Standard Treatment (45 min)
3. Sports Therapy (45 min)
4. Dry Needling (30 min)

Reply with the number or name."

Patient selects → AI shows availability for that service type/duration

**PT configuration:**
- Define service types with duration and price
- Set different availability for different services
- Track which services book most

**Architecture implications:**
- `service_types` table linked to PT
- `appointments.service_type_id`
- Availability logic accounts for service duration
- Pricing information (future billing integration)

---

### Patient profiles and history

**Why:** Returning patients are easier to serve. Track history, preferences, no-shows.

**Features:**
- Patient detail view: all past appointments, no-show count, preferred times, notes
- Auto-recognize returning patients in conversation
- Flag patients with no-show history (PT can configure policies)
- Lifetime value tracking (for PTs who want analytics)

**AI enhancement:**

Returning patient:

AI: "Welcome back, Sarah! Last time you came in for shoulder pain. How is that doing? Would you like to book a follow-up?"

**Architecture implications:**
- Robust `patients` table with history
- Conversation engine checks patient history before responding
- Privacy considerations: GDPR right to erasure, data retention policies

---

### Team scheduling (multi-PT clinics)

**Why:** Many clinics have 2-5 PTs. Each needs their own calendar but share infrastructure.

**Features:**
- Clinic owner invites additional PT accounts
- Each PT has own calendar and availability
- Patient can request specific PT or "any available PT"
- Shared patient database across clinic
- Clinic-level analytics and billing

**Architecture implications:**
- Multi-tenancy model: `clinic` table, PTs belong to clinic
- Permissions system (owner, PT, admin roles)
- Appointment routing to specific PT
- Shared vs. PT-specific settings

**V3-V4** - this is essentially moving from solo practitioner tool to clinic management software. Significant scope expansion.

---

### Advanced analytics dashboard

**Why:** PTs want to understand their practice metrics to optimize operations.

**Metrics to track:**
- Appointments booked per week/month
- No-show rate trend over time
- Cancellation rate and reasons
- Most common appointment times
- Patient acquisition sources (if we can track)
- Revenue per appointment type (if pricing integrated)
- AI performance: booking completion rate, escalation rate
- Channel performance: WhatsApp vs Instagram vs Messenger booking rates

**Visualizations:**
- Line charts for trends
- Heatmap of busy/available times
- Funnel: inquiries → bookings → completed appointments
- Compare against benchmarks

**Export:**
- CSV export of appointment data
- Integration with accounting software (future)

**Architecture implications:**
- Events tracking system for all user actions
- Time-series data storage for metrics
- Background jobs for metric aggregation
- Separate analytics database (read replicas)

---

### SMS fallback channel

**Why:** Not all patients use WhatsApp or social media. SMS is universal.

**Features:**
- Patient messages PT's phone number via SMS
- AI handles conversation same as WhatsApp
- Reminders sent via SMS if patient doesn't have WhatsApp
- Higher cost per message (~€0.05-0.15) vs WhatsApp

**Provider:** Twilio or similar SMS gateway

**Architecture implications:**
- SMS webhook integration alongside WhatsApp/Instagram
- Cost tracking per channel (SMS more expensive)
- Pricing model may need to account for SMS costs
- Channel preference per patient

---

### Email communication

**Why:** Some patients (especially older demographic) prefer email.

**Features:**
- Patient emails PT's booking address
- AI responds via email with available slots
- Confirmation emails
- Email reminders

**Challenges:**
- Email is slower (not real-time like chat)
- Harder to handle conversational flow
- Spam filtering issues

**Lower priority** - chat-first model is more efficient for scheduling. Email as fallback only.

---

### Payment integration

**Why:** No-shows cost money. Requiring card-on-file reduces no-shows dramatically.

**Features:**
- Card capture during booking (Stripe)
- Option: charge cancellation fee for late cancellations
- Option: prepayment for initial appointments
- Automatic refunds if PT cancels

**Legal/compliance:**
- Must be transparent about charges
- Comply with payment regulations in each country
- GDPR considerations for storing payment info

**V3-V4** - payment integration is complex. Only add when there's clear demand and established user base.

---

### Patient-facing app/portal

**Why:** Some patients want to self-manage appointments without messaging.

**Features:**
- View upcoming appointments
- Self-service reschedule/cancel
- View past appointment history
- Fill out intake forms before appointment
- Access exercise programs (if PT provides)

**Architecture implications:**
- Patient authentication system
- Separate patient-facing frontend
- API for both PT and patient apps
- Real-time sync between channels

**V4-V5** - this is a major expansion. Most PTs will be fine with chat-only initially.

---

### Integrations with PT software

**Why:** Many PTs already use Cliniko, Jane App, WebPT. They want our chat layer on top of their existing system, not replacement.

**Integration approach:**
- Sync appointments two-way
- Pull availability from their calendar
- Push bookings into their EMR
- Single source of truth = their system

**Challenges:**
- Each EMR has different API (or no API)
- Complex to maintain multiple integrations
- Some systems charge for API access

**Start with most requested:**
1. Cliniko (popular in Europe/Australia)
2. Jane App (popular globally)
3. SimplePractice (popular in US)

**V3-V4** - only after establishing value of standalone product. Integrations are time sinks.

---

### AI enhancements

**Natural language scheduling:**

Patient: "I need to come in next week sometime after 3pm, preferably not Friday"

AI parses complex request and shows matching slots only.

**Proactive rescheduling:**

Patient has recurring weekly appointments. One week, patient cancels.

AI (next week): "Hi Sarah, I noticed you missed last week's appointment. Would you like to get back on schedule this week?"

**Smart availability suggestions:**

AI learns which time slots book fastest and suggests those first. Learns patient preferences over time.

**Multi-language support:**

Detect patient language and respond in that language. Priority: German, French, Dutch, Spanish for European market.

**Voice integration:**

Patient calls PT's number → voice AI handles booking via phone. Harder than text (speech recognition, latency) but valuable for older patients.

---

## Architecture principles for future expansion

**1. Channel-agnostic conversation engine:**

Core AI logic doesn't care if message came from WhatsApp, Instagram, SMS, or email. Channel-specific code is thin wrapper.

**2. Event-driven architecture:**

Use events (appointment_booked, appointment_cancelled, reminder_sent) to trigger downstream actions. Makes it easy to add new features listening to existing events.

**3. Multi-tenancy from start:**

Even though MVP is single-PT, design database and auth to support multiple PTs from day one. Easier than retrofitting later.

**4. API-first:**

Build backend as API that frontend consumes. Makes it easier to add patient-facing app, mobile apps, third-party integrations later.

**5. Feature flags:**

Use feature flags to enable/disable features per PT or per environment. Allows testing new features with subset of users before full rollout.

**6. Separate concerns:**

- Conversation handling (AI, message routing)
- Appointment logic (availability, booking, reminders)
- PT management (auth, settings, billing)
- Analytics and reporting

Each can evolve independently.

---

## What NOT to build (yet)

**Patient intake forms:** Complex, low ROI for MVP. PTs can handle manually.

**Exercise prescription:** Entirely different product category. Plenty of existing solutions.

**Telehealth video:** Big undertaking, regulatory complexity. Outside scope.

**Custom branding/white-label:** Only matters at scale (50+ PTs). Not for early stage.

**Mobile apps (iOS/Android):** PWA is sufficient. Native apps only if specific features require it (background processing, better push notifications).

**Advanced AI features (diagnosis, treatment suggestions):** Regulatory minefield, liability issues. Stay firmly in scheduling lane.

---

## Deciding what to build next

**After MVP is working with 1-3 PTs:**

1. **Ask customers directly:** What feature would make this 10x more valuable?
2. **Watch usage patterns:** What are PTs doing manually that could be automated? Where do conversations fail?
3. **Track requests:** Keep log of feature requests from PTs. Build most requested first.
4. **Focus on retention:** Build features that make existing customers more successful before adding features to attract new customers.
5. **Validate before building:** Create landing pages describing features, see if PTs are willing to pay more for them.

**Resist shiny object syndrome.** Every feature has maintenance cost. Better to have 5 features that work perfectly than 20 half-baked features.