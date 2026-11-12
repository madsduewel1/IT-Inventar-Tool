#!/bin/bash
set -uo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/inventar-tool}"
CONFIG_DIR="${CONFIG_DIR:-/etc/inventar-tool}"
DATA_DIR="${DATA_DIR:-/var/lib/inventar-tool}"
LOG_DIR="${LOG_DIR:-/var/log/inventar-tool}"
ENV_FILE="${ENV_FILE:-$CONFIG_DIR/backend.env}"
SERVICE_NAME="${SERVICE_NAME:-inventar-tool}"
WEB_SERVICE="${WEB_SERVICE:-apache2}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

if [ -d "$LOG_DIR" ] && [ -w "$LOG_DIR" ]; then
  REPORT_FILE="$LOG_DIR/status-check-$TIMESTAMP.log"
else
  REPORT_FILE="/tmp/inventar-tool-status-check-$TIMESTAMP.log"
fi

ERRORS=0
WARNINGS=0

mkdir -p "$(dirname "$REPORT_FILE")" 2>/dev/null || true

section() {
  echo ""
  echo "===== $* ====="
}

info() {
  echo "[INFO] $*"
}

ok() {
  echo "[OK] $*"
}

warn() {
  WARNINGS=$((WARNINGS + 1))
  echo "[WARN] $*"
}

error() {
  ERRORS=$((ERRORS + 1))
  echo "[ERROR] $*"
}

run_check() {
  local title="$1"
  shift
  section "$title"
  "$@"
}

have() {
  command -v "$1" >/dev/null 2>&1
}

read_env_value() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'"
}

redact_url() {
  node - "$1" <<'NODE' 2>/dev/null || echo "<ungueltige-url>"
const input = process.argv[2] || '';
try {
  const url = new URL(input);
  if (url.password) url.password = '***';
  console.log(url.toString());
} catch {
  console.log(input.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@'));
}
NODE
}

print_header() {
  section "Inventar-Tool Status-Check"
  info "Zeit: $(date -Is)"
  info "Hostname: $(hostname 2>/dev/null || echo unknown)"
  info "Report: $REPORT_FILE"
  info "Installationspfad: $INSTALL_DIR"
  info "Konfiguration: $ENV_FILE"
}

check_commands() {
  local cmd
  for cmd in node npm systemctl curl rsync; do
    if have "$cmd"; then
      ok "$cmd gefunden: $(command -v "$cmd")"
    else
      error "$cmd fehlt"
    fi
  done

  if have mysql; then
    ok "mysql gefunden: $(mysql --version 2>/dev/null)"
  else
    warn "mysql CLI fehlt"
  fi

  if have apachectl; then
    ok "apachectl gefunden"
  else
    warn "apachectl fehlt"
  fi
}

check_versions() {
  have node && info "Node: $(node --version 2>/dev/null)"
  have npm && info "npm: $(npm --version 2>/dev/null)"
  if [ -f "$INSTALL_DIR/backend/package.json" ]; then
    info "Backend package: $(node -p "require('$INSTALL_DIR/backend/package.json').name + '@' + require('$INSTALL_DIR/backend/package.json').version" 2>/dev/null || echo unbekannt)"
  else
    error "Backend package.json fehlt"
  fi
  if [ -f "$INSTALL_DIR/frontend/package.json" ]; then
    info "Frontend package: $(node -p "require('$INSTALL_DIR/frontend/package.json').name + '@' + require('$INSTALL_DIR/frontend/package.json').version" 2>/dev/null || echo unbekannt)"
  else
    error "Frontend package.json fehlt"
  fi
}

check_files() {
  local path
  for path in "$INSTALL_DIR" "$INSTALL_DIR/backend" "$INSTALL_DIR/frontend" "$INSTALL_DIR/frontend/dist" "$DATA_DIR/uploads"; do
    if [ -e "$path" ]; then
      ok "$path vorhanden"
      ls -ld "$path" 2>/dev/null || true
    else
      error "$path fehlt"
    fi
  done

  if [ -f "$ENV_FILE" ]; then
    ok "$ENV_FILE vorhanden"
    info "Konfiguration (redacted):"
    while IFS= read -r line; do
      case "$line" in
        DATABASE_URL=*) echo "DATABASE_URL=$(redact_url "${line#DATABASE_URL=}")" ;;
        *SECRET=*|*PASSWORD=*|*PASS=*|*TOKEN=*|*KEY=*) echo "${line%%=*}=***" ;;
        *) echo "$line" ;;
      esac
    done < "$ENV_FILE"
  else
    error "$ENV_FILE fehlt"
  fi

  if [ -L "$INSTALL_DIR/backend" ]; then
    info "Backend-Symlink -> $(readlink -f "$INSTALL_DIR/backend" 2>/dev/null)"
  fi
  if [ -L "$INSTALL_DIR/frontend" ]; then
    info "Frontend-Symlink -> $(readlink -f "$INSTALL_DIR/frontend" 2>/dev/null)"
  fi
}

