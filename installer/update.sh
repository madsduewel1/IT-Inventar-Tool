#!/bin/bash
set -Eeuo pipefail

echo "=== Inventar-Tool - Sicheres Update ==="

INSTALL_DIR="${INSTALL_DIR:-/opt/inventar-tool}"
CONFIG_DIR="${CONFIG_DIR:-/etc/inventar-tool}"
DATA_DIR="${DATA_DIR:-/var/lib/inventar-tool}"
LOG_DIR="${LOG_DIR:-/var/log/inventar-tool}"
ENV_FILE="${ENV_FILE:-$CONFIG_DIR/backend.env}"
SERVICE_NAME="${SERVICE_NAME:-inventar-tool}"
WEB_SERVICE="${WEB_SERVICE:-apache2}"
SYSTEMD_UNIT="/etc/systemd/system/$SERVICE_NAME.service"
APACHE_SITE="/etc/apache2/sites-available/inventar-tool.conf"
NODE_MIN_VERSION="${NODE_MIN_VERSION:-22}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
SKIP_APT="${SKIP_APT:-false}"
SKIP_DB_MIGRATE="${SKIP_DB_MIGRATE:-false}"
SKIP_HEALTHCHECK="${SKIP_HEALTHCHECK:-false}"

if [ "$EUID" -ne 0 ]; then
  echo "Bitte als root ausfuehren (sudo bash installer/update.sh)"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Keine bestehende Konfiguration unter $ENV_FILE gefunden."
  echo "Bitte einmal installer/install.sh ausfuehren."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
RELEASES_DIR="$INSTALL_DIR/releases"
BACKUP_DIR="$INSTALL_DIR/backups/$TIMESTAMP"
NEW_RELEASE="$RELEASES_DIR/$TIMESTAMP"
OLD_BACKEND=""
OLD_FRONTEND=""
SWITCHED=false

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

fail() {
  echo "FEHLER: $*" >&2
  exit 1
}

on_error() {
  local exit_code=$?
  echo ""
  echo "FEHLER: Update wurde abgebrochen (Exit $exit_code)." >&2
  restore_runtime_configs || true
  if [ "$SWITCHED" = "true" ]; then
    rollback || true
  else
    log "Live-Installation wurde noch nicht umgeschaltet."
  fi
  exit "$exit_code"
}

rollback() {
  log "Rollback auf vorherigen Stand..."
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  if [ -n "$OLD_BACKEND" ] && [ -d "$OLD_BACKEND" ]; then
    rm -rf "$INSTALL_DIR/backend" 2>/dev/null || true
    ln -sfn "$OLD_BACKEND" "$INSTALL_DIR/backend"
  fi
  if [ -n "$OLD_FRONTEND" ] && [ -d "$OLD_FRONTEND" ]; then
    rm -rf "$INSTALL_DIR/frontend" 2>/dev/null || true
    ln -sfn "$OLD_FRONTEND" "$INSTALL_DIR/frontend"
  fi
  restore_runtime_configs || true
  systemctl start "$SERVICE_NAME" 2>/dev/null || true
  systemctl reload "$WEB_SERVICE" 2>/dev/null || systemctl restart "$WEB_SERVICE" 2>/dev/null || true
  log "Rollback beendet."
}

restore_runtime_configs() {
  local restored=false
  if [ -f "$BACKUP_DIR/$(basename "$SYSTEMD_UNIT")" ]; then
    cp "$BACKUP_DIR/$(basename "$SYSTEMD_UNIT")" "$SYSTEMD_UNIT"
    restored=true
  fi
  if [ -f "$BACKUP_DIR/$(basename "$APACHE_SITE")" ]; then
    cp "$BACKUP_DIR/$(basename "$APACHE_SITE")" "$APACHE_SITE"
    restored=true
  fi
  if [ "$restored" = "true" ]; then
    systemctl daemon-reload 2>/dev/null || true
    systemctl reload "$WEB_SERVICE" 2>/dev/null || systemctl restart "$WEB_SERVICE" 2>/dev/null || true
    log "Vorherige Runtime-Konfiguration wiederhergestellt."
  fi
}

trap on_error ERR

read_env_value() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Benoetigter Befehl fehlt: $1"
}

install_system_dependencies() {
  if [ "$SKIP_APT" = "true" ]; then
    log "APT-Schritt uebersprungen (SKIP_APT=true)."
    return
  fi

  log "Systemabhaengigkeiten pruefen/aktualisieren..."
  apt-get update -q
  apt-get install -y ca-certificates curl gnupg rsync apache2 mariadb-client

  if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt "$NODE_MIN_VERSION" ]; then
    log "Installiere Node.js $NODE_MIN_VERSION ueber NodeSource..."
    mkdir -p /etc/apt/keyrings
    curl -fsSL "https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key" | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MIN_VERSION}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
    apt-get update -q
    apt-get install -y nodejs
  fi
}

prepare_directories() {
  mkdir -p "$INSTALL_DIR" "$RELEASES_DIR" "$BACKUP_DIR" "$DATA_DIR/uploads" "$LOG_DIR"
}

