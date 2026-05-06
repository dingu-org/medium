# PT admin PWA screens

## Design principles

**Mobile-first:** PTs will primarily use this on their phone between patients, during commute, or while moving between locations. Desktop is secondary.

**Minimal taps:** Every action should be achievable in 2-3 taps maximum. PTs are busy.

**Real-time updates:** Calendar and chat should update without refresh when new appointments book or messages arrive.

**Clear status:** Always visible: which appointments need attention, which are confirmed, which had no response to reminders.

---

## Screen 1: Calendar view (Home)

**Layout:**

Top bar:
- Current date/week display
- Toggle: Week view / Month view
- Notification bell icon (with badge if unread notifications)
- Settings icon (top right)

Main content:
- Time-based calendar layout
- Each appointment shown as card/block with:
  - Patient name (first name + last initial for privacy)
  - Service type (if applicable)
  - Status indicator (colored dot or icon)
  - Time

**Status indicators:**
- Green dot = Confirmed
- Yellow dot = Pending (no reminder sent yet)
- Orange dot = Reminder sent, no response
- Red dot = New cancellation/reschedule request
- Gray = Completed

**Interactions:**
- Tap appointment → Opens appointment detail view
- Pull to refresh → Syncs latest data
- Today button → Jumps to current day/week
- Plus button (floating action button, bottom right) → Block time or add manual appointment

**Week view:** Shows 7 days with time slots, scrollable. Default view.

**Month view:** Shows entire month in grid format, dots indicate days with appointments. Tap day to see that day's appointments.

**Empty state:** 
"No appointments scheduled. Your WhatsApp assistant is ready to book for you!"

---

## Screen 2: Appointment detail view

**Header:**
- Back arrow (top left)
- Patient name
- Status badge (Confirmed / Pending / etc.)
- Three-dot menu (top right): Cancel appointment, Add note, Block patient (future)

**Content sections:**

**Appointment info card:**
- Date and time (large, prominent)
- Service type
- Duration
- Status with explanation ("Reminder sent 24h ago, patient confirmed")

**Patient info card:**
- Name
- Phone number (tap to call)
- WhatsApp (tap to open WhatsApp app directly)
- Previous appointment count (if any)
- No-show history (if any)

**Chat history:**
- Scrollable conversation view
- Messages grouped by date/time
- Clear distinction between AI messages, PT messages, and patient messages
  - AI messages: Subtle robot icon or "Auto" badge
  - PT messages: "You" label or PT's initials
  - Patient messages: Patient's name/initials
- Timestamps on messages

**Actions (bottom of screen):**
- Primary button: "Message patient" → Opens chat interface
- Secondary button: "Cancel appointment"

**If appointment is in the past:**
- Show "Mark as no-show" button if not already marked
- Show "Appointment completed" status

---

## Screen 3: Chat interface

**Header:**
- Back arrow (returns to appointment detail)
- Patient name
- Status: "AI active" or "You're chatting" or "AI will resume after 1 hour of inactivity"

**Chat area:**
- Standard messaging interface
- Full conversation history (scrolls to bottom/most recent)
- Message bubbles:
  - Patient: Left side, gray/blue
  - AI: Left side, different shade, with "Auto" badge
  - PT: Right side, primary color

**Input area (bottom):**
- Text input field: "Type your message..."
- Send button
- Toggle: "Let AI respond" / "I'll handle this"

**Behavior:**
- When PT sends a message, AI automatically steps back
- After 1 hour of PT inactivity, AI offers to resume: "Should I continue handling messages with [patient name]?"
- PT can explicitly hand back to AI with toggle

**Real-time updates:**
- New patient messages appear instantly
- If AI responds, PT sees it in real-time
- Typing indicators (if technically feasible)

---

## Screen 4: Notifications view

**Accessed via bell icon in top bar**

**Layout:**
- List of recent notifications, newest first
- Each notification shows:
  - Type icon (new appointment, cancellation, message, reminder response)
  - Message: "John D. booked for tomorrow 2pm"
  - Time: "5 minutes ago"
  - Tap to go to relevant appointment

