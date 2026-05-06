# WhatsApp Cloud API integration architecture

This document outlines what the software architect needs to consider when integrating direct WhatsApp Cloud API for a multi-tenant SaaS where each PT connects their own WhatsApp Business number.

---

## Architecture overview

**Multi-tenant SaaS model:**
- Your company creates one WhatsApp Business App (registered with Meta)
- Each PT connects their own WhatsApp Business number through your app
- All messages from all PTs route through your single webhook endpoint
- Your system identifies which PT owns each incoming message and routes accordingly

**Ownership structure:**
- **Your SaaS business** owns the Meta App (the integration)
- **Each PT's business** owns their WhatsApp Business Account and phone number
- **Each patient** initiates conversations from their personal WhatsApp

---

## Key architectural considerations

### 1. Your Meta Business App setup

**What to create:**
- Meta Business Manager account for YOUR SaaS company
- Meta Developer account
- WhatsApp Business App (type: Business)
- System User with permissions to manage multiple WhatsApp Business Accounts

**Business verification requirement:**
- YOUR company must verify with Meta to create the app
- Requires: business documents, website, company information
- Timeline: 2-7 days for approval, sometimes longer
- This is one-time setup for your platform

**App review and permissions:**
- Request `whatsapp_business_messaging` permission
- Request `whatsapp_business_management` permission (for embedded signup)
- Submit app for review explaining the use case (appointment scheduling for healthcare)
- Approval timeline: 1-2 weeks typically

---

### 2. Embedded signup flow

**What it is:**
- Meta provides an OAuth-like flow called "Embedded Signup"
- Each PT clicks a button in your app
- They're redirected to Meta's flow where they verify their business and connect their WhatsApp number
- They grant your app permission to send/receive messages on their behalf
- Meta redirects back to your app with access token

**What the architect needs to handle:**
- OAuth redirect flow (initiate signup, handle callback)
- Token storage per PT (access tokens, refresh tokens, phone number IDs)
- Token refresh logic (tokens can expire or be revoked)
- Multi-step onboarding UI guiding PT through the process
- Error handling (verification rejected, number already in use, etc.)

**Each PT's requirements:**
- Must have their own Meta Business Manager account (or create during signup)
- Must verify THEIR business with Meta (not yours)
- Must have a WhatsApp-eligible phone number (not already on regular WhatsApp)
- Must grant your app permission to access their WhatsApp Business Account

---

### 3. Webhook architecture

