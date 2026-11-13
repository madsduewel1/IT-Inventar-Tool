#!/bin/bash
set -euo pipefail

echo "=== Inventar-Tool - Installation ==="

export DEBIAN_FRONTEND=noninteractive

INSTALL_DIR="${INSTALL_DIR:-/opt/inventar-tool}"
CONFIG_DIR="${CONFIG_DIR:-/etc/inventar-tool}"
DATA_DIR="${DATA_DIR:-/var/lib/inventar-tool}"
LOG_DIR="${LOG_DIR:-/var/log/inventar-tool}"
ENV_FILE="$CONFIG_DIR/backend.env"
NODE_MIN_VERSION=22
BASE_PATH="${BASE_PATH:-/inventar-tool}"
BASE_PATH="$(echo "$BASE_PATH" | tr -s '/' | sed -E 's#^/##; s#/$##')"
BASE_PATH="/$BASE_PATH"
PORT="${PORT:-3456}"
DB_NAME="${DB_NAME:-inventartool}"
DB_USER="${DB_USER:-inventartool}"

if [ "$EUID" -ne 0 ]; then
  echo "Bitte als root ausfuehren (sudo bash installer/install.sh)"
  exit 1
fi

apt-get update -q
apt-get install -y ca-certificates curl gnupg apache2 mariadb-server mariadb-client rsync

if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt "$NODE_MIN_VERSION" ]; then
  echo "Installiere Node.js v22 (LTS) ueber NodeSource..."
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg || true
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update -q
  apt-get install -y nodejs
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" "$DATA_DIR/uploads" "$LOG_DIR"
rsync -a --delete --exclude node_modules --exclude .env --exclude uploads --exclude logs --exclude prisma/data "$REPO_DIR/backend/" "$INSTALL_DIR/backend/"
rsync -a --delete --exclude node_modules "$REPO_DIR/frontend/" "$INSTALL_DIR/frontend/"
if [ -n "$INSTALL_DIR" ] && [ -d "$INSTALL_DIR/backend/prisma/data" ]; then
  rm -rf -- "$INSTALL_DIR/backend/prisma/data"
fi

echo "Pruefe MariaDB-Dienst..."
if ! systemctl is-enabled --quiet mariadb 2>/dev/null; then
  systemctl enable mariadb
fi
if ! systemctl is-active --quiet mariadb; then
  echo "Starte MariaDB..."
  systemctl start mariadb || true
fi

for _ in $(seq 1 30); do
  if systemctl is-active --quiet mariadb; then
    if ! command -v mysqladmin >/dev/null 2>&1 || mysqladmin ping --silent >/dev/null 2>&1; then
      break
    fi
  fi
  sleep 1
done

if ! systemctl is-active --quiet mariadb; then
  echo "MariaDB konnte nicht gestartet werden." >&2
  systemctl status mariadb --no-pager || true
  journalctl -u mariadb -n 30 --no-pager || true
  exit 1
fi

MYSQL_BIN="$(command -v mariadb || command -v mysql || true)"
if [ -z "$MYSQL_BIN" ]; then
  echo "MariaDB-Client (mariadb/mysql) wurde nicht gefunden." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  DB_PASSWORD="$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")"
  JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"

  "$MYSQL_BIN" -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  "$MYSQL_BIN" -e "CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';"
  "$MYSQL_BIN" -e "ALTER USER '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';"
  "$MYSQL_BIN" -e "GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';"
  "$MYSQL_BIN" -e "FLUSH PRIVILEGES;"

  cat > "$ENV_FILE" << EOF
DATABASE_URL=mysql://$DB_USER:$DB_PASSWORD@localhost:3306/$DB_NAME
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=8h
PORT=$PORT
BASE_PATH=$BASE_PATH
NODE_ENV=production
SETUP_DONE=false
LOCALE=de
SSO_ENABLED=false
SSO_PROVIDER=
SSO_CLIENT_ID=
SSO_CLIENT_SECRET=
SSO_ISSUER_URL=
UPLOAD_DIR=$DATA_DIR/uploads
MAX_FILE_SIZE_MB=10
EOF
  chmod 660 "$ENV_FILE"
else
  echo "Existierende Konfiguration gefunden: $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  "$MYSQL_BIN" -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME:-inventartool}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" || true
fi

ln -sf "$ENV_FILE" "$INSTALL_DIR/backend/.env"

cd "$INSTALL_DIR/backend"
npm ci --omit=dev
npm run db:migrate
npm run prisma:generate

cd "$INSTALL_DIR/frontend"
npm ci --include=dev
VITE_BASE_PATH="$BASE_PATH/" npm run build

BASE_DIR_NAME="$(echo "$BASE_PATH" | sed 's/^\///')"
if [ -n "$BASE_DIR_NAME" ]; then
  ln -sf . "dist/$BASE_DIR_NAME"
fi

useradd -r -s /bin/false inventartool 2>/dev/null || true
chown -R inventartool:inventartool "$INSTALL_DIR" "$DATA_DIR" "$LOG_DIR"
chown root:inventartool "$ENV_FILE"
chmod 755 "$INSTALL_DIR"
chmod -R 755 "$INSTALL_DIR/frontend"
chmod 750 "$DATA_DIR/uploads" "$LOG_DIR"
chmod 660 "$ENV_FILE"

