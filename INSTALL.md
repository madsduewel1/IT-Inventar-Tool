# Installationsanleitung - MZ-Inventory Lite mit Apache2 und MySQL

Diese Anleitung beschreibt die Installation und Konfiguration von **MZ-Inventory Lite** auf einem Linux-Server (Debian / Ubuntu). SQLite und PostgreSQL werden nicht mehr unterstützt; das System läuft ausschließlich mit **MySQL/MariaDB** und wird über **Apache2** als Reverse Proxy bereitgestellt.

---

## Voraussetzungen
* Betriebssystem: **Ubuntu (22.04 LTS oder neuer)** oder **Debian (12 oder neuer)**
* Benutzerrechte: Root-Rechte (`sudo`)
* Installierte Dienste nach Ausführung der Anleitung: Node.js (v22), Apache2, MySQL Server

---

## Möglichkeit A: Automatische Installation (Empfohlen)
en 
Das mitgelieferte Installationsskript übernimmt die komplette Konfiguration (Paketinstallation, Generierung sicherer Zufallspasswörter, Konfiguration der Datenbank, Setup des Systemd-Dienstes und Einrichtung der Apache2-Konfigurationsdateien).

1. Lade das Projektverzeichnis auf den Server hoch.
2. Führe das Installationsskript als root aus:
   ```bash
   sudo bash installer/install.sh
   ```
3. Nach Abschluss der Installation ist das System unter `http://<SERVER-IP>/inventory/setup` erreichbar, um den Setup-Assistenten auszuführen.

---

## Möglichkeit B: Manuelle Installation

Falls eine detaillierte Kontrolle über den Installationsprozess gewünscht ist, folge diesen Schritten:

### 1. Pakete installieren
Installiere die benötigten Systempakete:
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg apache2 mysql-server nodejs npm
```

### 2. MySQL-Datenbank konfigurieren
1. Starte den MySQL-Dienst:
   ```bash
   sudo systemctl start mysql
   sudo systemctl enable mysql
   ```
2. Logge dich in die MySQL-Konsole ein:
   ```bash
   sudo mysql
   ```
3. Erstelle die Datenbank und den Benutzer mit einem sicheren Passwort:
   ```sql
   CREATE DATABASE IF NOT EXISTS mzinventory CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER IF NOT EXISTS 'mzinventory'@'localhost' IDENTIFIED BY 'DEIN_SICHERES_PASSWORT';
   GRANT ALL PRIVILEGES ON mzinventory.* TO 'mzinventory'@'localhost';
   FLUSH PRIVILEGES;
   EXIT;
   ```

### 3. Anwendungsverzeichnisse vorbereiten
1. Erstelle das Installationsverzeichnis:
   ```bash
   sudo mkdir -p /opt/mz-inventory
   ```
2. Kopiere die Ordner `backend` und `frontend` in das Verzeichnis `/opt/mz-inventory/`.
3. Erstelle benötigte Unterordner für Uploads und Logs:
   ```bash
   sudo mkdir -p /opt/mz-inventory/backend/uploads /opt/mz-inventory/backend/logs
   ```

### 4. Backend konfigurieren und bauen
1. Wechsle in den Backend-Ordner:
   ```bash
   cd /opt/mz-inventory/backend
   ```
2. Installiere die Abhängigkeiten:
   ```bash
   npm ci
   ```
3. Erstelle eine `.env`-Datei:
   ```bash
   sudo nano .env
   ```
   Füge folgenden Inhalt ein (ersetze `DEIN_SICHERES_PASSWORT` durch das Passwort aus Schritt 2):
   ```env
   DB_PROVIDER=mysql
   DATABASE_URL=mysql://mzinventory:DEIN_SICHERES_PASSWORT@localhost:3306/mzinventory
   JWT_SECRET=GENERIERTER_ZUFALLS_STRING_MINDESTENS_32_ZEICHEN
   JWT_EXPIRES_IN=8h
   PORT=3456
   BASE_PATH=/inventory
   NODE_ENV=production
   SETUP_DONE=false
   LOCALE=de
   SSO_ENABLED=false
   SSO_PROVIDER=
   SSO_CLIENT_ID=
   SSO_CLIENT_SECRET=
   SSO_ISSUER_URL=
   UPLOAD_DIR=/opt/mz-inventory/backend/uploads
   MAX_FILE_SIZE_MB=10
   ```
4. Führe die Prisma-Code-Generierung und das DB-Setup aus:
   ```bash
   npx prisma generate
   npx prisma db push --accept-data-loss
   ```

### 5. Frontend bauen
1. Wechsle in den Frontend-Ordner:
   ```bash
   cd /opt/mz-inventory/frontend
   ```
2. Installiere die Abhängigkeiten:
   ```bash
   npm ci
   ```
3. Baue die statischen Frontend-Dateien unter Angabe des Base-Paths:
   ```bash
   VITE_BASE_PATH="/inventory/" npm run build
   ```
4. Erstelle einen Symlink im `dist`-Ordner, um eventuelle Routing-Fehler mit dem Base-Path zu vermeiden:
   ```bash
   ln -sf . dist/inventory
   ```

### 6. Systemd-Dienst einrichten
Erstelle die Service-Datei `/etc/systemd/system/mz-inventory.service`:
```ini
[Unit]
Description=MZ-Inventory Lite API
After=network.target mysql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/mz-inventory/backend
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=10
EnvironmentFile=/opt/mz-inventory/backend/.env

