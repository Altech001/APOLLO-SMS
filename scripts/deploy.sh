#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/APOLLO-SMS}"
APP_DIR="${APP_DIR/#\~/$HOME}"
BACKEND_BIN="${BACKEND_BIN:-bin/app}"
SERVICE_NAME="${SERVICE_NAME:-apollosms}"

export PATH="$PATH:/usr/local/go/bin:$HOME/go/bin:$HOME/.local/share/pnpm:/usr/local/bin"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"

echo "==> Building frontend"
cd "$APP_DIR/apollosms"
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile
  pnpm build
else
  npm install
  npm run build
fi

echo "==> Building backend"
cd "$APP_DIR/backend"
go mod download
CGO_ENABLED=0 go build -ldflags="-w -s" -o "$BACKEND_BIN.new" ./cmd/api
mv -f "$BACKEND_BIN.new" "$BACKEND_BIN"

echo "==> Restarting backend"
if [ -n "${RESTART_CMD:-}" ]; then
  eval "$RESTART_CMD"
elif systemctl list-unit-files 2>/dev/null | grep -q "^${SERVICE_NAME}.service"; then
  sudo systemctl restart "$SERVICE_NAME"
elif command -v pm2 >/dev/null 2>&1 && pm2 describe "$SERVICE_NAME" >/dev/null 2>&1; then
  pm2 restart "$SERVICE_NAME" --update-env
else
  echo "No restart method found. Set the RESTART_CMD repo variable or create a '$SERVICE_NAME' systemd service (see DEPLOY.md)." >&2
  exit 1
fi

echo "==> Deploy finished"
