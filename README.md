# Inventar-Tool

Selbst hostbares Inventarisierungs-, Verleih- und Ticketing-System fuer Medienzentren und Schulen.

---

## Inhaltsverzeichnis

1. [So funktioniert das System](#so-funktioniert-das-system)
2. [Voraussetzungen](#voraussetzungen)
3. [Automatische Installation (empfohlen)](#automatische-installation-empfohlen)
4. [Manuelle Installation](#manuelle-installation)
5. [Update](#update)
6. [Status-Check](#status-check)
7. [Automatisches Update](#automatisches-update)
8. [Konfiguration](#konfiguration)
8. [Datenbank-Details](#datenbank-details)
9. [Wichtige Pfade](#wichtige-pfade)
10. [Lokale Entwicklung](#lokale-entwicklung)
11. [Haeufige Probleme](#haeufige-probleme)

---

## So funktioniert das System

Damit die manuelle Installation nachvollziehbar ist, hier der grobe Aufbau:

```
Browser ──> Apache2 (Port 80)
              │
              ├── /inventar-tool/          → Frontend (statische React-App, fertig gebaut)
              │                              in /opt/inventar-tool/frontend/dist
              │
              ├── /inventar-tool/api/*     → Reverse-Proxy an das Backend
              │                              (Node.js/Express, Port 3456, /opt/inventar-tool/backend)
              │
              └── /inventar-tool/uploads/* → hochgeladene Dateien (direkt)
                                             (/var/lib/inventar-tool/uploads)

Backend (Node.js/Express, Port 3456)
  └── Prisma ORM ──> MySQL / MariaDB (localhost:3306, Datenbank `inventartool`)
```

- **Frontend** ist eine Single-Page-App (React + Vite). Beim Installieren wird sie mit
  `vite build` zu statischen Dateien gebaut und von Apache2 direkt ausgeliefert.
- **Backend** ist eine REST-API (`/api/...`), die alle Daten aus MySQL liest und schreibt.
  Zugriffe auf `/inventar-tool/api/*` leitet Apache2 an `http://127.0.0.1:3456` weiter.
- **Konfiguration** liegt bewusst ausserhalb des Code-Ordners unter `/etc/inventar-tool/backend.env`
  und ueberlebt dadurch jedes Update.

---

## Voraussetzungen

| Anforderung | Version |
|---|---|
| Betriebssystem | Debian / Ubuntu (LTS) |
| Node.js | >= 22 (wird automatisch installiert) |
| Datenbank | MySQL 8 oder MariaDB 10.6+ |
| Webserver | Apache2 (wird automatisch installiert) |

---

## Automatische Installation (empfohlen)

Das Installationsskript richtet alles vollstaendig ein:
Node.js, Apache2, MySQL, Systemd-Service, Datenbankbenutzer und Umgebungsvariablen.

```bash
# Projektordner auf den Server hochladen, dann:
sudo bash installer/install.sh
```

**Was das Skript ausfuehrt:**

1. Installiert Systemabhaengigkeiten (`apache2`, `mysql-server`, `nodejs 22`, `rsync`)
2. Erstellt MySQL-Datenbank, Benutzer und ein zufaelliges Passwort
3. Kopiert Backend und Frontend nach `/opt/inventar-tool`
4. Schreibt die dauerhafte Konfiguration nach `/etc/inventar-tool/backend.env`
5. Fuehrt die Datenbankmigrationen aus (`prisma generate` + `prisma db push`)
6. Baut das Frontend (`vite build`)
7. Legt den Systemd-Service `inventar-tool` an und startet ihn
8. Konfiguriert Apache2 als Reverse-Proxy mit der Alias-Route `/inventar-tool`

Nach dem Abschluss zeigt das Skript die URL des Setup-Assistenten an, z. B.:

```
Setup-Assistent: http://192.168.1.100/inventar-tool/setup
```

Das Skript ist sicher wiederholbar: Wenn die Konfiguration bereits existiert,
wird sie nicht ueberschrieben, sondern weiterverwendet.

---

## Manuelle Installation

> Die manuelle Installation fuert exakt die Schritte aus, die `installer/install.sh`
> automatisiert. Sie ist nur dann noetig, wenn die automatische Installation auf
> einem ungewoehnlichen System nicht moeglich ist.

### Uebersicht

| Schritt | Ziel |
|---|---|
| 1 | Systemabhaengigkeiten und Node.js installieren |
| 2 | Verzeichnisstruktur anlegen |
| 3 | Projektcode nach `/opt/inventar-tool` kopieren |
| 4 | MySQL-Datenbank und -Benutzer anlegen |
| 5 | Konfigurationsdatei `backend.env` erstellen |
| 6 | Abhaengigkeiten installieren, DB-Schema anlegen, Frontend bauen |
| 7 | Systembenutzer `inventartool` und Berechtigungen einrichten |
| 8 | Systemd-Dienst `inventar-tool` anlegen und starten |
| 9 | Apache2 als Reverse-Proxy konfigurieren |
| 10 | Installation pruefen |

---

### Schritt 1: Systemabhaengigkeiten und Node.js installieren

Es werden benoetigt: **Apache2** (Webserver), **MySQL/MariaDB** (Datenbank) und **rsync**
(robuustes Datei-Kopieren fuer Schritt 3). Danach wird **Node.js 22 LTS** ueber das
offizielle NodeSource-Repository installiert.

```bash
sudo apt-get update
sudo apt-get install -y apache2 mysql-server rsync

# Node.js 22 (LTS) ueber NodeSource
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
  | sudo tee /etc/apt/sources.list.d/nodesource.list
sudo apt-get update
sudo apt-get install -y nodejs
```

Pruefen:

```bash
node -v   # sollte "v22.x" oder hoeher ausgeben
```

### Schritt 2: Verzeichnisstruktur anlegen

Es werden vier Verzeichnisse angelegt, damit Anwendung, Konfiguration, Uploads und Logs
sauber getrennt sind:

| Verzeichnis | Zweck |
|---|---|
| `/opt/inventar-tool` | Anwendungscode (Backend + Frontend) |
| `/etc/inventar-tool` | Konfiguration (bleibt bei Updates erhalten) |
| `/var/lib/inventar-tool/uploads` | hochgeladene Dateien |
| `/var/log/inventar-tool` | Logs |

```bash
sudo mkdir -p /opt/inventar-tool /etc/inventar-tool /var/lib/inventar-tool/uploads /var/log/inventar-tool
```

### Schritt 3: Projektcode kopieren

Der Code wird **ohne** `node_modules` (wird im naechsten Schritt installiert) und **ohne**
lokale `.env`/Upload-Dateien nach `/opt/inventar-tool` kopiert:

```bash
# Vom Projektordner aus ausfuehren:
sudo rsync -a --delete --exclude node_modules --exclude .env --exclude uploads --exclude logs --exclude prisma/data backend/ /opt/inventar-tool/backend/
sudo rsync -a --delete --exclude node_modules frontend/ /opt/inventar-tool/frontend/
```

### Schritt 4: MySQL-Datenbank und -Benutzer anlegen

```bash
sudo systemctl start mysql
sudo mysql
```

```sql
CREATE DATABASE IF NOT EXISTS `inventartool` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'inventartool'@'localhost' IDENTIFIED BY 'SICHERES_PASSWORT';
GRANT ALL PRIVILEGES ON `inventartool`.* TO 'inventartool'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

> **Hinweis zu Berechtigungen:** Der Datenbankbenutzer braucht `ALL PRIVILEGES` auf die Datenbank,
> damit Prisma das Schema anlegen (`db push`) und zur Laufzeit Datensaetze lesen und schreiben kann.
> Fuer einen produktiven Betrieb mit minimalen Rechten reichen:
> `SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES`.

### Schritt 5: Konfigurationsdatei erstellen

Alle Einstellungen liegen in einer Datei, `/etc/inventar-tool/backend.env`. Wichtig sind
`DATABASE_URL` (aus Schritt 4) und ein sicheres `JWT_SECRET`.

```bash
sudo tee /etc/inventar-tool/backend.env > /dev/null << 'EOF'
DATABASE_URL=mysql://inventartool:SICHERES_PASSWORT@localhost:3306/inventartool
JWT_SECRET=ZUFAELLIGER_LANGER_STRING
JWT_EXPIRES_IN=8h
PORT=3456
BASE_PATH=/inventar-tool
NODE_ENV=production
SETUP_DONE=false
LOCALE=de
SSO_ENABLED=false
SSO_PROVIDER=
SSO_CLIENT_ID=
SSO_CLIENT_SECRET=
SSO_ISSUER_URL=
UPLOAD_DIR=/var/lib/inventar-tool/uploads
MAX_FILE_SIZE_MB=10
EOF

sudo chmod 660 /etc/inventar-tool/backend.env
sudo ln -sf /etc/inventar-tool/backend.env /opt/inventar-tool/backend/.env
```

Der Symlink `/opt/inventar-tool/backend/.env` zeigt auf die Konfigurationsdatei, damit das
Backend die Werte beim Start liest.

> **Tipp:** Einen sicheren JWT_SECRET generieren:
> ```bash
> node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
> ```

### Schritt 6: Abhaengigkeiten installieren, DB-Schema anlegen, Frontend bauen

**Warum `npm ci` und nicht `npm install`?** `npm ci` installiert exakt die Versionen aus
`package-lock.json` und ist dadurch reproduzierbar. Das Backend wird mit `--omit=dev`
installiert (nur Produktionsabhaengigkeiten; der Prisma-CLI ist eine davon und braucht kein
Entwicklungs-Paket). Das Frontend benoetigt fuer den Build dagegen die Entwicklungs-Pakete
(`--include=dev`).

```bash
# Backend
cd /opt/inventar-tool/backend
sudo npm ci --omit=dev
sudo npm run db:migrate        # Schema anlegen + Prisma-Client generieren (einmalig / bei Schema-Aenderungen)
sudo npm run prisma:generate   # Prisma-Client neu generieren (Standalone-Befehl)

# Frontend
cd /opt/inventar-tool/frontend
sudo npm ci --include=dev
sudo VITE_BASE_PATH="/inventar-tool/" npm run build

# Symlink fuer den Alias-Pfad (SPA-Routing)
sudo ln -sf . /opt/inventar-tool/frontend/dist/inventar-tool
```

> `db:migrate` fuehrt intern bereits `prisma generate` aus und legt danach das Schema in der
> Datenbank an. Der separate Befehl `prisma:generate` ist fuer den Fall gedacht, dass nur der
> Client neu generiert werden soll (z. B. nach einer Schema-Aenderung).

Der Symlink `dist/inventar-tool` sorgt dafuer, dass der Browser auch bei Pfaden wie
`/inventar-tool/devices/XYZ` (Spa-Routing ohne Server-URL) die App findet.

### Schritt 7: Systembenutzer und Berechtigungen

Es wird ein Systembenutzer ohne Login-Shell (`inventartool`) angelegt. Der Dienst laeuft mit
diesem Benutzer, damit die Anwendung keine root-Rechte braucht:

```bash
sudo useradd -r -s /bin/false inventartool
sudo chown -R inventartool:inventartool /opt/inventar-tool /var/lib/inventar-tool /var/log/inventar-tool
sudo chown root:inventartool /etc/inventar-tool/backend.env
sudo chmod 660 /etc/inventar-tool/backend.env
```

### Schritt 8: Systemd-Dienst anlegen und starten

```bash
sudo tee /etc/systemd/system/inventar-tool.service > /dev/null << 'EOF'
[Unit]
Description=Inventar-Tool
After=network.target mysql.service

[Service]
Type=simple
User=inventartool
WorkingDirectory=/opt/inventar-tool/backend
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=10
EnvironmentFile=/etc/inventar-tool/backend.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable inventar-tool
sudo systemctl start inventar-tool
```

> **Hinweis:** `ExecStart=/usr/bin/node` setzt voraus, dass `which node` → `/usr/bin/node`
> ergibt (Standard bei NodeSource). Abweichende Pfade entsprechend anpassen.

### Schritt 9: Apache2 als Reverse-Proxy konfigurieren

Apache2 liefert das gebaute Frontend aus und leitet API-Anfragen an das Backend weiter.
Die URL `/inventar-tool` wird dabei als Basis verwendet:

```bash
sudo a2enmod proxy proxy_http rewrite
sudo a2dissite 000-default

sudo tee /etc/apache2/sites-available/inventar-tool.conf > /dev/null << 'EOF'
<VirtualHost *:80>
    DocumentRoot /var/www/html
    RedirectMatch 301 ^/inventar-tool$ /inventar-tool/

    ProxyPreserveHost On
    ProxyPass /inventar-tool/api/ http://127.0.0.1:3456/api/
    ProxyPassReverse /inventar-tool/api/ http://127.0.0.1:3456/api/

    Alias /inventar-tool/uploads /var/lib/inventar-tool/uploads
    <Directory /var/lib/inventar-tool/uploads>
        Require all granted
        Options -Indexes -FollowSymLinks
        AllowOverride None
    </Directory>

    Alias /inventar-tool /opt/inventar-tool/frontend/dist
    <Directory /opt/inventar-tool/frontend/dist>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
        RewriteEngine On
        RewriteBase /inventar-tool/
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /inventar-tool/index.html [L]
    </Directory>

    ErrorLog ${APACHE_LOG_DIR}/inventar_tool_error.log
    CustomLog ${APACHE_LOG_DIR}/inventar_tool_access.log combined
</VirtualHost>
EOF

sudo a2ensite inventar-tool
sudo systemctl restart apache2
```

### Schritt 10: Installation pruefen

```bash
# Backend-Dienst laeuft?
systemctl status inventar-tool

# API antwortet? (sollte {"ok":true,...} liefern)
curl -s http://127.0.0.1:3456/api/health

# Apache-Konfiguration fehlerfrei?
apachectl configtest
```

Die Anwendung ist jetzt erreichbar unter `http://<SERVER-IP>/inventar-tool/`.
Beim ersten Aufruf oeffnet sich der Setup-Assistent, ueber den der erste Administrator
und die Grundeinstellungen angelegt werden.

---

## Update

Neue Projektversion auf den Server hochladen und das Update-Skript ausfuehren:

```bash
sudo bash installer/update.sh
```

**Was das Skript ausfuehrt:**

1. Prueft und aktualisiert benoetigte Systemabhaengigkeiten
2. Kopiert Backend und Frontend in ein neues Release-Verzeichnis unter `/opt/inventar-tool/releases`
3. Installiert Node-Abhaengigkeiten per `npm ci`
4. Generiert den Prisma-Client neu
5. Erstellt vor Schema-Aenderungen ein Datenbank-Backup, sofern `mysqldump` verfuegbar ist
6. Aktualisiert das Datenbank-Schema per `prisma db push`
7. Baut das Frontend neu
8. Aktualisiert Systemd- und Apache-Konfiguration mit Backup
9. Schaltet erst danach den Live-Pfad um und startet den Dienst neu
10. Fuehrt einen Backend-Healthcheck aus und rollt bei Fehlern auf den vorherigen Stand zurueck

Das Update ist bewusst defensiv: Wenn Installation, Build, Migration oder Healthcheck fehlschlagen,
bleibt der alte Stand aktiv oder wird automatisch wieder aktiviert.

Optionale Schalter:

```bash
# Ohne APT-Schritt ausfuehren
sudo SKIP_APT=true bash installer/update.sh

# Datenbank-Schema nicht anfassen
sudo SKIP_DB_MIGRATE=true bash installer/update.sh

# Healthcheck am Ende ueberspringen
sudo SKIP_HEALTHCHECK=true bash installer/update.sh
```

Backups und Diagnose-Dateien liegen unter `/opt/inventar-tool/backups`.

### Manuelles Update

> Das Update-Skript `update.sh` automatisiert die folgenden Schritte. Falls du selbst
> Hand anlegen willst (z. B. in einer Umgebung, in der die Skripte nicht funktionieren),
> fuere sie von Hand aus. Die Reihenfolge ist wichtig: Immer erst Datenbank-Backup,
> dann Code aktualisieren, dann bauen und erst zuletzt den Dienst neu starten.

**1. Datenbank-Backup (Pflicht bei Schema-Aenderungen)**

Der Aufruf `prisma db push` unten aendert das Datenbankschema. Mache daher vorher
ein Backup und pruefe, dass `mysqldump` verfuegbar ist:

```bash
sudo mkdir -p /opt/inventar-tool/backups
sudo mysqldump --single-transaction -u inventartool -p inventartool \
  > /opt/inventar-tool/backups/pre-update-$(date +%F-%H%M).sql
```

**2. Dienst stoppen**

```bash
sudo systemctl stop inventar-tool
```

**3. Code aktualisieren**

Neue Backend- und Frontend-Dateien nach `/opt/inventar-tool` kopieren (**ohne**
`node_modules`, wird gleich wieder installiert). Dabei `backend/.env` unangetastet lassen,
er ist ein Symlink auf `/etc/inventar-tool/backend.env`:

```bash
sudo rsync -a --delete --exclude node_modules --exclude .env --exclude uploads --exclude logs --exclude prisma/data backend/ /opt/inventar-tool/backend/
sudo rsync -a --delete --exclude node_modules frontend/ /opt/inventar-tool/frontend/
```

**4. Abhaengigkeiten neu installieren**

```bash
cd /opt/inventar-tool/backend
sudo npm ci --omit=dev

cd /opt/inventar-tool/frontend
sudo npm ci --include=dev
```

**5. Prisma-Client generieren + Schema aktualisieren**

```bash
cd /opt/inventar-tool/backend
sudo npm run prisma:generate   # Client an das neue Schema anpassen
sudo npm run db:migrate        # Schema in der Datenbank aktualisieren (prisma db push)
```

> `db:migrate` fuehrt intern selbst `prisma generate` aus. Der Schritt davor ist nur
> notwendig, wenn die Reihenfolge im eigenen Skript abweicht — er schadet nicht.

**6. Frontend neu bauen**

```bash
cd /opt/inventar-tool/frontend
sudo VITE_BASE_PATH="/inventar-tool/" npm run build

# Symlink fuer den Alias-Pfad (SPA-Routing) erneut setzen, falls das Build-Verzeichnis neu ist
sudo ln -sf . /opt/inventar-tool/frontend/dist/inventar-tool
```

**7. Berechtigungen sichern (falls Dateien als anderer Benutzer kopiert wurden)**

```bash
sudo chown -R inventartool:inventartool /opt/inventar-tool
```

**8. Dienst starten und pruefen**

```bash
sudo systemctl start inventar-tool
systemctl status inventar-tool

curl -s http://127.0.0.1:3456/api/health   # sollte {"ok":true,...} liefern
apachectl configtest                        # Apache-Konfiguration fehlerfrei?
```

> **Hinweis zur Schema-Aenderung:** Wenn die neue Version keine Schema-Aenderung enthaelt,
> koennen die Schritte 1 und der `db:migrate`-Teil aus Schritt 5 entfallen. Im Zweifel einfach
> mit ausfuehren — `prisma db push` ist idempotent und richtet keinen Schaden an, wenn sich
> nichts geaendert hat.

> **Rollback:** Verbirgt der Healthcheck einen Fehler, kann der alte Stand aus dem Backup
> in Schritt 1 sowie dem vorherigen Code-Stand wiederhergestellt werden, bevor der Dienst
> neu gestartet wird.

---

## Status-Check

Das Status-Skript sammelt Systeminformationen, Service-Zustand, Apache-Konfiguration,
HTTP-Erreichbarkeit, Prisma-Datenbankverbindung, Speicherplatz, Ports und relevante Logs:

```bash
sudo bash installer/status-check.sh
```

Der Report wird nach Moeglichkeit unter `/var/log/inventar-tool/status-check-<datum>.log`
gespeichert, sonst unter `/tmp/inventar-tool-status-check-<datum>.log`.

---

## Automatisches Update

Das Inventar-Tool kann sich von einem eigenen **Update-Server** (separater Ordner
`update-inventar-tool/` im gemeinsamen Projektverzeichnis, z. B. unter
`update-inventar-tool.schnikdu.com`) automatisch aktualisieren. Die Kommunikation laeuft
ausschliesslich **vom Inventar-Tool zum Update-Server** (Pull-Prinzip); es sind keine
direkten Zugriffe oder Firewall-Oeffnungen noetig.

**Sicherheitskonzept**

- Release-Manifeste werden auf dem Update-Server mit **ed25519** signiert.
- Der Client besitzt nur den **oeffentlichen Schluessel** und verwirft jede Antwort,
  deren Signatur nicht passt.
- Pakete werden zusaetzlich mit **SHA-256** gegen den signierten Manifest-Wert geprueft.
- Vor dem Umschalten wird der bisherige Stand gesichert; nach dem Start folgt ein
  Healthcheck mit **automatischem Rollback** bei Fehlern.

**Ablauf**

1. Beim Start und dann taeglich zur konfigurierten Stunde prueft das Backend die
   Version auf dem Update-Server (`/api/v1/update/check`).
2. Ist ein Update vorhanden und die Signatur gueltig, wird es den Admins angezeigt
   (Administration → System → Updates) oder – wenn aktiviert – automatisch installiert.
3. Die Installation fuehrt das Root-Skript `inventar-update` aus: Download, Verifikation,
   Backups, Staging unter `/opt/inventar-tool/releases`, atomarer Symlink-Wechsel,
   Dienst-Neustart, Healthcheck und Rollback.

**Einrichtung (einmalig pro Server, als root)**

```bash
# 1. Konfiguration anlegen und das Client-Skript installieren
sudo bash installer/register-autoupdater.sh

# 2. Update-Server-URL und oeffentlichen Schluessel setzen
#    (alternativ direkt in /etc/inventar-tool/update.conf)
#    Den Schluessel zeigt der Update-Server unter "Oeffentlicher Schluessel" an.
sudo UPDATE_SERVER_URL=https://update-inventar-tool.schnikdu.com \
     UPDATE_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA... (Schluessel vom Update-Server einsetzen)
-----END PUBLIC KEY-----" \
     bash installer/register-autoupdater.sh

# 3. Im Inventar-Tool unter Administration → System → Updates
#    Server-URL, Kanal (stable/beta) und den Schluessel eintragen und speichern
```

**Aktivierung**

Das Update-System ist **standardmaessig deaktiviert** (`UPDATE_ENABLED=false` bzw.
kein `update.enabled`-Setting). Solange es aus ist, laeuft kein taeglicher Timer und
„Jetzt pruefen"/„Installieren" sind gesperrt – die Einstellungen koennen aber schon
vorbereitet werden. Zum Testen wird die Funktion unter
Administration → System → Updates oben auf der Seite per Schalter **aktiviert**.

Danach stehen die Funktionen „Jetzt pruefen" und „Installieren" sowie die
Update-Einstellungen (Kanal, Auto-Install, Check-Zeit, Telemetrie) bereit.

`register-autoupdater.sh` legt ausserdem eine sudoers-Regel an, mit der der Backend-Benutzer
`inventartool` ausschliesslich `inventar-update install`/`download` als root ausfuehren darf.
Installationsprotokoll und Status liegen in `/var/lib/inventar-tool/update-state.json`,
das Log unter `/var/log/inventar-tool/updates.log`.

---

## Konfiguration

Die Konfiguration liegt dauerhaft unter `/etc/inventar-tool/backend.env` und ueberlebt Updates.

| Variable | Beschreibung | Beispielwert |
|---|---|---|
| `DATABASE_URL` | MySQL-Verbindungsstring | `mysql://inventartool:pass@localhost:3306/inventartool` |
| `JWT_SECRET` | Geheimer Schluessel fuer Session-Tokens (mind. 32 Zeichen) | *(zufaellig generiert)* |
| `JWT_EXPIRES_IN` | Gueltigkeitsdauer der Tokens | `8h` |
| `PORT` | Backend-Port (intern) | `3456` |
| `BASE_PATH` | URL-Basispfad der Anwendung | `/inventar-tool` |
| `NODE_ENV` | Umgebung | `production` |
| `SETUP_DONE` | Nach dem ersten Setup auf `true` setzen | `false` |
| `LOCALE` | Sprache der Anwendung | `de` |
| `SSO_ENABLED` / `SSO_PROVIDER` / `SSO_CLIENT_ID` / `SSO_CLIENT_SECRET` / `SSO_ISSUER_URL` | SSO-Vorgaben (OIDC) | `false` / leer |
| `UPLOAD_DIR` | Pfad fuer hochgeladene Dateien | `/var/lib/inventar-tool/uploads` |
| `MAX_FILE_SIZE_MB` | Maximale Upload-Groesse | `10` |

> SSO wird in der Admin-Oberflaeche unter **Einstellungen → SSO** konfiguriert. Die
> Umgebungsvariablen dienen als Vorgaben.

Nach Aenderungen an der Konfiguration den Dienst neu starten:

```bash
sudo systemctl restart inventar-tool
```

---

## Datenbank-Details

### Schema initialisieren und migrieren

Das Inventar-Tool verwendet [Prisma](https://www.prisma.io/) als ORM. Das Schema liegt in
`backend/prisma/schema.prisma`.

| Befehl | Zweck |
|---|---|
| `npm run db:migrate` | Fuehrt `scripts/migrate.js` aus — generiert den Prisma-Client und legt das Schema an bzw. aktualisiert es (`prisma generate` + `prisma db push`) |
| `npm run prisma:generate` | Generiert den JavaScript-Client aus dem Schema — nach jeder Schema-Aenderung ausfuehren |

> **Reihenfolge bei einer Erstinstallation:**
> 1. `npm run db:migrate` — Schema in der Datenbank anlegen
> 2. `npm run prisma:generate` — Client generieren
> 3. `node src/index.js` — Server starten

> **Reihenfolge bei einem Update mit Schema-Aenderungen:**
> 1. Dienst stoppen: `sudo systemctl stop inventar-tool`
> 2. Code aktualisieren (per `update.sh` oder manuell)
> 3. `npm run db:migrate` — Schema aktualisieren
> 4. `npm run prisma:generate` — Client neu generieren
> 5. Dienst starten: `sudo systemctl start inventar-tool`

### Verbindungsstring-Format

```
DATABASE_URL=mysql://BENUTZER:PASSWORT@HOST:PORT/DATENBANKNAME
```

| Platzhalter | Bedeutung | Standard |
|---|---|---|
| `BENUTZER` | MySQL-Benutzer | `inventartool` |
| `PASSWORT` | Passwort des Benutzers | *(zufaellig beim Install generiert)* |
| `HOST` | Datenbankhost | `localhost` |
| `PORT` | MySQL-Port | `3306` |
| `DATENBANKNAME` | Name der Datenbank | `inventartool` |

### Benoettigte MySQL-Berechtigungen

Minimalberechtigungen fuer den produktiven Betrieb:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES
  ON `inventartool`.*
  TO 'inventartool'@'localhost';
FLUSH PRIVILEGES;
```

Fuer die Erstinstallation (Tabellen erstellen) reicht auch `ALL PRIVILEGES` auf die Datenbank
— dieser kann danach bei Bedarf eingeschraenkt werden.

### Datenbankverbindung pruefen

```bash
# Direkte Verbindung testen
mysql -u inventartool -p inventartool -e "SHOW TABLES;"

# Verbindung aus dem Backend pruefen
cd /opt/inventar-tool/backend
node -e "const p = require('@prisma/client'); const c = new p.PrismaClient(); c.\$connect().then(() => { console.log('OK'); c.\$disconnect(); }).catch(e => { console.error(e.message); process.exit(1); });"
```

### MariaDB-Hinweise

Das Tool ist kompatibel mit MariaDB 10.6 und neuer. Der Verbindungsstring ist identisch.
Bei MariaDB auf Debian/Ubuntu den Dienst-Namen `mariadb` statt `mysql` verwenden:

```bash
sudo systemctl start mariadb
sudo mysql  # oeffnet die MariaDB-Konsole
```

---

## Wichtige Pfade

| Zweck | Pfad |
|---|---|
| Anwendungscode | `/opt/inventar-tool` |
| Konfigurationsdatei | `/etc/inventar-tool/backend.env` |
| Upload-Verzeichnis | `/var/lib/inventar-tool/uploads` |
| Logs | `/var/log/inventar-tool` |
| Prisma-Schema | `/opt/inventar-tool/backend/prisma/schema.prisma` |
| Systemd-Service | `inventar-tool` |
| Apache-Site | `inventar-tool` |

---

## Lokale Entwicklung

### Voraussetzungen

- Node.js >= 22
- MySQL oder MariaDB lokal erreichbar

### Lokale Datenbank einrichten (einmalig)

```bash
# MySQL-Konsole oeffnen
mysql -u root -p

# Datenbank und Benutzer anlegen
CREATE DATABASE IF NOT EXISTS inventartool CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'inventartool'@'localhost' IDENTIFIED BY 'dev_passwort';
GRANT ALL PRIVILEGES ON inventartool.* TO 'inventartool'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### Einrichtung

```bash
# 1. Backend einrichten
cd backend
cp .env.example .env
# .env anpassen: DATABASE_URL auf lokale Datenbank zeigen (Standard aus .env.example passt:
# DATABASE_URL=mysql://inventartool:dev_passwort@localhost:3306/inventartool)
npm install
npm run db:migrate      # Schema initialisieren
npm run prisma:generate # Client generieren
npm run dev             # Backend starten (http://localhost:3456)

# 2. Frontend einrichten (in einem neuen Terminal)
cd frontend
npm install
npm run dev             # Frontend starten (http://localhost:5173/inventory/)
```

| Dienst | URL |
|---|---|
| Frontend | `http://localhost:5173/inventory/` |
| Backend API | `http://localhost:3456/api/health` |

> Im Entwicklungsmodus baut Vite das Frontend nicht zu statischen Dateien, sondern startet
> einen Dev-Server mit Hot-Reload. Den API-Proxy zu `localhost:3456` uebernimmt `vite.config.js`.

Alternativ koennen beide Dienste gleichzeitig gestartet werden (aus dem Projektroot):

```bash
npm install
npm run dev
```

---

## Haeufige Probleme

| Problem | Ursache / Loesung |
|---|---|
| Backend startet nicht oder Dienst stoppt dauerhaft | Logs pruefen: `journalctl -u inventar-tool -n 50` und `sudo bash installer/status-check.sh`. Fehlt der Symlink `backend/.env`? |
| `Can't reach database server at localhost:3306` | MySQL/MariaDB laeuft nicht (`systemctl status mysql`), Zugangsdaten in `backend.env` pruefen, Datenbank existiert? |
| Prisma-Fehler beim Start | Prisma-Client neu generieren: `cd /opt/inventar-tool/backend && sudo npm run prisma:generate` |
| Apache liefert 404 / Seite nicht gefunden | `sudo a2ensite inventar-tool`, `apachectl configtest`, `systemctl restart apache2`. Fehlt der Symlink `dist/inventar-tool`? |
| Uploads lassen sich nicht laden/sehen | Berechtigungen: `/var/lib/inventar-tool/uploads` muss dem Benutzer `inventartool` gehoeren (`sudo chown -R inventartool:inventartool ...`) |
| `npm ci` schlaegt fehl | `package-lock.json` fehlt oder ist veraltet: sicherstellen, dass Backend und Frontend komplett hochgeladen wurden |
