#!/usr/bin/env bash
# Kakumei VPS deploy. Run from the repo root on your machine:
#   ./deploy/deploy.sh
# Requires: Node.js, rsync, ssh key access, and Caddy installed on the VPS.
set -euo pipefail

VPS_HOST="${VPS_HOST:-root@137.23.45.53}"
DOMAIN="${DOMAIN:-stream.kyzenhub.site}"
REMOTE_WWW="/var/www/kakumei"
REMOTE_API="/opt/kakumei/backend"

echo "==> Building website (/app base)…"
npx vite build --base=/app/

echo "==> Syncing backend…"
ssh "$VPS_HOST" "mkdir -p $REMOTE_API /var/log"
rsync -az --delete \
  --exclude node_modules --exclude '*.log' --exclude 'lastgood.json' \
  --exclude 'cdns.json' --exclude 'content-lastgood.json' --exclude '*test*.json' --exclude '.env' \
  netmirror-server/ "$VPS_HOST:$REMOTE_API/"
ssh "$VPS_HOST" "cd $REMOTE_API && npm ci --omit=dev"
# Miruro/hianime harvest needs the Playwright browser (idempotent no-op when present).
ssh "$VPS_HOST" "cd $REMOTE_API && PLAYWRIGHT_BROWSERS_PATH=/opt/kakumei/ms-playwright npx playwright install chromium || true"

echo "==> Syncing landing + web app…"
ssh "$VPS_HOST" "mkdir -p $REMOTE_WWW/app $REMOTE_WWW/downloads"
rsync -az landing/ "$VPS_HOST:$REMOTE_WWW/"
rsync -az --delete dist/ "$VPS_HOST:$REMOTE_WWW/app/"

echo "==> Updating API service + Caddy site…"
scp deploy/kakumei-api.service deploy/kakumei.caddy deploy/install-service.sh "$VPS_HOST:/tmp/"
ssh "$VPS_HOST" bash /tmp/install-service.sh
ssh "$VPS_HOST" "cd $REMOTE_API && node cdn-refresh.cjs http://127.0.0.1:3005"

echo "==> Verifying…"
node deploy/verify.mjs "https://$DOMAIN"
echo "Done. Caddy manages HTTPS certificates and renewal."
