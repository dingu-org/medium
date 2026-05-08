-- Enable RLS on every tenant-scoped table.
ALTER TABLE "pts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "availability_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "blocked_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reminder_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;

-- pts is special: the row's own id IS the tenant id (auth.users.id).
CREATE POLICY "pts_tenant_isolation" ON "pts"
  FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- All other tenant-scoped tables key off pt_id.
CREATE POLICY "whatsapp_connections_tenant_isolation" ON "whatsapp_connections"
  FOR ALL TO authenticated
  USING (pt_id = auth.uid())
  WITH CHECK (pt_id = auth.uid());

CREATE POLICY "patients_tenant_isolation" ON "patients"
  FOR ALL TO authenticated
  USING (pt_id = auth.uid())
  WITH CHECK (pt_id = auth.uid());

CREATE POLICY "conversations_tenant_isolation" ON "conversations"
  FOR ALL TO authenticated
  USING (pt_id = auth.uid())
  WITH CHECK (pt_id = auth.uid());

CREATE POLICY "messages_tenant_isolation" ON "messages"
  FOR ALL TO authenticated
  USING (pt_id = auth.uid())
  WITH CHECK (pt_id = auth.uid());

CREATE POLICY "appointments_tenant_isolation" ON "appointments"
  FOR ALL TO authenticated
  USING (pt_id = auth.uid())
  WITH CHECK (pt_id = auth.uid());

CREATE POLICY "availability_rules_tenant_isolation" ON "availability_rules"
  FOR ALL TO authenticated
  USING (pt_id = auth.uid())
  WITH CHECK (pt_id = auth.uid());

CREATE POLICY "blocked_periods_tenant_isolation" ON "blocked_periods"
  FOR ALL TO authenticated
  USING (pt_id = auth.uid())
  WITH CHECK (pt_id = auth.uid());

CREATE POLICY "message_templates_tenant_isolation" ON "message_templates"
  FOR ALL TO authenticated
  USING (pt_id = auth.uid())
  WITH CHECK (pt_id = auth.uid());

CREATE POLICY "reminder_jobs_tenant_isolation" ON "reminder_jobs"
  FOR ALL TO authenticated
  USING (pt_id = auth.uid())
  WITH CHECK (pt_id = auth.uid());

CREATE POLICY "push_subscriptions_tenant_isolation" ON "push_subscriptions"
  FOR ALL TO authenticated
  USING (pt_id = auth.uid())
  WITH CHECK (pt_id = auth.uid());

CREATE POLICY "events_tenant_isolation" ON "events"
  FOR ALL TO authenticated
  USING (pt_id = auth.uid())
  WITH CHECK (pt_id = auth.uid());

CREATE POLICY "audit_log_tenant_isolation" ON "audit_log"
  FOR ALL TO authenticated
  USING (pt_id = auth.uid())
  WITH CHECK (pt_id = auth.uid());