copy_release() {
  log "Kopiere Code in neues Release: $NEW_RELEASE"
  mkdir -p "$NEW_RELEASE/backend" "$NEW_RELEASE/frontend"
  rsync -a --delete --exclude node_modules --exclude .env --exclude uploads --exclude logs --exclude prisma/data "$REPO_DIR/backend/" "$NEW_RELEASE/backend/"
  rsync -a --delete --exclude node_modules --exclude dist "$REPO_DIR/frontend/" "$NEW_RELEASE/frontend/"
  ln -sfn "$ENV_FILE" "$NEW_RELEASE/backend/.env"
  mkdir -p "$NEW_RELEASE/backend/logs" "$NEW_RELEASE/frontend"
}

backup_database() {
  local db_url
  db_url="$(read_env_value DATABASE_URL || true)"
  if [ -z "$db_url" ] || ! command -v mysqldump >/dev/null 2>&1; then
    log "Datenbank-Backup uebersprungen (DATABASE_URL oder mysqldump fehlt)."
    return
  fi

  log "Erstelle Datenbank-Backup..."
  node - "$db_url" "$BACKUP_DIR/db.sql" <<'NODE'
const { spawnSync } = require('child_process');
const [url, out] = process.argv.slice(2);
try {
  const parsed = new URL(url);
  const args = [
    `--host=${parsed.hostname}`,
    `--port=${parsed.port || 3306}`,
    `--user=${decodeURIComponent(parsed.username)}`,
    `--password=${decodeURIComponent(parsed.password)}`,
    '--single-transaction',
    '--routines',
    '--triggers',
    decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  ];
  const dump = spawnSync('mysqldump', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 500 });
  if (dump.status !== 0) {
    console.error(dump.stderr || dump.stdout || 'mysqldump failed');
    process.exit(1);
  }
  require('fs').writeFileSync(out, dump.stdout);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
NODE
  gzip -f "$BACKUP_DIR/db.sql"
  log "Datenbank-Backup: $BACKUP_DIR/db.sql.gz"
}

build_release() {
  log "Installiere Backend-Abhaengigkeiten..."
  cd "$NEW_RELEASE/backend"
  npm ci --omit=dev
  npm run prisma:generate

  if [ "$SKIP_DB_MIGRATE" != "true" ]; then
    backup_database
    log "Aktualisiere Datenbank-Schema (prisma db push)..."
    npm run db:migrate
  else
    log "Datenbank-Migration uebersprungen (SKIP_DB_MIGRATE=true)."
  fi

  log "Installiere Frontend-Abhaengigkeiten und baue Frontend..."
  cd "$NEW_RELEASE/frontend"
  npm ci --include=dev
  local base_path
  base_path="$(read_env_value BASE_PATH || true)"
  base_path="${base_path:-/inventar-tool}"
  base_path="$(echo "$base_path" | tr -s '/' | sed -E 's#^/##; s#/$##')"
  base_path="/$base_path"
  VITE_BASE_PATH="${base_path%/}/" npm run build

  local base_dir_name
  base_dir_name="$(echo "$base_path" | sed 's/^\///')"
  if [ -n "$base_dir_name" ]; then
    ln -sfn . "dist/$base_dir_name"
  fi
}

switch_release() {
  log "Schalte neues Release live..."
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true

  OLD_BACKEND=""
  OLD_FRONTEND=""
  if [ -L "$INSTALL_DIR/backend" ]; then
    OLD_BACKEND="$(readlink -f "$INSTALL_DIR/backend")"
  elif [ -d "$INSTALL_DIR/backend" ]; then
    OLD_BACKEND="$BACKUP_DIR/backend.previous"
    rm -rf "$OLD_BACKEND"
    mv "$INSTALL_DIR/backend" "$OLD_BACKEND"
  fi
  if [ -L "$INSTALL_DIR/frontend" ]; then
    OLD_FRONTEND="$(readlink -f "$INSTALL_DIR/frontend")"
  elif [ -d "$INSTALL_DIR/frontend" ]; then
    OLD_FRONTEND="$BACKUP_DIR/frontend.previous"
    rm -rf "$OLD_FRONTEND"
    mv "$INSTALL_DIR/frontend" "$OLD_FRONTEND"
  fi

  rm -rf "$INSTALL_DIR/backend" 2>/dev/null || true
  rm -rf "$INSTALL_DIR/frontend" 2>/dev/null || true
  ln -sfn "$NEW_RELEASE/backend" "$INSTALL_DIR/backend"
  ln -sfn "$NEW_RELEASE/frontend" "$INSTALL_DIR/frontend"
  SWITCHED=true

  useradd -r -s /bin/false inventartool 2>/dev/null || true
  chown -R inventartool:inventartool "$NEW_RELEASE" "$DATA_DIR" "$LOG_DIR"
  chown root:inventartool "$ENV_FILE"
  chmod 660 "$ENV_FILE"
  chmod 755 "$INSTALL_DIR"
  chmod -R 755 "$NEW_RELEASE/frontend"
  chmod 750 "$DATA_DIR/uploads" "$LOG_DIR"

  systemctl daemon-reload
  systemctl start "$SERVICE_NAME"
  systemctl reload "$WEB_SERVICE" 2>/dev/null || systemctl restart "$WEB_SERVICE"
}

