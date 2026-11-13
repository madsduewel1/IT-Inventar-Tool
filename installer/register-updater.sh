#!/bin/bash
# Richtet den GitHub-Update-Helfer fuer das Inventar-Tool ein.
#
#   sudo bash installer/register-updater.sh
#
# Der Helfer laeuft als Root, wird aber ausschliesslich vom Backend-Benutzer
# ueber eine eng begrenzte sudo-Regel gestartet. Er validiert Repository,
# Version und alle Pfade selbst.

set -euo pipefail

echo "=== Inventar-Tool - GitHub-Update-System einrichten ==="

if [ "$EUID" -ne 0 ]; then
  echo "Bitte als root ausfuehren (sudo bash installer/register-updater.sh)"
  exit 1
fi

INSTALL_DIR="${INSTALL_DIR:-/opt/inventar-tool}"
CONFIG_DIR="${CONFIG_DIR:-/etc/inventar-tool}"
DATA_DIR="${DATA_DIR:-/var/lib/inventar-tool}"
LOG_DIR="${LOG_DIR:-/var/log/inventar-tool}"
ENV_FILE="$CONFIG_DIR/backend.env"
UPDATE_CONF="$CONFIG_DIR/update.conf"
UPDATE_BIN="/usr/local/bin/inventar-update"
SERVICE_NAME="${SERVICE_NAME:-inventar-tool}"
SERVICE_USER="${SERVICE_USER:-inventartool}"
DEFAULT_REPO="${UPDATE_REPO:-madsduewel1/IT-Inventar-Tool}"
SYSTEMD_RUN="$(command -v systemd-run || true)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "Benoetigter Befehl fehlt: $1" >&2; exit 1; }
}

# 1) Benoetigte Systemwerkzeuge
if ! command -v git >/dev/null 2>&1; then
  echo "Installiere git..."
  apt-get update -q
  apt-get install -y git
fi
apt-get install -y curl tar gzip >/dev/null 2>&1 || true

require node
require npm
require curl
require tar
require gzip

# 2) Verzeichnisse
mkdir -p "$INSTALL_DIR/releases" "$INSTALL_DIR/backups" "$CONFIG_DIR" "$DATA_DIR/logs" "$LOG_DIR"
getent passwd "$SERVICE_USER" >/dev/null 2>&1 || useradd -r -s /bin/false "$SERVICE_USER" || true
chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR"
chown root:"$SERVICE_USER" "$LOG_DIR"
chmod 750 "$LOG_DIR"

# 3) Helfer installieren
if [ ! -f "$SCRIPT_DIR/inventar-update.js" ]; then
  echo "FEHLER: installer/inventar-update.js wurde nicht gefunden." >&2
  exit 1
fi
install -m 0755 "$SCRIPT_DIR/inventar-update.js" "$UPDATE_BIN"

# 4) Konfiguration erzeugen (vorhandene Werte bleiben erhalten)
BASE_PATH_VALUE="/inventar-tool"
PORT_VALUE="3456"
if [ -f "$ENV_FILE" ]; then
  BASE_PATH_VALUE="$(grep -E '^BASE_PATH=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  PORT_VALUE="$(grep -E '^PORT=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi
BASE_PATH_VALUE="${BASE_PATH_VALUE:-/inventar-tool}"
PORT_VALUE="${PORT_VALUE:-3456}"

if [ ! -f "$UPDATE_CONF" ]; then
  cat > "$UPDATE_CONF" <<EOF
# Konfiguration des GitHub-Update-Systems
REPO=$DEFAULT_REPO
INSTALL_DIR=$INSTALL_DIR
DATA_DIR=$DATA_DIR
LOG_DIR=$LOG_DIR
ENV_FILE=$ENV_FILE
SERVICE_NAME=$SERVICE_NAME
SERVICE_USER=$SERVICE_USER
BASE_PATH=$BASE_PATH_VALUE
PORT=$PORT_VALUE
STATE_FILE=$DATA_DIR/update-state.json
LOG_FILE=$LOG_DIR/updates.log
MAINTENANCE_FILE=$DATA_DIR/maintenance.json
LOCK_FILE=$DATA_DIR/update.lock
KEEP_RELEASES=5
# Optional fuer private Repositories (nur serverseitig, nie im Frontend):
GITHUB_TOKEN=
EOF
  chmod 640 "$UPDATE_CONF"
  chown root:"$SERVICE_USER" "$UPDATE_CONF"
  echo "update.conf erstellt: $UPDATE_CONF"
else
  echo "update.conf vorhanden (wird nicht ueberschrieben): $UPDATE_CONF"
fi

if [ -n "${GITHUB_TOKEN:-}" ]; then
  sed -i "s|^GITHUB_TOKEN=.*|GITHUB_TOKEN=$GITHUB_TOKEN|" "$UPDATE_CONF"
fi
if [ -n "${UPDATE_REPO:-}" ]; then
  sed -i "s|^REPO=.*|REPO=$UPDATE_REPO|" "$UPDATE_CONF"
fi

# 5) Sudoers: nur der Helfer bzw. der systemd-run-Aufruf darf als Root starten.
SUDOERS_FILE="/etc/sudoers.d/inventar-update"
{
  echo "$SERVICE_USER ALL=(root) NOPASSWD: $UPDATE_BIN"
  if [ -n "$SYSTEMD_RUN" ]; then
    echo "$SERVICE_USER ALL=(root) NOPASSWD: $SYSTEMD_RUN --collect --no-block --quiet --unit=inventar-update $UPDATE_BIN *"
  fi
} > "$SUDOERS_FILE"
chmod 440 "$SUDOERS_FILE"
visudo -c -f "$SUDOERS_FILE"

# 6) Funktionstest (nur lesend)
if ! "$UPDATE_BIN" status >/dev/null 2>&1; then
  echo "WARNUNG: Statusabruf des Update-Helfers fehlgeschlagen - bitte pruefen." >&2
fi

echo ""
echo "=== GitHub-Update-System eingerichtet ==="
echo "Helfer:        $UPDATE_BIN"
echo "Konfiguration: $UPDATE_CONF"
echo "Sudoers:       $SUDOERS_FILE"
echo ""
echo "Das Update-System ist jetzt unter Administration -> System -> Updates bedienbar."
echo "Repository:    $DEFAULT_REPO"
