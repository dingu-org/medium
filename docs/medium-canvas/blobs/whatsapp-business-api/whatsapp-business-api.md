# WhatsApp Business API

**Feasible with direct WhatsApp Cloud API.** AI appointment booking explicitly allowed. Patient-initiated conversations cost €0 in Meta fees. No monthly BSP fees - only Meta's per-conversation charges (~€0.01-0.10 for business-initiated).

**One requirement:** Must include human escalation path (e.g., "Type HELP to speak with PT"). PT doesn't need 24/7 monitoring but must be reachable.

**Multi-tenant architecture:** Each PT connects their own WhatsApp Business number via embedded signup. Your app routes webhooks to correct PT. GDPR compliant with proper data handling.