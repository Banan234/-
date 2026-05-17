#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${1:-/opt/yuzhural-site}"
SOURCE_FILE="$PROJECT_ROOT/infra/caddy/Caddyfile"
TARGET_FILE="/etc/caddy/Caddyfile"
BACKUP_FILE="/etc/caddy/Caddyfile.bak.$(date +%Y%m%d%H%M%S)"

sudo cp "$TARGET_FILE" "$BACKUP_FILE"
sudo cp "$SOURCE_FILE" "$TARGET_FILE"
sudo caddy fmt --overwrite "$TARGET_FILE"
sudo caddy validate --config "$TARGET_FILE"
sudo systemctl reload caddy
