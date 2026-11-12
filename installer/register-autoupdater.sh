#!/bin/bash
# Richtet den Auto-Updater des Inventar-Tools als Root-Dienst ein.
#
#   sudo bash installer/register-autoupdater.sh
#
# Optional:
#   UPDATE_SERVER_URL=https://update-inventar-tool.schnikdu.com \
#   UPDATE_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----…" \
#   sudo bash installer/register-autoupdater.sh

set -euo pipefail

echo "=== Inventar-Tool - Auto-Updater einrichten ==="

if [ "$EUID" -ne 0 ]; then
  echo "Bitte als root ausfuehren (sudo bash installer/register-autoupdater.sh)"
  exit 1
fi

INSTALL_DIR="${INSTALL_DIR:-/opt/inventar-tool}"
CONFIG_DIR="${CONFIG_DIR:-/etc/inventar-tool}"
DATA_DIR="${DATA_DIR:-/var/lib/inventar-tool}"
LOG_DIR="${LOG_DIR:-/var/log/inventar-tool}"
ENV_FILE="$CONFIG_DIR/backend.env"
UPDATE_CONF="$CONFIG_DIR/update.conf"
UPDATE_BIN="/usr/local/bin/inventar-update"
SERVICE_USER="inventartool"

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "Benoetigter Befehl fehlt: $1" >&2; exit 1; }
}

# 1) Verzeichnisse
mkdir -p "$INSTALL_DIR/updater" "$CONFIG_DIR" "$DATA_DIR" "$LOG_DIR"

# 2) Autoupdater-Code an einen festen (release-unabhaengigen) Ort kopieren
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
if [ ! -f "$SCRIPT_DIR/autoupdate.js" ]; then
  echo "FEHLER: installer/autoupdate.js wurde nicht gefunden." >&2
  exit 1
fi
cp "$SCRIPT_DIR/autoupdate.js" "$INSTALL_DIR/updater/autoupdate.js"
chmod 755 "$INSTALL_DIR/updater/autoupdate.js"

# 3) Wrapper auf dem PATH
cat > "$UPDATE_BIN" <<EOF
#!/bin/bash
exec /usr/bin/node "$INSTALL_DIR/updater/autoupdate.js" "\$@"
EOF
chmod 755 "$UPDATE_BIN"

# 4) update.conf erzeugen/ergaenzen (bereits vorhandene Werte bleiben erhalten)
if [ ! -f "$UPDATE_CONF" ]; then
  cat > "$UPDATE_CONF" <<EOF
# Konfiguration des Update-Clients
INSTALL_DIR=$INSTALL_DIR
CONFIG_DIR=$CONFIG_DIR
DATA_DIR=$DATA_DIR
LOG_DIR=$LOG_DIR
ENV_FILE=$ENV_FILE
SERVICE_NAME=inventar-tool
STATE_FILE=$DATA_DIR/update-state.json
LOG_FILE=$LOG_DIR/updates.log
UPDATE_BIN=$UPDATE_BIN
KEEP_RELEASES=5
UPDATE_ENABLED=false
UPDATE_SERVER_URL=
UPDATE_CHANNEL=stable
UPDATE_PUBLIC_KEY=
UPDATE_AUTO_INSTALL=false
UPDATE_TELEMETRY=true
UPDATE_CHECK_HOUR=2
EOF
  echo "update.conf erstellt: $UPDATE_CONF"
else
  echo "update.conf vorhanden (wird nicht ueberschrieben): $UPDATE_CONF"
fi

# 5) Vom Aufrufer gesetzte Werte nachtragen (nur wenn explizit gesetzt)
if [ -n "${UPDATE_SERVER_URL:-}" ]; then
  sed -i "s|^UPDATE_SERVER_URL=.*|UPDATE_SERVER_URL=$UPDATE_SERVER_URL|" "$UPDATE_CONF"
fi
if [ -n "${UPDATE_PUBLIC_KEY:-}" ]; then
  # Mehrzeiliger PEM: in update.conf als einzelne Zeile mit \n abbilden
  ESCAPED="$(printf '%s' "$UPDATE_PUBLIC_KEY" | sed ':a;N;$!ba;s/\n/\\n/g')"
  sed -i "s|^UPDATE_PUBLIC_KEY=.*|UPDATE_PUBLIC_KEY=$ESCAPED|" "$UPDATE_CONF"
fi
if [ -n "${UPDATE_AUTO_INSTALL:-}" ]; then
  sed -i "s|^UPDATE_AUTO_INSTALL=.*|UPDATE_AUTO_INSTALL=$UPDATE_AUTO_INSTALL|" "$UPDATE_CONF"
fi
if [ -n "${UPDATE_ENABLED:-}" ]; then
  sed -i "s|^UPDATE_ENABLED=.*|UPDATE_ENABLED=$UPDATE_ENABLED|" "$UPDATE_CONF"
fi

# 6) sudoers-Drop-in: Backend (inventartool) darf den Updater als root ausfuehren
SUDOERS_FILE="/etc/sudoers.d/inventar-update"
cat > "$SUDOERS_FILE" <<EOF
$SERVICE_USER ALL=(root) NOPASSWD: $UPDATE_BIN install
$SERVICE_USER ALL=(root) NOPASSWD: $UPDATE_BIN download
$SERVICE_USER ALL=(root) NOPASSWD: /usr/bin/systemd-run --collect --no-block --quiet --unit=inventar-update $UPDATE_BIN install
$SERVICE_USER ALL=(root) NOPASSWD: /usr/bin/systemd-run --collect --no-block --quiet --unit=inventar-update $UPDATE_BIN download
EOF
chmod 440 "$SUDOERS_FILE"
visudo -c -f "$SUDOERS_FILE"

# 7) Benutzer anlegen, falls noch nicht vorhanden (wichtig fuer die Rechte)
getent passwd "$SERVICE_USER" >/dev/null 2>&1 || useradd -r -s /bin/false "$SERVICE_USER" || true

# 8) Autoupdater kurz testen
if ! "$UPDATE_BIN" status >/dev/null 2>&1; then
  echo "WARNUNG: Statusabruf des Updaters fehlgeschlagen – bitte pruefen."
fi

echo ""
echo "=== Auto-Updater eingerichtet ==="
echo "Client-Skript:  $UPDATE_BIN"
echo "Code:           $INSTALL_DIR/updater/autoupdate.js"
echo "Konfiguration:  $UPDATE_CONF"
echo "sudoers:        $SUDOERS_FILE"
echo ""
echo "Als naechstes (im Backend unter Administration -> System -> Updates):"
echo "  - Update-Funktion aktivieren (Schalter 'Automatische Updates aktivieren')"
echo "  - Update-Server URL setzen"
echo "  - Oeffentlichen Schluessel einfuegen und speichern"
echo "  - 'Jetzt pruefen' klicken"
echo ""
echo "Manueller Test nach Freigabe der Pruefung:"
echo "  sudo $UPDATE_BIN install"