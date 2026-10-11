-- The market is Albania, so new accounts default to Europe/Tirane (same DST
-- rules as Europe/Berlin, so no offset changes). Existing rows are left alone:
-- a zone the account chose can't be told apart from one that was defaulted.
ALTER TABLE "accounts" ALTER COLUMN "timezone" SET DEFAULT 'Europe/Tirane';--> statement-breakpoint

-- The signup trigger inserts the timezone explicitly rather than relying on the
-- column default, and its body is stored as text, so it is redefined whole.
-- This is 0031's body with only the timezone literal changed. CREATE OR REPLACE
-- keeps the function's owner and grants (none are set in any migration).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.accounts (id, email, timezone, retention_days)
  VALUES (NEW.id, NEW.email, 'Europe/Tirane', 90);

  INSERT INTO public.services (account_id, name, duration_min, active)
  VALUES
    (NEW.id, 'Vlerësim i parë', 45, true),
    (NEW.id, 'Seancë vijuese', 30, true),
    (NEW.id, 'Terapi manuale', 60, false);
  RETURN NEW;
END;
$$;
