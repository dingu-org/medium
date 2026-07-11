#!/bin/sh
# pnpm tunnel — cloudflared quick tunnel to local :3000 (PORT overridable).
set -e
PORT="${PORT:-3000}"
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found. Install it with:" >&2
  echo "  brew install cloudflared" >&2
  exit 1
fi
echo "Starting a Cloudflare quick tunnel to http://localhost:${PORT} ..."
echo "Reminder: point the Meta webhook callback URL and the app's allowed/redirect"
echo "domains at the https://<name>.trycloudflare.com URL printed below."
exec cloudflared tunnel --url "http://localhost:${PORT}"