**Notification types:**
- New appointment booked
- Appointment cancelled by patient
- Patient wants to reschedule
- Reminder confirmed by patient
- Patient sent message requiring attention
- Patient requested to speak to you (escalation)

**Actions:**
- Tap notification → Opens relevant appointment or chat
- Swipe to dismiss (for informational notifications)
- "Mark all as read" button (top right)

**Badge count:**
- Shows unread notification count on bell icon
- Clears when PT opens notifications or views relevant appointment

---

## Screen 5: Availability settings

**Accessed via Settings icon**

**Layout:**

**Weekly schedule:**
- Each day of week shown as expandable section
- For each day:
  - Toggle: Available / Unavailable
  - If available: Start time, End time pickers
  - "Copy to all days" button

**Appointment settings:**
- Default appointment duration: Dropdown (15min, 30min, 45min, 60min, 90min)
- Buffer between appointments: Dropdown (0min, 5min, 10min, 15min, 30min)
- Max appointments per day: Number input

**Blocked dates/times:**
- "Add blocked period" button
- List of existing blocks with date/time and option to delete
- When adding: Date picker, start/end time pickers, optional note

**Save button (bottom):** "Save availability"

**Future features (not v1):**
- Different availability for different service types
- Recurring blocks (e.g., lunch break daily)
- Working location (for multi-location PTs)

---

## Screen 6: Settings

**Sections:**

**Account:**
- PT name and profile info
- Business name
- WhatsApp number connected
- Email for notifications

**AI assistant:**
- Assistant name (what AI calls itself)
- Greeting message customization
- Auto-response toggle (enable/disable AI entirely)
- Escalation keyword ("HELP" or custom)

**Notifications:**
- Push notification preferences
  - New appointments
  - Cancellations
  - Messages requiring attention
  - Reminder responses
- Email notifications toggle

**Billing (future):**
- Current plan
- Usage stats
- Payment method

**Support:**
- Help documentation
- Contact support
- Privacy policy
- Terms of service

**Logout button (bottom)**

---

## Navigation pattern

**Bottom tab bar (always visible):**
- Calendar (home icon) - default view
- Notifications (bell icon with badge)
- Settings (gear icon)

**No hamburger menu.** Everything accessible via bottom tabs or within-screen navigation.

---

## Loading and error states

**Loading:**
- Skeleton screens for calendar and lists (shows layout with loading shimmer)
- Spinner for actions (sending message, booking appointment)

**Errors:**
- Toast messages for temporary errors: "Couldn't send message. Try again."
- Inline errors for form validation
- Full-screen error state if critical failure: "Can't connect to server. Check your internet connection."

**Offline handling:**
- Show banner: "You're offline. Changes will sync when connected."
- Queue messages and sync when back online
- Show cached data where possible

---

## Responsive behavior

**Mobile (primary):**
- Single column layout
- Bottom tab navigation
- Touch-optimized tap targets (minimum 44x44px)
- Swipe gestures where appropriate

**Tablet:**
- Same layout but with more whitespace
- Potentially side-by-side view (calendar + appointment detail)

**Desktop:**
- Sidebar navigation instead of bottom tabs
- Multi-column layout (calendar + detail pane)
- Keyboard shortcuts for power users

**PWA requirements:**
- Installable (add to home screen)
- Works offline for viewing cached data
- Push notifications when app is closed
- Fast load time (< 3 seconds on 3G)

---

## Accessibility

- Semantic HTML for screen readers
- Sufficient color contrast (WCAG AA minimum)
- Keyboard navigation support
- Focus indicators visible
- Alt text for icons
- Error messages announced to screen readers

---

## Visual design notes

**Keep it clean and professional:**
- Not too playful - this is a work tool
- Clear hierarchy with typography
- Generous whitespace
- Status colors consistent throughout
- Primary action buttons prominent

**Inspiration sources:**
- Modern calendar apps (Google Calendar, Calendly)
- Medical appointment software
- Clean SaaS dashboards

**Not like:**
- Consumer chat apps (too casual)
- Overly complex EMRs (too cluttered)
- Generic admin dashboards (too generic)