[Install]
WantedBy=multi-user.target
```
Lade den systemd Daemon neu und starte den Dienst:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mz-inventory
```

### 7. Apache2 Webserver konfiguriere
1. Aktiviere die benötigten Apache-Module:
   ```bash
   sudo a2enmod proxy
   sudo a2enmod proxy_http
   sudo a2enmod rewrite
   ```
2. Erstelle die VirtualHost-Datei `/etc/apache2/sites-available/mz-inventory.conf`:
   ```apache
   <VirtualHost *:80>
       DocumentRoot /var/www/html

       # Weiterleitung bei Aufruf ohne abschließenden Slash
       RedirectMatch 301 ^/inventory$ /inventory/

       # Weiterleitung aller API-Anfragen an das Node.js Backend
       ProxyPreserveHost On
       ProxyPass /inventory/api/ http://127.0.0.1:3456/api/
       ProxyPassReverse /inventory/api/ http://127.0.0.1:3456/api/

       # Alias für hochgeladene Medien/Bilder
       Alias /inventory/uploads /opt/mz-inventory/backend/uploads
       <Directory /opt/mz-inventory/backend/uploads>
           Require all granted
           Options -Indexes -FollowSymLinks
           AllowOverride None
       </Directory>

       # Auslieferung der statischen React-Frontend-Dateien
       Alias /inventory /opt/mz-inventory/frontend/dist
       <Directory /opt/mz-inventory/frontend/dist>
           Options Indexes FollowSymLinks
           AllowOverride All
           Require all granted

           # URL-Rewriting für React Single-Page Application (SPA)
           RewriteEngine On
           RewriteBase /inventory/
           RewriteRule ^index\.html$ - [L]
           RewriteCond %{REQUEST_FILENAME} !-f
           RewriteCond %{REQUEST_FILENAME} !-d
           RewriteRule . /inventory/index.html [L]
       </Directory>

       ErrorLog ${APACHE_LOG_DIR}/mz_inventory_error.log
       CustomLog ${APACHE_LOG_DIR}/mz_inventory_access.log combined
   </VirtualHost>
   ```
3. Aktiviere die Seite und deaktiviere die Standard-Willkommensseite:
   ```bash
   sudo a2dissite 000-default
   sudo a2ensite mz-inventory
   sudo systemctl restart apache2
   ```

Die Installation ist nun abgeschlossen. Du kannst nun `http://<SERVER-IP>/inventory/setup` aufrufen, um das Setup zu beenden.
