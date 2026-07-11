# WhatsApp token encryption key rotation

`whatsapp_connections.access_token_encrypted` is encrypted at rest with
Postgres `pgcrypto` (`pgp_sym_encrypt`/`pgp_sym_decrypt`), symmetrically keyed
by `TOKEN_ENCRYPTION_KEY`. This is the procedure for rotating that key without
losing any PT's WhatsApp connection.

## When to rotate

- Suspected key compromise (leaked env var, compromised deploy credential).
- Routine security hygiene (e.g. annual rotation).
- Never as a response to a single decrypt failure — that usually means a
  connection was encrypted under a stale key already, which this procedure fixes.

## Procedure

1. **Generate the new key.** Any high-entropy secret `pgp_sym_encrypt` accepts
   (no length/format requirement enforced by the app).
2. **Set both keys in the environment** used to run the script — do not
   overwrite `TOKEN_ENCRYPTION_KEY` yet:
   - `TOKEN_ENCRYPTION_KEY` — the current (old) key.
   - `TOKEN_ENCRYPTION_KEY_NEXT` — the new key.
3. **Schedule a maintenance window.** The rotation runs in a single database
   transaction and briefly holds row locks on `whatsapp_connections`, but
   outbound WhatsApp sends during the window will race the lock — prefer a
   low-traffic period.
4. **Run the script with explicit confirmation:**
   ```bash
   pnpm rotate:token-key --yes
   ```
   The script refuses to run without `TOKEN_ENCRYPTION_KEY_NEXT` set and
   without `--yes` on the command line (this is a production maintenance op,
   not something to run accidentally).
5. **What it does**, all inside one `db.transaction`:
   - Selects every row with a non-null `access_token_encrypted`, decrypting
     each with the *old* key (`pgp_sym_decrypt(..., oldKey)`), row-locked
     (`FOR UPDATE`).
   - Re-encrypts each row's plaintext under the *new* key
     (`pgp_sym_encrypt(..., newKey)`).
   - Round-trip verifies every row immediately after re-encryption
     (`pgp_sym_decrypt(new ciphertext, newKey) === original plaintext`). Any
     mismatch throws, which rolls back the entire transaction — either every
     row rotates or none do.
6. **Promote the new key.** Once the script reports success, set
   `TOKEN_ENCRYPTION_KEY` to the value that was in `TOKEN_ENCRYPTION_KEY_NEXT`
   in every environment (local `.env.local`, Vercel Preview, Vercel
   Production), remove `TOKEN_ENCRYPTION_KEY_NEXT`, and redeploy. The app's
   `lib/db/crypto.ts` binds `TOKEN_ENCRYPTION_KEY` once at module load, so a
   redeploy (not just an env change) is required for the new key to take effect.
7. **Verify** a live send or reconnect still works post-deploy — this
   round-trips a connection's token through the newly-active key end to end.

## Notes

- The script never imports `lib/db/crypto.ts` — that module binds a single
  key at import time, which is incompatible with holding two keys (old +
  new) simultaneously during rotation. It issues raw `pgp_sym_encrypt`/
  `pgp_sym_decrypt` SQL directly with both keys passed as parameters.
- `decryptToken` (the app's only decrypt call site, in
  `lib/channels/whatsapp/client.ts`) is untouched by rotation — it always
  reads whatever `TOKEN_ENCRYPTION_KEY` is currently set to, which is why step
  6 (promote + redeploy) must happen before the old key is discarded anywhere
  it's kept as a backup.
