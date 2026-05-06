# Core user flows

## Flow 1: Patient books appointment via WhatsApp

**Patient perspective:**

1. Patient opens WhatsApp and messages PT's business number
2. AI responds immediately with greeting and asks how it can help
3. Patient says they want to book an appointment
4. AI asks what type of service/issue
5. AI shows available time slots
6. Patient selects a time
7. AI confirms appointment details and books it
8. Patient receives confirmation message with appointment details

**PT perspective:**

1. PT receives notification in PWA: "New appointment booked"
2. Appointment appears in calendar view
3. PT can tap appointment to see full details and chat history
4. PT can view patient's information and conversation

**Edge cases:**

- Patient request is unclear → AI asks clarifying questions, max 2-3 attempts before offering human escalation
- No slots available in requested timeframe → AI suggests alternative times or offers waitlist
- Patient asks medical question → AI deflects politely, focuses on booking only
- Patient wants to speak to PT directly → AI provides escalation: "Type HELP to speak with [PT name]"

---

## Flow 2: PT views and manages appointments

**Calendar view:**

1. PT opens PWA, sees weekly calendar with all appointments
2. Each appointment shows: patient name, time, service type, status (confirmed/pending)
3. PT can switch between week/month view
4. PT can tap any appointment to see details

**Appointment detail view:**

1. Shows patient name, contact, appointment time, service type
2. Shows complete chat history with patient
3. Shows appointment status and any notes
4. Actions available: Cancel, Reschedule, Add note
5. Button to message patient directly

---

## Flow 3: PT manually chats with patient

**From appointment detail:**

1. PT taps "Message patient" button
2. Opens chat interface showing full history
3. PT types message and sends
4. Message goes via WhatsApp to patient
5. Patient responses appear in real-time in chat view
6. PT can hand back to AI or continue manual conversation

**Important:** When PT sends manual message, AI should step back and not auto-respond unless PT explicitly hands back to AI.

---

## Flow 4: Automated reminder

**24 hours before appointment:**

1. System sends WhatsApp template message to patient: "Reminder: You have an appointment with [PT name] tomorrow at [time]. Reply CONFIRM to confirm or CANCEL to cancel."
2. Patient replies with CONFIRM → Appointment marked confirmed in PT's calendar
3. Patient replies with CANCEL → AI asks if they want to reschedule, handles cancellation, notifies PT
4. Patient replies with RESCHEDULE → AI shows available slots, handles rebooking
5. Patient doesn't reply → Appointment stays as-is, PT sees "Reminder sent, no response" status

**PT perspective:**

1. PT sees reminder status on each appointment: "Reminder sent," "Confirmed," "Cancelled," "No response"
2. PT receives notification if appointment is cancelled via reminder
3. If patient wants to reschedule, PT sees new appointment and old one marked cancelled

---

## Flow 5: PT manages availability

**Availability settings:**

1. PT opens availability management
2. Sets working hours for each day of week
3. Sets appointment duration (30min, 45min, 60min, etc.)
4. Can block specific dates/times for holidays or personal time
5. Can set different availability for different service types (future feature)

**When AI checks availability:**

- Only shows slots within PT's working hours
- Respects blocked dates/times
- Shows slots based on appointment duration setting
- Leaves buffer between appointments (configurable, default 15min)

---

## States and transitions

**Appointment states:**

- **Pending**: Just booked, awaiting confirmation
- **Confirmed**: Patient confirmed via reminder
- **No response**: Reminder sent but patient didn't respond
- **Cancelled**: Cancelled by patient or PT
- **Completed**: Appointment time has passed
- **No-show**: Appointment time passed, patient didn't show (PT can mark this manually)

**Conversation states:**

- **AI active**: AI is handling conversation
- **Human active**: PT is manually chatting
- **Closed**: Conversation ended (appointment completed or cancelled)

---

## Multi-channel future consideration

When Instagram is added later:

- Same flows apply, but system needs to track which channel each conversation started on
- Patient might book via Instagram, receive reminders via WhatsApp (requires phone number capture)
- PT sees channel indicator in chat view (WhatsApp icon vs Instagram icon)
- Each channel's limitations respected (Instagram can't send reminders after 24h window)