check_systemd() {
  if ! have systemctl; then
    error "systemctl nicht verfuegbar"
    return
  fi

  if systemctl list-unit-files "$SERVICE_NAME.service" >/dev/null 2>&1; then
    ok "Systemd-Service $SERVICE_NAME existiert"
  else
    error "Systemd-Service $SERVICE_NAME fehlt"
  fi

  systemctl is-enabled "$SERVICE_NAME" >/dev/null 2>&1 && ok "$SERVICE_NAME ist enabled" || warn "$SERVICE_NAME ist nicht enabled"
  systemctl is-active "$SERVICE_NAME" >/dev/null 2>&1 && ok "$SERVICE_NAME laeuft" || error "$SERVICE_NAME laeuft nicht"
  systemctl status "$SERVICE_NAME" --no-pager -l 2>&1 | sed -n '1,25p'

  if systemctl list-unit-files "$WEB_SERVICE.service" >/dev/null 2>&1; then
    systemctl is-active "$WEB_SERVICE" >/dev/null 2>&1 && ok "$WEB_SERVICE laeuft" || error "$WEB_SERVICE laeuft nicht"
    systemctl status "$WEB_SERVICE" --no-pager -l 2>&1 | sed -n '1,18p'
  else
    warn "$WEB_SERVICE Service nicht gefunden"
  fi

  if systemctl list-unit-files mysql.service >/dev/null 2>&1; then
    systemctl is-active mysql >/dev/null 2>&1 && ok "mysql laeuft" || error "mysql laeuft nicht"
  elif systemctl list-unit-files mariadb.service >/dev/null 2>&1; then
    systemctl is-active mariadb >/dev/null 2>&1 && ok "mariadb laeuft" || error "mariadb laeuft nicht"
  else
    warn "Kein mysql/mariadb Systemd-Service gefunden"
  fi
}

check_apache() {
  if have apachectl; then
    apachectl configtest 2>&1 && ok "Apache-Konfiguration gueltig" || error "Apache-Konfiguration fehlerhaft"
  else
    warn "Apache-Konfiguration nicht pruefbar"
  fi

  if [ -f /etc/apache2/sites-enabled/inventar-tool.conf ] || [ -L /etc/apache2/sites-enabled/inventar-tool.conf ]; then
    ok "Apache-Site inventar-tool ist aktiviert"
  else
    warn "Apache-Site inventar-tool ist nicht aktiviert"
  fi
}