write_runtime_configs() {
  local port base_path
  port="$(read_env_value PORT || true)"
  port="${port:-3456}"
  base_path="$(read_env_value BASE_PATH || true)"
  base_path="${base_path:-/inventar-tool}"
  base_path="$(echo "$base_path" | tr -s '/' | sed -E 's#^/##; s#/$##')"
  base_path="/$base_path"

  log "Aktualisiere Systemd- und Apache-Konfiguration..."
  if [ -f "$SYSTEMD_UNIT" ]; then
    cp "$SYSTEMD_UNIT" "$BACKUP_DIR/$(basename "$SYSTEMD_UNIT")"
  fi
  if [ -f "$APACHE_SITE" ]; then
    cp "$APACHE_SITE" "$BACKUP_DIR/$(basename "$APACHE_SITE")"
  fi

  cat > "$SYSTEMD_UNIT" <<EOF
[Unit]
Description=Inventar-Tool
After=network.target mysql.service mariadb.service

[Service]
Type=simple
User=inventartool
WorkingDirectory=$INSTALL_DIR/backend
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=10
EnvironmentFile=$ENV_FILE

[Install]
WantedBy=multi-user.target
EOF

  cat > "$APACHE_SITE" <<EOF
<VirtualHost *:80>
    DocumentRoot /var/www/html
    RedirectMatch 301 ^$base_path$ $base_path/

    ProxyPreserveHost On
    ProxyPass $base_path/api/ http://127.0.0.1:$port/api/
    ProxyPassReverse $base_path/api/ http://127.0.0.1:$port/api/

    Alias $base_path/uploads $DATA_DIR/uploads
    <Directory $DATA_DIR/uploads>
        Require all granted
        Options -Indexes -FollowSymLinks
        AllowOverride None
    </Directory>

    Alias $base_path $INSTALL_DIR/frontend/dist
    <Directory $INSTALL_DIR/frontend/dist>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
        RewriteEngine On
        RewriteBase $base_path/
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . $base_path/index.html [L]
    </Directory>

    ErrorLog \${APACHE_LOG_DIR}/inventar_tool_error.log
    CustomLog \${APACHE_LOG_DIR}/inventar_tool_access.log combined
</VirtualHost>
EOF

  a2enmod proxy proxy_http rewrite >/dev/null 2>&1 || true
  a2ensite inventar-tool >/dev/null 2>&1 || true
  apachectl configtest
}

install_updater_helper() {
  local source="$REPO_DIR/installer/inventar-update.js"
  local target="/usr/local/bin/inventar-update"
  local conf="$CONFIG_DIR/update.conf"

  if [ -f "$conf" ] && ! grep -q '^BRANCH=' "$conf"; then
    echo "BRANCH=${UPDATE_BRANCH:-main}" >> "$conf"
    log "BRANCH in update.conf ergaenzt."
  fi

  if [ ! -f "$source" ]; then
    log "Update-Helfer-Quelle fehlt; Helfer wird nicht aktualisiert."
    return
  fi
  if [ ! -e "$target" ]; then
    log "Update-Helfer ist nicht installiert; bitte installer/register-updater.sh ausfuehren."
    return
  fi

  install -m 0755 "$source" "$target"
  log "Update-Helfer aktualisiert: $target"
}

healthcheck() {
  if [ "$SKIP_HEALTHCHECK" = "true" ]; then
    log "Healthcheck uebersprungen (SKIP_HEALTHCHECK=true)."
    return
  fi

  local port base_path url
  port="$(read_env_value PORT || true)"
  port="${port:-3456}"
  base_path="$(read_env_value BASE_PATH || true)"
  base_path="${base_path:-/inventar-tool}"
  base_path="$(echo "$base_path" | tr -s '/' | sed -E 's#^/##; s#/$##')"
  base_path="/$base_path"
  url="http://127.0.0.1:$port/api/health"

  log "Pruefe Backend: $url"
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      log "Backend-Healthcheck OK."
      return
    fi
    sleep 2
  done

  systemctl status "$SERVICE_NAME" --no-pager || true
  fail "Backend-Healthcheck fehlgeschlagen."
}

cleanup_old_releases() {
  log "Raeume alte Releases auf (behalte $KEEP_RELEASES)..."
  find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n "+$((KEEP_RELEASES + 1))" | xargs -r rm -rf
}

install_system_dependencies
require_command rsync
require_command npm
require_command node
require_command systemctl
require_command curl
prepare_directories
copy_release
build_release
write_runtime_configs
switch_release
install_updater_helper
healthcheck
cleanup_old_releases

trap - ERR

echo ""
echo "=== Update abgeschlossen ==="
echo "Aktives Release: $NEW_RELEASE"
echo "Backup/Diagnose: $BACKUP_DIR"
echo "Status pruefen: sudo bash installer/status-check.sh"
