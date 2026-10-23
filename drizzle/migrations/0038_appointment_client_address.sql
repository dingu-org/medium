-- Client address for at-the-client's bookings (MED-120). The assistant asks the
-- client for it and saves it as plain text on the appointment; the professional
-- sees it on that appointment. No geocoding. Nullable: existing appointments and
-- every at-business / online booking have none. Additive only: no backfill.
ALTER TABLE "appointments" ADD COLUMN "client_address" text;
