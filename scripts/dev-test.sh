#!/bin/sh
# Run the Next dev server on the browser-QA port (3105) with seed-qa fixtures.
# Historically this forced the local-stack env over a cloud-pointing
# .env.local; since the env consolidation `pnpm dev` already reads the same
# `.env`, so this is now just the port convention the QA tooling expects.
exec pnpm dev --port "${PORT:-3105}"
