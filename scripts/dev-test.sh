#!/bin/sh
# Run the Next dev server against the LOCAL Supabase stack (.env.test) for
# signed-in visual QA with seed-qa fixtures. Process env wins over .env.local.
set -a
. ./.env.test
set +a
exec pnpm dev --port "${PORT:-3105}"