**Single webhook endpoint receives ALL messages:**
- Meta sends webhooks to one URL you configure in your app settings
- Webhook payload includes `phone_number_id` (identifies which PT's number received the message)
- Your system must map `phone_number_id` → PT account → conversation context

**What to architect:**

**Database mapping:**
- `whatsapp_phone_numbers` table linking `phone_number_id` to `pt_id` and `access_token`
- Query: incoming message with phone_number_id X → belongs to PT Y

**Webhook router:**
- Identify PT from phone number
- Load PT context (availability, settings, existing conversations)
- Route to conversation handler

**Webhook security:**
- Verify Meta's signature on every request (prevents spoofing)
- Use shared secret Meta provides during app setup

**Webhook reliability:**
- Must respond within 20 seconds or Meta retries
- Design for async processing (acknowledge immediately, process in background)
- Handle duplicate webhooks (Meta may send same event twice - idempotency)

**Webhook events to handle:**
- `messages` - incoming patient messages
- `message_status` - delivery/read receipts
- Account-level events (number disconnected, verification status changed)

---

### 4. Multi-tenant data isolation

**Critical security consideration:**
- Messages for PT A must never be visible to PT B
- Conversation state must be scoped to PT
- Availability and calendar data isolated per PT

**Architectural patterns:**

**Database design:**
- Every table storing PT-specific data needs `pt_id` column
- All queries must filter by PT: `WHERE pt_id = ?`
- Database constraints to enforce isolation

**API authentication:**
- Session/JWT ties authenticated user to specific PT
- Every API request loads PT context from auth token
- Never trust client-provided PT ID

**Background jobs:**
- Reminder scheduler processes per-PT with proper scoping
- Each job execution loads correct PT context

**Tables requiring PT scoping:**
- conversations
- messages
- appointments
- patients
- availability_settings
- whatsapp_phone_numbers
- message_templates

---

### 5. Message template management

**Template requirements:**
- Templates must be approved by Meta before use
- Templates are tied to each WhatsApp Business Account (per PT, not per your app)
- Cannot send messages outside 24h conversation window without approved template

**Architectural decision: Shared vs per-PT templates**

**Option A: Shared templates (simpler)**
- Your app has predefined template text (e.g., appointment reminder)
- When PT connects, programmatically create that template in their WhatsApp Business Account
- Pro: Consistent messaging, simpler to manage
- Con: All PTs use identical wording, no customization

**Option B: Per-PT customizable templates**
- Each PT can edit reminder message text in your app
- Your app submits customized template to Meta for that PT
- Pro: PTs personalize for their practice
- Con: More complex approval tracking, delays per PT

**What to architect:**
- Programmatic template creation via WhatsApp Business Management API
- Template status tracking per PT: pending, approved, rejected
- UI showing PT their template approval status
- Retry mechanism if template rejected (with Meta's feedback)
- Fallback: if template not yet approved, PT cannot send reminders (handle gracefully in UI)

**Template structure considerations:**
- Category matters: "Utility" is cheapest, "Marketing" is expensive
- Variables must be clearly defined ({{1}}, {{2}}, etc.)
- Footer is optional but recommended for compliance
- Buttons are optional (quick replies like CONFIRM/CANCEL)

---

### 6. Rate limiting and quotas

**Meta imposes limits per WhatsApp Business Account:**
- **Tier 1** (new accounts): 250 unique users per 24h
- **Tier 2**: 1,000 unique users per 24h
- **Tier 3**: 10,000 unique users per 24h
- **Tier 4**: 100,000 unique users per 24h
- **Unlimited**: For high-quality accounts

**Tier progression:**
- Based on message volume and quality rating
- Typically progresses automatically if quality is high

**What to architect:**
- Track current messaging tier per PT (stored in database)
- Monitor message count approaching tier limit
- Queue management: if near limit, queue messages for next 24h period
- Handle Meta's rate limit errors (specific error codes returned)
- PT-facing visibility: "You've used 180/250 messages today" alert

**Quality rating:**
- Meta rates each WhatsApp number based on user blocks, reports, feedback
- Low quality rating reduces tier limits or suspends account
- Architect for: tracking quality rating per PT, alerting if it drops

---

### 7. Error handling and monitoring

**Per-PT error scenarios:**
- Message delivery failed (patient blocked number, invalid number, network error)
- Template not approved yet (reminder cannot be sent)
- Access token expired or revoked (PT disconnected, needs to reconnect)
- Rate limit reached (hitting tier quota)
- Quality rating dropped (too many patient complaints)
- Webhook signature verification failed (security issue)

**What to architect:**

**Error logging:**
- Log errors with PT context (which PT, which patient, what failed)
- Categorize errors: transient (retry), permanent (alert PT), critical (system issue)

**PT-facing status dashboard:**
- Connection status: "WhatsApp connected ✓" vs "Action needed: Reconnect WhatsApp"
- Template status: "Reminder template approved ✓" vs "Pending approval"
- Recent errors: "3 messages failed to deliver today - view details"

**Retry logic:**
- Transient failures (network timeouts): exponential backoff retry
- Permanent failures (invalid number): don't retry, log and alert
- Token expired: trigger PT re-authentication flow

**Alert system:**
- Critical issues: webhook endpoint down, mass delivery failures
- PT-specific issues: token expired, quality rating dropped, template rejected

---

### 8. Cost tracking per tenant

**Meta's pricing model:**
- **User-initiated conversations**: Free for 24h from patient's first message
- **Business-initiated conversations**: €0.01-€0.10 per conversation depending on category (utility, marketing, authentication)
- Charged per conversation, not per message (multiple messages in 24h = one conversation)

**What to track:**
- Conversation count per PT per month
- Which conversations were free (user-initiated) vs paid (business-initiated)
- Template message category (affects cost)
- Use for billing or usage analytics

**Architectural implementation:**
- Log each conversation: `conversation_id`, `pt_id`, `initiated_by` (user/business), `category`, `timestamp`, `estimated_cost`
- Aggregate monthly per PT
- Meta bills YOU monthly - you may want to pass costs through to PTs or factor into pricing

**Future consideration:**
- If you charge PTs per message or per appointment, build cost tracking from day one
- Even if free initially, having the data helps with pricing decisions later

---

### 9. PT onboarding flow architecture

**The end-to-end user journey:**

**Step 1: PT signs up for your SaaS**
- Creates account (email, password, practice info)
- Selects plan (if tiered pricing exists)
- Account created in your database

**Step 2: PT initiates WhatsApp connection**
- Sees onboarding checklist or "Connect WhatsApp" button
- Your app shows explanation: "Connect your WhatsApp Business number so patients can message you"
- PT clicks button

**Step 3: Embedded Signup redirect**
- Your app calls Meta's Embedded Signup endpoint
- Redirects PT to Meta's hosted flow
- URL includes your app_id and redirect_uri

**Step 4: Meta's flow (Meta handles this UI)**
- PT logs into Facebook/Meta account (or creates one)
- Selects existing WhatsApp Business Account or creates new
- Uploads business verification documents
- Selects phone number to connect (or adds new number)
- Grants permissions to your app
- Meta redirects back to your redirect_uri with auth code

**Step 5: Your app receives callback**
- Extract auth code from URL parameters
- Exchange auth code for access token (server-side API call)
- Store: `access_token`, `phone_number_id`, `whatsapp_business_account_id`, `pt_id` mapping
- Subscribe to webhooks for that phone number ID
- Programmatically create reminder template in PT's WhatsApp Business Account

**Step 6: PT completes setup in your app**
- Show "WhatsApp connected successfully ✓"
- Guide PT to set availability (working hours, appointment duration)
- Let PT customize AI assistant name and greeting
- Offer test: "Send a message to your WhatsApp number to test"

**Error states to architect for:**

**Business verification rejected:**
- Meta returns error in callback
- Show PT specific reason (usually: documents unclear, name mismatch)
- Let PT retry with better documents
- Provide help documentation on common rejection reasons

**Phone number already in use:**
- Meta returns error if number connected elsewhere
- Guide PT to disconnect from regular WhatsApp first
- Provide instructions: open WhatsApp → Settings → Account → Delete Account

**PT cancels flow midway:**
- They close Meta's window or click Back
- Your redirect_uri receives error parameter
- Save partial state, show "Connection incomplete - resume anytime"

**Token expired/revoked later:**
- Detect when API calls fail with auth error
- Show PT: "WhatsApp disconnected - please reconnect"
- Trigger re-authentication flow

---

### 10. Message sending architecture

**API for sending messages:**
- Use Graph API: `POST /{phone_number_id}/messages`
- Must include PT's access token in Authorization header
- Each PT has their own phone_number_id and access_token

**Message types:**
- **Text message**: Free-form text (only within 24h conversation window)
- **Template message**: Pre-approved template (can send anytime)
- **Interactive message**: Buttons or lists (within 24h window)
- **Media message**: Images, documents (within 24h window)

**24-hour conversation window:**
- Starts when patient sends a message
- During this window: PT (via your app) can send any message type
- After window closes: Only template messages allowed
- New patient message reopens the window

**What to architect:**

**Message queue:**
- Don't send messages synchronously in webhook response (too slow)
- Queue messages in database or message broker (Redis, RabbitMQ, etc.)
- Background worker processes queue and sends via API

**Conversation window tracking:**
- Track per patient: `last_message_from_patient_at` timestamp
- Before sending, check if within 24h window
- If outside window and trying to send non-template: either use template or queue until patient responds

**Automatic template selection:**
- If outside 24h window and need to send reminder: automatically use approved template
- Populate template variables (patient name, appointment time, etc.)

**Send failure handling:**
- API may return errors: invalid recipient, rate limit, token expired
- Retry transient errors
- Log permanent failures with PT context
- Update PT dashboard showing failed messages

---

### 11. Security and compliance

**Access control:**
- PT can only access their own data (enforce in every API endpoint)
- Use authentication middleware that loads PT context from session/JWT
- Audit log: track who accessed what data when (for GDPR compliance)

**Data encryption:**
- Patient data encrypted at rest in database
- Use TLS/HTTPS for all API communication
- Encrypt access tokens in database (don't store plain text)
- Use environment variables for secrets (never commit to git)

**GDPR compliance architecture:**

**Data retention:**
- Auto-delete old messages after configurable period (e.g., 90 days, 1 year)
- Let PT configure retention policy
- Background job periodically purges old data

**Data export:**
- PT can request export of all their data (appointments, messages, patients)
- Generate JSON or CSV download
- Include in PT dashboard

**Data deletion:**
- PT can delete individual patient records (right to be forgotten)
- Cascade delete: remove patient's appointments, messages, conversation history
- Keep aggregated anonymized analytics if needed

**Terms and responsibilities:**
- PT is data controller (they decide what data to collect and why)
- You are data processor (you process data on PT's behalf per their instructions)
- PT responsible for getting patient consent for WhatsApp communication
- Your terms must clearly state this

**WhatsApp terms compliance:**
- Cannot use for unsolicited marketing
- Must provide opt-out mechanism (patient can type STOP)
- Must have human escalation (AI cannot be fully autonomous - PT must be able to take over)
- Cannot send spam or misleading messages (affects quality rating)

---

### 12. Testing strategy

**Test environment setup:**
- Meta provides test mode with different API endpoints
- Create test WhatsApp Business Account (separate from production)
- Use Meta's test phone numbers (virtual numbers that don't send real messages)

**Local development:**
- Webhooks require public URL
- Use ngrok, localtunnel, or similar to expose localhost
- Configure test webhook URL in Meta app settings (separate from production)

**What to test:**

**Webhook signature verification:**
- Meta signs every webhook request
- Test with valid and invalid signatures
- Reject requests with invalid signatures

**Multi-tenant routing:**
- Create two test PT accounts with different phone numbers
- Send message to PT A's number
- Verify PT B cannot see the message (data isolation)

**Token refresh flow:**
- Simulate expired token
- Verify system detects and triggers PT re-authentication

**Rate limit handling:**
- Difficult to test with real limits (requires high volume)
- Mock the rate limit error response
- Verify message queueing logic works

**Template approval flow:**
- Submit template in test account
- Templates usually auto-approved in test mode
- Test rejection scenario (intentionally violate template rules)

---

## Initial setup checklist

Before building the product, architect needs to complete:

1. **Create Meta Business Manager for your SaaS company**
   - Register your business with Meta
   - Submit verification documents
   - Wait for approval (2-7 days)

2. **Create Meta Developer account**
   - Link to your Meta Business Manager

3. **Create WhatsApp Business App**
   - In Meta Developers dashboard
   - Type: Business
   - Note app_id and app_secret

4. **Request permissions**
   - `whatsapp_business_messaging` (send/receive messages)
   - `whatsapp_business_management` (manage PT accounts)
   - Submit for app review with use case description

5. **Configure webhook URL**
   - Set your webhook endpoint URL
   - Verify webhook (Meta sends verification request)
   - Select events to receive (messages, message_status)

6. **Generate System User**
   - Create system user in Meta Business Manager
   - Assign permissions to WhatsApp app
   - Generate access token (used for backend API calls)

7. **Test in development mode**
   - Use test phone numbers
   - Verify embedded signup flow works
   - Test message send/receive
   - Test webhook routing

8. **Production launch preparation**
   - Switch webhook to production URL
   - Update redirect_uri for production domain
   - Set up monitoring and error tracking
   - Prepare PT onboarding documentation

---

## Cost summary

**Your costs (SaaS operator):**
- Platform access: €0 (free to use WhatsApp Cloud API)
- Meta conversation fees: ~€0.01-€0.10 per business-initiated conversation
- Hosting for webhook server and database
- Development time: 40-60 hours for initial integration

**Per PT costs (at 100 appointments/month):**
- Mostly user-initiated conversations (patient messages first): €0
- Some business-initiated (reminders to patients who haven't messaged recently): ~€1-5/month
- **Total Meta fees per PT: €1-5/month**

**Pricing implication:**
- At €59/month per PT, €1-5 Meta fees = 2-8% gross margin impact
- Much better than €49/month BSP fee (which would be 83% of revenue at €59 pricing)

---

## Migration path from BSP (if needed later)

If you start with BSP (360dialog, Twilio) and want to migrate to direct API:

**What changes:**
- API endpoints (BSP's API → Meta's Graph API)
- Authentication (BSP API key → per-PT access tokens)
- Webhook URL (BSP's → yours)
- Template management (BSP dashboard → Meta API)

**What stays same:**
- Data model (appointments, conversations, messages)
- Business logic (AI conversation, booking, reminders)
- PT-facing UI

**Migration is feasible but requires:**
- PT re-onboarding (reconnect WhatsApp via Embedded Signup)
- Template re-approval with Meta
- Webhook infrastructure buildout
- Testing period with both systems running

Better to choose direct API from start if you plan to scale beyond 10-20 PTs.