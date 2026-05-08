-- Link pts.id to auth.users.id so user deletion cascades to the pts row.
ALTER TABLE "pts"
  ADD CONSTRAINT "pts_id_auth_users_fk"
  FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

-- Mirror every new auth.users row into public.pts with sensible defaults.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.pts (id, email, timezone, retention_days)
  VALUES (NEW.id, NEW.email, 'Europe/Berlin', 90);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