cat > /etc/systemd/system/inventar-tool.service << EOF
[Unit]
Description=Inventar-Tool
After=network.target mariadb.service

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

systemctl daemon-reload
systemctl enable inventar-tool
systemctl restart inventar-tool

# --- Apache: Anwendung unter $BASE_PATH auf Port 443 (HTTPS) bereitstellen ---
a2enmod ssl headers proxy proxy_http rewrite || true

# Zertifikat waehlen: bevorzugt das vorhandene Dev-Hub-Zertifikat, sonst ein
# selbstsigniertes Zertifikat erzeugen.
CERT_FILE="${SSL_CERT_FILE:-/etc/ssl/certs/dev-hub-self.crt}"
KEY_FILE="${SSL_KEY_FILE:-/etc/ssl/private/dev-hub-self.key}"
if [ ! -s "$CERT_FILE" ] || [ ! -s "$KEY_FILE" ]; then
  CERT_FILE="/etc/ssl/certs/inventar-tool-self.crt"
  KEY_FILE="/etc/ssl/private/inventar-tool-self.key"
  if [ ! -s "$CERT_FILE" ] || [ ! -s "$KEY_FILE" ]; then
    SERVER_CN="$(hostname -f 2>/dev/null || hostname)"
    SERVER_IP="$(hostname -I | awk '{print $1}')"
    openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
      -keyout "$KEY_FILE" -out "$CERT_FILE" \
      -subj "/CN=$SERVER_CN" \
      -addext "subjectAltName=DNS:$SERVER_CN,DNS:$(hostname),IP:$SERVER_IP" 2>/dev/null
    chmod 600 "$KEY_FILE"
    echo "Selbstsigniertes Zertifikat erstellt: $CERT_FILE"
  fi
fi

# Standort-Konfiguration, die in den SSL-vHost (Port 443) eingebunden wird.
SNIPPET="/etc/apache2/inventar-tool-snippet.conf"
cat > "$SNIPPET" << EOF
# /inventar-tool wird in den SSL-vHost (Port 443) eingebunden.
RedirectMatch 301 ^$BASE_PATH$ $BASE_PATH/

ProxyPreserveHost On
ProxyPass $BASE_PATH/api/ http://127.0.0.1:$PORT/api/
ProxyPassReverse $BASE_PATH/api/ http://127.0.0.1:$PORT/api/

# Alte QR-Etiketten mit /fehler/show/device?id=... bleiben über das
# Backend auflösbar, auch wenn die Frontend-Route schon weiterentwickelt ist.
ProxyPass /fehler/ http://127.0.0.1:$PORT/fehler/
ProxyPassReverse /fehler/ http://127.0.0.1:$PORT/fehler/

Alias $BASE_PATH/uploads $DATA_DIR/uploads
<Directory $DATA_DIR/uploads>
    Require all granted
    Options -Indexes -FollowSymLinks
    AllowOverride None
</Directory>

Alias $BASE_PATH $INSTALL_DIR/frontend/dist
<Directory $INSTALL_DIR/frontend/dist>
    Options Indexes FollowSymLinks
    AllowOverride All
    Require all granted
    RewriteEngine On
    RewriteBase $BASE_PATH/
    RewriteRule ^index\.html$ - [L]
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule . $BASE_PATH/index.html [L]
</Directory>
EOF

# Snippet in einen bereits aktiven SSL-vHost einhaengen (z. B. den Dev-Hub auf
# Port 443, der schon /lagersystem ausliefert). So teilen sich beide
# Anwendungen denselben HTTPS-Port, ohne dass sich die ServerName-Eintraege
# gegenseitig verdraengen.
SSL_VHOST=""
for conf in /etc/apache2/sites-enabled/*.conf; do
  [ -e "$conf" ] || continue
  if grep -q '<VirtualHost \*:443>' "$conf"; then
    SSL_VHOST="$conf"
    break
  fi
done

if [ -n "$SSL_VHOST" ]; then
  if ! grep -q "inventar-tool-snippet.conf" "$SSL_VHOST"; then
    perl -0pi -e "s/(<VirtualHost \*:443>)/\$1\n    Include $SNIPPET/" "$SSL_VHOST"
    echo "Snippet in SSL-vHost eingebunden: $SSL_VHOST"
  fi
else
  cat > /etc/apache2/sites-available/inventar-tool-ssl.conf << EOF
<IfModule mod_ssl.c>
<VirtualHost *:443>
    ServerName $(hostname -f 2>/dev/null || hostname)

    SSLEngine on
    SSLCertificateFile $CERT_FILE
    SSLCertificateKeyFile $KEY_FILE

    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Content-Type-Options "nosniff"
    Header always set Referrer-Policy "same-origin"

    Include $SNIPPET

    ErrorLog \${APACHE_LOG_DIR}/inventar_tool_error.log
    CustomLog \${APACHE_LOG_DIR}/inventar_tool_access.log combined
</VirtualHost>
</IfModule>
EOF
  a2ensite inventar-tool-ssl || true
fi

systemctl restart apache2

echo ""
echo "=== Installation abgeschlossen ==="
echo "Konfiguration: $ENV_FILE"
echo "MySQL-Daten bleiben ausserhalb des Code-Ordners erhalten."
echo "Setup-Assistent: https://$(hostname -f 2>/dev/null || hostname)${BASE_PATH}/setup"
echo "Status pruefen: sudo bash installer/status-check.sh"
