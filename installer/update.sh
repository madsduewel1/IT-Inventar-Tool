#!/bin/bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/mz-inventory}"
BASE_PATH="${BASE_PATH:-/inventory}"

if [ "$EUID" -ne 0 ]; then
  echo "Bitte als root ausführen (sudo bash installer/update.sh)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

systemctl stop mz-inventory || true

# Neue Quelldateien kopieren (ohne .env, node_modules, uploads, logs)
cp -r "$REPO_DIR"/backend/src "$INSTALL_DIR/backend/"
cp -r "$REPO_DIR"/backend/prisma "$INSTALL_DIR/backend/"
cp "$REPO_DIR"/backend/package.json "$INSTALL_DIR/backend/package.json"
cp -r "$REPO_DIR"/frontend/src "$INSTALL_DIR/frontend/"
cp "$REPO_DIR"/frontend/package.json "$INSTALL_DIR/frontend/package.json"
cp "$REPO_DIR"/frontend/vite.config.js "$INSTALL_DIR/frontend/vite.config.js"
cp "$REPO_DIR"/frontend/index.html "$INSTALL_DIR/frontend/index.html"

# Prisma-Provider an den verwendeten DB-Typ anpassen (wie install.sh)
DB_PROVIDER="$(grep -oP '^DB_PROVIDER=\K.*' "$INSTALL_DIR/backend/.env" || echo "mysql")"
sed -i "s/provider = \"sqlite\"/provider = \"$DB_PROVIDER\"/" "$INSTALL_DIR/backend/prisma/schema.prisma"

cd "$INSTALL_DIR/backend"
npm ci --omit=dev --ignore-scripts 2>/dev/null || npm install --omit=dev --ignore-scripts
npx prisma generate

cd "$INSTALL_DIR/frontend"
npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts
VITE_BASE_PATH="$BASE_PATH/" npm run build

# Symlink für den Base-Path (Apache-Kompatibilität)
BASE_DIR_NAME="$(echo "$BASE_PATH" | sed 's/^\///')"
if [ -n "$BASE_DIR_NAME" ]; then
  ln -sf . "dist/$BASE_DIR_NAME"
fi

chown -R mzinventory:mzinventory "$INSTALL_DIR"
chmod 755 "$INSTALL_DIR"
chmod -R 755 "$INSTALL_DIR/frontend"

systemctl start mz-inventory
systemctl restart apache2

echo ""
echo "=== Update abgeschlossen ==="
echo "Die Datenbank wurde nicht verändert."
echo "Falls das Schema aktualisiert werden muss: cd $INSTALL_DIR/backend && npx prisma db push"
