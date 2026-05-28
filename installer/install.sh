#!/bin/bash
set -euo pipefail

echo "=== MZ-Inventory Lite - Installation ==="

INSTALL_DIR="${INSTALL_DIR:-/opt/mz-inventory}"
NODE_MIN_VERSION=22
BASE_PATH="${BASE_PATH:-/inventory}"
PORT="${PORT:-3456}"

if [ "$EUID" -ne 0 ]; then
  echo "Bitte als root ausführen (sudo bash install.sh)"
  exit 1
fi

apt-get update -q
apt-get install -y ca-certificates curl gnupg apache2 mysql-server

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt "$NODE_MIN_VERSION" ]; then
  echo "Installiere Node.js v22 (LTS) über NodeSource..."
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg || true
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update -q
  apt-get install -y nodejs
fi

REAL_REPO_DIR=$(readlink -f "$REPO_DIR")
REAL_INSTALL_DIR=$(readlink -f "$INSTALL_DIR" 2>/dev/null || echo "$INSTALL_DIR")

if [ "$REAL_REPO_DIR" != "$REAL_INSTALL_DIR" ]; then
  mkdir -p "$INSTALL_DIR"
  cp -r "$REPO_DIR"/backend "$INSTALL_DIR/"
  cp -r "$REPO_DIR"/frontend "$INSTALL_DIR/"
fi
mkdir -p "$INSTALL_DIR/backend/uploads" "$INSTALL_DIR/backend/logs"

# Configure MySQL database and user
echo "Konfiguriere MySQL-Datenbank..."
systemctl start mysql
systemctl enable mysql

DB_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")

mysql -e "CREATE DATABASE IF NOT EXISTS mzinventory CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "CREATE USER IF NOT EXISTS 'mzinventory'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';"
mysql -e "ALTER USER 'mzinventory'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';"
mysql -e "GRANT ALL PRIVILEGES ON mzinventory.* TO 'mzinventory'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"

cd "$INSTALL_DIR/backend"
npm ci

if [ ! -f "$INSTALL_DIR/backend/.env" ]; then
  echo "Erstelle neue .env Datei..."
  JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
  cat > "$INSTALL_DIR/backend/.env" << EOF
DB_PROVIDER=mysql
DATABASE_URL=mysql://mzinventory:${DB_PASSWORD}@localhost:3306/mzinventory
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
UPLOAD_DIR=$INSTALL_DIR/backend/uploads
MAX_FILE_SIZE_MB=10
EOF
else
  echo "Existierende .env gefunden, behalte Konfiguration bei."
fi

# Schema an den verwendeten DB-Provider anpassen
DB_PROVIDER="$(grep -oP '^DB_PROVIDER=\K.*' "$INSTALL_DIR/backend/.env" || echo "mysql")"
sed -i "s/provider = \"sqlite\"/provider = \"$DB_PROVIDER\"/" prisma/schema.prisma

npx prisma generate
npx prisma db push --accept-data-loss

cd "$INSTALL_DIR/frontend"
npm ci
VITE_BASE_PATH="$BASE_PATH/" npm run build

# Erstelle einen Symlink für den Base-Path, um Apache-Zugriffe bugfrei mit root zu bedienen
BASE_DIR_NAME="$(echo "$BASE_PATH" | sed 's/^\///')"
if [ -n "$BASE_DIR_NAME" ]; then
  ln -sf . "dist/$BASE_DIR_NAME"
fi

useradd -r -s /bin/false mzinventory 2>/dev/null || true
chown -R mzinventory:mzinventory "$INSTALL_DIR"
chmod 755 "$INSTALL_DIR"
chmod -R 755 "$INSTALL_DIR/frontend"
chmod 750 "$INSTALL_DIR/backend/uploads"

cat > /etc/systemd/system/mz-inventory.service << EOF
[Unit]
Description=MZ-Inventory Lite
After=network.target mysql.service

[Service]
Type=simple
User=mzinventory
WorkingDirectory=$INSTALL_DIR/backend
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=10
EnvironmentFile=$INSTALL_DIR/backend/.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable mz-inventory
systemctl restart mz-inventory

# Configure Apache2
cat > /etc/apache2/sites-available/mz-inventory.conf << EOF
<VirtualHost *:80>
    DocumentRoot /var/www/html

    # Redirect /inventory without trailing slash to /inventory/
    RedirectMatch 301 ^$BASE_PATH$ $BASE_PATH/

    # Proxy API requests to backend
    ProxyPreserveHost On
    ProxyPass $BASE_PATH/api/ http://127.0.0.1:$PORT/api/
    ProxyPassReverse $BASE_PATH/api/ http://127.0.0.1:$PORT/api/

    # Alias for uploads
    Alias $BASE_PATH/uploads $INSTALL_DIR/backend/uploads
    <Directory $INSTALL_DIR/backend/uploads>
        Require all granted
        Options -Indexes -FollowSymLinks
        AllowOverride None
    </Directory>

    # Serve frontend static files
    Alias $BASE_PATH $INSTALL_DIR/frontend/dist
    <Directory $INSTALL_DIR/frontend/dist>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted

        # Rewrite rules for Single Page Application
        RewriteEngine On
        RewriteBase $BASE_PATH/
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . $BASE_PATH/index.html [L]
    </Directory>

    ErrorLog \${APACHE_LOG_DIR}/mz_inventory_error.log
    CustomLog \${APACHE_LOG_DIR}/mz_inventory_access.log combined
</VirtualHost>
EOF

# Enable Apache2 modules
a2enmod proxy || true
a2enmod proxy_http || true
a2enmod rewrite || true

# Disable default site, enable mz-inventory
a2dissite 000-default || true
a2ensite mz-inventory || true

systemctl restart apache2

echo ""
echo "=== Installation abgeschlossen ==="
echo "Setup-Assistent: http://$(hostname -I | awk '{print $1}')$BASE_PATH/setup"