check_http() {
  local port base_path backend_url frontend_url
  port="$(read_env_value PORT || true)"
  port="${port:-3456}"
  base_path="$(read_env_value BASE_PATH || true)"
  base_path="${base_path:-/inventar-tool}"
  backend_url="http://127.0.0.1:$port/api/health"
  frontend_url="http://127.0.0.1${base_path%/}/"

  if have curl; then
    if curl -fsS --max-time 5 "$backend_url" >/tmp/inventar-health.$$ 2>/tmp/inventar-curl.$$; then
      ok "Backend Healthcheck OK: $backend_url"
      cat /tmp/inventar-health.$$ 2>/dev/null || true
    else
      error "Backend Healthcheck fehlgeschlagen: $backend_url"
      cat /tmp/inventar-curl.$$ 2>/dev/null || true
    fi

    if curl -fsS --max-time 5 "$frontend_url" >/dev/null 2>/tmp/inventar-curl.$$; then
      ok "Frontend ueber Apache erreichbar: $frontend_url"
    else
      warn "Frontend ueber Apache nicht erreichbar: $frontend_url"
      cat /tmp/inventar-curl.$$ 2>/dev/null || true
    fi
    rm -f /tmp/inventar-health.$$ /tmp/inventar-curl.$$ 2>/dev/null || true
  else
    error "curl fehlt, HTTP-Checks nicht moeglich"
  fi
}

check_database() {
  if [ ! -f "$ENV_FILE" ]; then
    error "DB-Check nicht moeglich, ENV-Datei fehlt"
    return
  fi
  if [ ! -d "$INSTALL_DIR/backend" ]; then
    error "DB-Check nicht moeglich, Backend fehlt"
    return
  fi

  section "Prisma Datenbankcheck"
  (
    cd "$INSTALL_DIR/backend" || exit 1
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
    node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  await prisma.$connect();
  const [users, devices, issues, settings] = await Promise.all([
    prisma.user.count().catch(() => null),
    prisma.device.count().catch(() => null),
    prisma.deviceIssue.count().catch(() => null),
    prisma.setting.count().catch(() => null)
  ]);
  console.log(JSON.stringify({ ok: true, users, devices, issues, settings }, null, 2));
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect().catch(() => {});
});
NODE
  )
  local db_status=$?
  if [ "$db_status" -eq 0 ]; then
    ok "Prisma DB-Verbindung OK"
  else
    error "Prisma DB-Verbindung fehlgeschlagen"
  fi
}

check_ports_and_disk() {
  info "Speicher:"
  free -h 2>/dev/null || warn "free nicht verfuegbar"
  info "Festplatte:"
  df -h "$INSTALL_DIR" "$DATA_DIR" / 2>/dev/null || df -h / 2>/dev/null || warn "df nicht verfuegbar"
  info "Ports:"
  if have ss; then
    ss -tulpn 2>/dev/null | grep -E '(:80|:443|:3306|:3456)' || warn "Keine erwarteten Ports in ss-Ausgabe gefunden"
  else
    warn "ss nicht verfuegbar"
  fi
}

check_logs() {
  info "Letzte inventar-tool Journal-Eintraege:"
  journalctl -u "$SERVICE_NAME" -n 80 --no-pager 2>/dev/null || warn "journalctl fuer $SERVICE_NAME nicht lesbar"

  info "Letzte Apache-Fehler:"
  tail -n 80 /var/log/apache2/inventar_tool_error.log 2>/dev/null || warn "Apache Inventar-Fehlerlog nicht lesbar"

  info "Letzte Backend-App-Logs:"
  tail -n 80 "$INSTALL_DIR/backend/logs/app.log" 2>/dev/null || tail -n 80 "$LOG_DIR/app.log" 2>/dev/null || warn "Backend-App-Log nicht gefunden"
}

main() {
  {
    print_header
    run_check "Befehle" check_commands
    run_check "Versionen" check_versions
    run_check "Dateien und Konfiguration" check_files
    run_check "Services" check_systemd
    run_check "Apache" check_apache
    run_check "HTTP" check_http
    check_database
    run_check "Ressourcen" check_ports_and_disk
    run_check "Logs" check_logs

    section "Zusammenfassung"
    echo "Fehler: $ERRORS"
    echo "Warnungen: $WARNINGS"
    echo "Report: $REPORT_FILE"
  } 2>&1 | tee "$REPORT_FILE"

  echo ""
  echo "Status-Report gespeichert: $REPORT_FILE"
  if [ "$ERRORS" -gt 0 ]; then
    exit 1
  fi
}

main "$@"
