#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/APOLLO-SMS}"
APP_DIR="${APP_DIR/#\~/$HOME}"
SERVICE_NAME="${SERVICE_NAME:-apollosms-api}"

export PATH="$PATH:/usr/local/go/bin:$HOME/go/bin:$HOME/.local/share/pnpm:/usr/local/bin"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"

echo "==> Building frontend"
cd "$APP_DIR/apollosms"
pnpm install --frozen-lockfile
NODE_OPTIONS="--max-old-space-size=2048" pnpm run build

echo "==> Building backend"
cd "$APP_DIR/backend"
go build -buildvcs=false -ldflags="-s -w" -o bin/app.new ./cmd/api
mv -f bin/app.new bin/app

echo "==> Restarting services"
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl reload nginx || sudo systemctl restart nginx
sleep 3
sudo systemctl is-active --quiet "$SERVICE_NAME" || { sudo journalctl -u "$SERVICE_NAME" -n 30 --no-pager; exit 1; }

echo "==> Deploy finished"
