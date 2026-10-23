-- New accounts start with no services (MED-118, KD, all environments): the
-- owner creates their service in onboarding step 3. The signup trigger stops
-- inserting the three default services and is otherwise unchanged: this is
-- 0032's body (the current definition) minus the services INSERT. Existing
-- accounts keep their services; nothing is deleted. onboarding_flow is set by
-- its column default (0033), so the INSERT stays explicit-columns only.
-- CREATE OR REPLACE keeps the function's owner, grants and the trigger binding.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.accounts (id, email, timezone, retention_days)
  VALUES (NEW.id, NEW.email, 'Europe/Tirane', 90);
  RETURN NEW;
END;
$$;
