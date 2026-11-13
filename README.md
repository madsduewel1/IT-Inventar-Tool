# Inventar-Tool

**Selbst hostbares Inventarisierungs-, Verleih- und Ticketing-System für Medienzentren und Schulen.**

Das Inventar-Tool vereint die Verwaltung von Geräten, Ausleihen, Tickets und administrativen Aufgaben in einer zentralen Webanwendung. Es wurde speziell für die Anforderungen von Schulen, Medienzentren und IT-Teams entwickelt.

---

## Inhaltsverzeichnis

1. [Über das Projekt](#über-das-projekt)
2. [Systemarchitektur](#systemarchitektur)
3. [Voraussetzungen](#voraussetzungen)
4. [Installation](#installation)
   - [Automatische Installation](#automatische-installation-empfohlen)
   - [Manuelle Installation](#manuelle-installation)
5. [Updates](#updates)
   - [GitHub-Update-System](#github-update-system)
   - [Manuelles Update](#manuelles-update)
6. [Status-Check und Diagnose](#status-check-und-diagnose)
7. [Konfiguration](#konfiguration)
8. [Datenbank](#datenbank)
9. [Wichtige Verzeichnisse](#wichtige-verzeichnisse)
10. [Lokale Entwicklung](#lokale-entwicklung)
11. [Fehlerbehebung](#fehlerbehebung)

---

## Über das Projekt

Das Inventar-Tool ist eine selbst hostbare Verwaltungsplattform für schulische IT-Infrastrukturen und Medienzentren.

Die Anwendung besteht aus einem React-Frontend, einem Node.js-Backend und einer MySQL- beziehungsweise MariaDB-Datenbank.

### Grundlegende Eigenschaften

- **Self-Hosted:** Vollständiger Betrieb auf eigener Infrastruktur.
- **Webbasiert:** Zugriff über den Browser, ohne lokale Installation.
- **Modular:** Zentrale Verwaltung verschiedener Funktionsbereiche.
- **Datenbankgestützt:** Speicherung aller relevanten Informationen in MySQL/MariaDB.
- **Updatefähig:** Manuelle und automatisierte Aktualisierungsmöglichkeiten.
- **SSO-Unterstützung:** Vorbereitung für die Anmeldung über externe Identitätsanbieter mittels OpenID Connect.
- **Erweiterbar:** Trennung von Frontend, Backend und Datenhaltung.

---

## Systemarchitektur

Die Anwendung verwendet eine klassische Client-Server-Architektur.

```text
                       Browser
                          │
                          ▼
                    Apache2 :80
                          │
             ┌────────────┼─────────────┐
             │            │             │
             ▼            ▼             ▼
         Frontend       Backend       Uploads
         React/Vite     Express       Dateien
             │         :3456             │
             │            │             │
             │            ▼             │
             │        Prisma ORM        │
             │            │             │
             │            ▼             │
             │       MySQL/MariaDB      │
             │         :3306            │
             └──────────────────────────┘
```

### Komponenten

| Komponente | Technologie | Aufgabe |
|---|---|---|
| Frontend | React + Vite | Benutzeroberfläche |
| Backend | Node.js + Express | REST-API und Geschäftslogik |
| ORM | Prisma | Datenbankzugriff |
| Datenbank | MySQL / MariaDB | Persistente Datenspeicherung |
| Webserver | Apache2 | Auslieferung und Reverse-Proxy |
| Prozessverwaltung | Systemd | Automatischer Dienststart und Überwachung |

### Verzeichnisaufteilung

| Pfad | Funktion |
|---|---|
| `/opt/inventar-tool` | Anwendung und Programmcode |
| `/etc/inventar-tool` | Dauerhafte Konfiguration |
| `/var/lib/inventar-tool/uploads` | Hochgeladene Dateien |
| `/var/log/inventar-tool` | Anwendungs- und Update-Logs |

Die Konfiguration wird bewusst außerhalb des Programmverzeichnisses gespeichert. Dadurch bleiben Einstellungen und Zugangsdaten bei regulären Updates erhalten.

---

## Voraussetzungen

| Anforderung | Mindestversion / Voraussetzung |
|---|---|
| Betriebssystem | Debian / Ubuntu (LTS) |
| Node.js | 22 oder neuer |
| Datenbank | MySQL 8 oder MariaDB 10.6+ |
| Webserver | Apache2 |
| Rechte | Root- beziehungsweise sudo-Zugriff |
| Netzwerk | Freie interne Ports 3456 und 3306 |

**Hinweis:** Bei der automatischen Installation werden die benötigten Systemkomponenten eingerichtet.

---

# Installation

Es stehen zwei Installationsmöglichkeiten zur Verfügung.

| Methode | Empfehlung | Beschreibung |
|---|---|---|
| Automatisch | Empfohlen | Vollständige Einrichtung durch ein Installationsskript |
| Manuell | Fortgeschritten | Einzelne Einrichtung aller Komponenten |

## Automatische Installation (empfohlen)

Die automatische Installation übernimmt die vollständige Einrichtung des Systems.

### 1. Projekt vorbereiten

Den vollständigen Projektordner auf den Zielserver übertragen.

Anschließend im Projektverzeichnis ausführen:

```bash
sudo bash installer/install.sh
```

### 2. Installationsablauf

Das Installationsskript übernimmt folgende Aufgaben:

1. Installation der Systemabhängigkeiten (`apache2`, `mysql-server`, `nodejs 22`, `rsync`).
2. Einrichtung der MySQL-Datenbank und des Datenbankbenutzers.
3. Generierung eines zufälligen Datenbankpassworts.
4. Installation des Backends und Frontends unter `/opt/inventar-tool`.
5. Erstellung der dauerhaften Konfiguration unter `/etc/inventar-tool/backend.env`.
6. Installation der Node.js-Abhängigkeiten.
7. Initialisierung des Datenbankschemas über Prisma.
8. Erstellung des produktiven Frontend-Builds.
9. Einrichtung des Systembenutzers `inventartool`.
10. Erstellung und Aktivierung des Systemd-Dienstes.
11. Einrichtung von Apache2 inklusive Reverse-Proxy.

Die Konfiguration wird bei einer erneuten Installation nicht überschrieben, sofern sie bereits vorhanden ist.

### 3. Setup-Assistent öffnen

Nach erfolgreicher Installation zeigt das Skript die Adresse des Setup-Assistenten an.

Beispiel:

```text
http://SERVER-IP/inventar-tool/setup
```

Beim ersten Aufruf kann der erste Administrator angelegt und die grundlegende Einrichtung abgeschlossen werden.

---

## Manuelle Installation

Die manuelle Installation bildet die einzelnen Schritte der automatischen Installation nach.

Sie eignet sich insbesondere für individuelle Serverumgebungen und angepasste Installationen.

### Übersicht

| Schritt | Aufgabe |
|---|---|
| 1 | Systemabhängigkeiten installieren |
| 2 | Verzeichnisstruktur erstellen |
| 3 | Projektdateien kopieren |
| 4 | Datenbank einrichten |
| 5 | Konfiguration erstellen |
| 6 | Abhängigkeiten installieren und Anwendung bauen |
| 7 | Systembenutzer und Berechtigungen einrichten |
| 8 | Systemd-Dienst konfigurieren |
| 9 | Apache2 konfigurieren |
| 10 | Installation überprüfen |

### Schritt 1 – Systemabhängigkeiten installieren

Zunächst werden Apache2, MySQL und rsync installiert.

```bash
sudo apt-get update
sudo apt-get install -y apache2 mysql-server rsync
```

Anschließend Node.js 22 über das offizielle NodeSource-Repository installieren:

```bash
sudo mkdir -p /etc/apt/keyrings

curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
  | sudo tee /etc/apt/sources.list.d/nodesource.list

sudo apt-get update
sudo apt-get install -y nodejs
```

Installation überprüfen:

```bash
node -v
npm -v
```

Node.js sollte Version 22 oder neuer anzeigen.

### Schritt 2 – Verzeichnisstruktur erstellen

```bash
sudo mkdir -p /opt/inventar-tool
sudo mkdir -p /etc/inventar-tool
sudo mkdir -p /var/lib/inventar-tool/uploads
sudo mkdir -p /var/log/inventar-tool
```

### Schritt 3 – Projektdateien kopieren

Vom lokalen Projektverzeichnis ausführen:

```bash
sudo rsync -a --delete \
  --exclude node_modules \
  --exclude .env \
  --exclude uploads \
  --exclude logs \
  --exclude prisma/data \
  backend/ /opt/inventar-tool/backend/

sudo rsync -a --delete \
  --exclude node_modules \
  frontend/ /opt/inventar-tool/frontend/
```

Lokale Konfigurationen, Uploads und Abhängigkeiten werden dabei nicht mitkopiert.

### Schritt 4 – Datenbank einrichten

MySQL starten:

```bash
sudo systemctl start mysql
sudo mysql
```

Folgende SQL-Befehle ausführen:

```sql
CREATE DATABASE IF NOT EXISTS `inventartool`
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'inventartool'@'localhost'
IDENTIFIED BY 'SICHERES_PASSWORT';

GRANT ALL PRIVILEGES ON `inventartool`.*
TO 'inventartool'@'localhost';

FLUSH PRIVILEGES;
EXIT;
```

**Wichtig:** Das verwendete Passwort muss anschließend auch in der Konfiguration hinterlegt werden.

Der Datenbankbenutzer benötigt für die Schema-Initialisierung ausreichende Berechtigungen. Für den späteren Produktivbetrieb können diese bei Bedarf eingeschränkt werden.

### Schritt 5 – Konfiguration erstellen

Die dauerhafte Konfigurationsdatei befindet sich unter:

`/etc/inventar-tool/backend.env`

Erstellen:

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
```

Dateiberechtigungen und Symlink einrichten:

```bash
sudo chmod 660 /etc/inventar-tool/backend.env

sudo ln -sf \
  /etc/inventar-tool/backend.env \
  /opt/inventar-tool/backend/.env
```

**JWT-Schlüssel generieren:**

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Den generierten Wert als `JWT_SECRET` eintragen.

### Schritt 6 – Abhängigkeiten installieren und Anwendung bauen

**Backend:**

```bash
cd /opt/inventar-tool/backend

sudo npm ci --omit=dev

sudo npm run db:migrate
sudo npm run prisma:generate
```

**Frontend:**

```bash
cd /opt/inventar-tool/frontend

sudo npm ci --include=dev

sudo VITE_BASE_PATH="/inventar-tool/" npm run build
```

Für das SPA-Routing wird zusätzlich ein Symlink benötigt:

```bash
sudo ln -sf . /opt/inventar-tool/frontend/dist/inventar-tool
```

`db:migrate` führt bereits die Prisma-Generierung aus und aktualisiert das Datenbankschema. Der zusätzliche Aufruf von `prisma:generate` dient der expliziten Client-Generierung.

### Schritt 7 – Systembenutzer und Berechtigungen

Die Anwendung wird nicht als Root ausgeführt.

```bash
sudo useradd -r -s /bin/false inventartool

sudo chown -R inventartool:inventartool \
  /opt/inventar-tool \
  /var/lib/inventar-tool \
  /var/log/inventar-tool

sudo chown root:inventartool /etc/inventar-tool/backend.env
sudo chmod 660 /etc/inventar-tool/backend.env
```

### Schritt 8 – Systemd-Dienst einrichten

Datei erstellen:

`/etc/systemd/system/inventar-tool.service`

```ini
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
```

Dienst aktivieren und starten:

```bash
sudo systemctl daemon-reload
sudo systemctl enable inventar-tool
sudo systemctl start inventar-tool
```

### Schritt 9 – Apache2 konfigurieren

Benötigte Module aktivieren:

```bash
sudo a2enmod proxy proxy_http rewrite
sudo a2dissite 000-default
```

Konfigurationsdatei erstellen:

`/etc/apache2/sites-available/inventar-tool.conf`

```apache
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
```

Site aktivieren und Apache2 neu starten:

```bash
sudo a2ensite inventar-tool
sudo systemctl restart apache2
```

### Schritt 10 – Installation überprüfen

**Backend-Dienst:**

```bash
systemctl status inventar-tool
```

**API-Healthcheck:**

```bash
curl -s http://127.0.0.1:3456/api/health
```

Erwartete Antwort:

```json
{"ok":true,...}
```

**Apache-Konfiguration:**

```bash
sudo apachectl configtest
```

Bei erfolgreicher Installation sollte die Ausgabe `Syntax OK` lauten.

Die Anwendung ist anschließend erreichbar unter:

```text
http://SERVER-IP/inventar-tool/
```

---

# Updates

Für die Aktualisierung stehen zwei Möglichkeiten zur Verfügung:

- GitHub-Update-System in der Administration (empfohlen).
- Manuelles Update über das bereitgestellte Update-Skript.

## GitHub-Update-System

Das Update-System lädt neue Versionen direkt aus den GitHub-Releases des
Projekts. Es ist unter **Administration → System → Updates** zu finden und
benötigt einen einmalig eingerichteten Root-Helfer.

### Einrichtung

```bash
sudo bash installer/register-updater.sh
```

Das Skript installiert den Helfer unter `/usr/local/bin/inventar-update`,
erstellt `/etc/inventar-tool/update.conf` und eine eng begrenzte
`sudoers`-Regel. Der Helfer führt ausschließlich fest definierte Schritte aus
und validiert Repository, Version und Pfade selbst. Das Backend läuft weiterhin
als unprivilegierter Benutzer.

### Bedienung

1. Unter **Administration → System → Updates** die Einstellungen prüfen
   (Repository, Kanal `stable`/`beta`, Prüfintervall, Benachrichtigungen).
2. **Jetzt prüfen** lädt das neueste passende GitHub-Release und vergleicht die
   Version semantisch mit der installierten Version.
3. Bei verfügbarem Update zeigt die Seite Release Notes und Versionsunterschied.
4. **Update installieren** startet nach Bestätigung die Installation. Das
   System wechselt in den Wartungsmodus und zeigt allen Benutzern einen
   Wartungsbildschirm. Nach Abschluss lädt die Oberfläche automatisch neu.

Während der Installation führt der Helfer folgende Schritte aus:

1. Datenbank-Backup (sofern `mysqldump` verfügbar) und Prüfung des freien
   Speicherplatzes.
2. Download des exakten Release-Tags (Git-Clone, Fallback: Quell-Tarball).
3. Prüfung der erwarteten Dateien und der Version aus `version.json`.
4. `npm ci`, Prisma-Client und Datenbankmigration im Backend.
5. Frontend-Build mit dem konfigurierten `VITE_BASE_PATH`.
6. Atomare Umschaltung der Symlinks `backend`, `frontend` und `current`.
7. Neustart des Dienstes, Healthcheck inklusive erwarteter Version.
8. Bei Fehlern automatischer Rollback auf das letzte funktionierende Release.

Alte Releases, Backups und Protokolle werden automatisch aufgeräumt
(`KEEP_RELEASES`, Standard: 5).

### API-Endpunkte

Alle Endpunkte erfordern eine Anmeldung mit dem Recht `SETTINGS_MANAGE`.

| Methode | Pfad | Funktion |
|---|---|---|
| `GET` | `/api/system/updates/status` | Status, Einstellungen, Historie |
| `POST` | `/api/system/updates/check` | GitHub-Version prüfen |
| `GET` | `/api/system/updates/available` | Verfügbares Update |
| `POST` | `/api/system/updates/install` | Installation starten |
| `GET` | `/api/system/updates/progress` | Fortschritt abrufen |
| `GET` | `/api/system/updates/history` | Update-Historie |
| `GET` | `/api/system/updates/logs` | Protokolle abrufen |
| `GET`/`PUT`/`PATCH` | `/api/system/updates/settings` | Einstellungen lesen/speichern |
| `POST` | `/api/system/updates/maintenance` | Wartungsmodus schalten |

### Sicherheit

- GitHub-Token werden ausschließlich serverseitig gespeichert und nie an das
  Frontend oder in Protokolle geschrieben.
- Das Frontend kann weder Befehle, Pfade noch Branches vorgeben; nur
  veröffentlichte Release-Tags werden akzeptiert.
- Der Helfer ist über eine dedizierte `sudoers`-Regel auf den eigenen Aufruf
  beschränkt. Das Backend selbst läuft nicht als Root.
- Parallele Installationen werden über eine Lock-Datei verhindert.
- Ein hängen gebliebener Wartungsmodus wird nach 45 Minuten automatisch als
  veraltet erkannt und kann über `inventar-update status` bzw. die
  Administration beendet werden.

### Wartungsmodus

Während Prüfung und Installation antwortet die API mit HTTP 503 und dem Code
`MAINTENANCE`; der öffentliche Endpunkt `/api/health` bleibt erreichbar. Die
Oberfläche zeigt dann den Wartungsbildschirm und lädt nach Abschluss automatisch
neu.

## Manuelles Update

Das reguläre Update-Skript übernimmt die Aktualisierung der Anwendung.

Neue Projektversion auf den Server übertragen und ausführen:

```bash
sudo bash installer/update.sh
```

### Ablauf des Update-Skripts

1. Prüfung und Aktualisierung der benötigten Systemabhängigkeiten.
2. Erstellung eines neuen Release-Verzeichnisses unter `/opt/inventar-tool/releases`.
3. Installation der Node.js-Abhängigkeiten.
4. Generierung des Prisma-Clients.
5. Erstellung eines Datenbank-Backups vor Schemaänderungen, sofern `mysqldump` verfügbar ist.
6. Aktualisierung des Datenbankschemas.
7. Neuer Frontend-Build.
8. Aktualisierung der Systemd- und Apache-Konfiguration inklusive Backups.
9. Umschaltung auf das neue Release.
10. Neustart des Dienstes und anschließender Healthcheck.
11. Automatischer Rollback bei erkannten Fehlern.

### Optionale Parameter

| Parameter | Funktion |
|---|---|
| `SKIP_APT=true` | Überspringt die APT-Aktualisierung |
| `SKIP_DB_MIGRATE=true` | Überspringt die Datenbankschema-Aktualisierung |
| `SKIP_HEALTHCHECK=true` | Überspringt den abschließenden Healthcheck |

Beispiele:

```bash
sudo SKIP_APT=true bash installer/update.sh
```

```bash
sudo SKIP_DB_MIGRATE=true bash installer/update.sh
```

```bash
sudo SKIP_HEALTHCHECK=true bash installer/update.sh
```

Backups und Diagnoseinformationen werden unter folgendem Verzeichnis gespeichert:

`/opt/inventar-tool/backups`

### Manuelles Update ohne Update-Skript

Falls das Update-Skript nicht verwendet werden kann, lässt sich die Anwendung auch manuell aktualisieren.

**1. Datenbank sichern**

```bash
sudo mkdir -p /opt/inventar-tool/backups

sudo mysqldump --single-transaction \
  -u inventartool -p inventartool \
  > /opt/inventar-tool/backups/pre-update-$(date +%F-%H%M).sql
```

**2. Dienst stoppen**

```bash
sudo systemctl stop inventar-tool
```

**3. Projektdateien aktualisieren**

```bash
sudo rsync -a --delete \
  --exclude node_modules \
  --exclude .env \
  --exclude uploads \
  --exclude logs \
  --exclude prisma/data \
  backend/ /opt/inventar-tool/backend/

sudo rsync -a --delete \
  --exclude node_modules \
  frontend/ /opt/inventar-tool/frontend/
```

**4. Abhängigkeiten installieren**

```bash
cd /opt/inventar-tool/backend
sudo npm ci --omit=dev

cd /opt/inventar-tool/frontend
sudo npm ci --include=dev
```

**5. Prisma und Datenbank aktualisieren**

```bash
cd /opt/inventar-tool/backend

sudo npm run prisma:generate
sudo npm run db:migrate
```

**6. Frontend neu bauen**

```bash
cd /opt/inventar-tool/frontend

sudo VITE_BASE_PATH="/inventar-tool/" npm run build

sudo ln -sf . /opt/inventar-tool/frontend/dist/inventar-tool
```

**7. Berechtigungen überprüfen**

```bash
sudo chown -R inventartool:inventartool /opt/inventar-tool
```

**8. Dienst starten und überprüfen**

```bash
sudo systemctl start inventar-tool

systemctl status inventar-tool

curl -s http://127.0.0.1:3456/api/health

sudo apachectl configtest
```

**Wichtig:** Das manuelle Verfahren aktualisiert den bestehenden Installationspfad. Es besitzt nicht automatisch dieselben Release- und Rollback-Eigenschaften wie das reguläre Update-Skript.

---

# Status-Check und Diagnose

Für die Überprüfung der Installation steht ein eigenes Diagnose-Skript zur Verfügung.

Ausführen:

```bash
sudo bash installer/status-check.sh
```

### Geprüfte Bereiche

Das Skript sammelt Informationen zu:

- Betriebssystem und Systemversion
- Status des Inventar-Tool-Dienstes
- Apache2-Konfiguration
- HTTP-Erreichbarkeit
- Backend-Healthcheck
- Prisma-Datenbankverbindung
- Verfügbarem Speicherplatz
- Belegten Netzwerkports
- Relevanten System- und Anwendungslogs

### Report

Der Diagnosebericht wird nach Möglichkeit hier gespeichert:

```text
/var/log/inventar-tool/status-check-DATUM.log
```

Falls das Verzeichnis nicht beschreibbar ist, wird alternativ `/tmp` verwendet:

```text
/tmp/inventar-tool-status-check-DATUM.log
```

---

# Konfiguration

Die zentrale Konfigurationsdatei befindet sich unter:

`/etc/inventar-tool/backend.env`

Sie bleibt bei regulären Updates erhalten.

### Umgebungsvariablen

| Variable | Beschreibung | Standard / Beispiel |
|---|---|---|
| `DATABASE_URL` | Datenbankverbindung | `mysql://...` |
| `JWT_SECRET` | Geheimer Schlüssel für Session-Tokens | Zufälliger String |
| `JWT_EXPIRES_IN` | Gültigkeitsdauer der Tokens | `8h` |
| `PORT` | Interner Backend-Port | `3456` |
| `BASE_PATH` | URL-Basispfad | `/inventar-tool` |
| `NODE_ENV` | Betriebsumgebung | `production` |
| `SETUP_DONE` | Status der Ersteinrichtung | `false` |
| `LOCALE` | Anwendungssprache | `de` |
| `SSO_ENABLED` | Aktiviert die SSO-Unterstützung | `false` |
| `SSO_PROVIDER` | SSO-Anbieter | Leer |
| `SSO_CLIENT_ID` | OIDC-Client-ID | Leer |
| `SSO_CLIENT_SECRET` | OIDC-Client-Secret | Leer |
| `SSO_ISSUER_URL` | OIDC-Issuer-Adresse | Leer |
| `UPLOAD_DIR` | Speicherort für Uploads | `/var/lib/inventar-tool/uploads` |
| `MAX_FILE_SIZE_MB` | Maximale Upload-Größe | `10` |

### SSO-Konfiguration

Die Anmeldung über externe Identitätsanbieter wird mittels OpenID Connect unterstützt.

Die eigentliche Einrichtung erfolgt in der Benutzeroberfläche unter:

**Einstellungen → SSO**

Die Umgebungsvariablen dienen als Vorgaben für die Konfiguration.

### Änderungen übernehmen

Nach Änderungen an der Konfigurationsdatei muss das Backend neu gestartet werden:

```bash
sudo systemctl restart inventar-tool
```

---

# Datenbank

Das Inventar-Tool verwendet Prisma als Object-Relational Mapping (ORM).

Das Datenbankschema befindet sich unter:

`backend/prisma/schema.prisma`

### Datenbankschema initialisieren

| Befehl | Funktion |
|---|---|
| `npm run db:migrate` | Generiert den Prisma-Client und aktualisiert das Datenbankschema |
| `npm run prisma:generate` | Generiert den Prisma-Client separat |

Die Migration wird über `scripts/migrate.js` ausgeführt und verwendet intern `prisma generate` sowie `prisma db push`.

### Empfohlene Reihenfolge

**Erstinstallation:**

```bash
npm run db:migrate
npm run prisma:generate
node src/index.js
```

**Update mit Schemaänderungen:**

```bash
sudo systemctl stop inventar-tool

npm run db:migrate
npm run prisma:generate

sudo systemctl start inventar-tool
```

### Verbindungsstring

Das Format der Datenbankverbindung lautet:

```text
DATABASE_URL=mysql://BENUTZER:PASSWORT@HOST:PORT/DATENBANKNAME
```

| Bestandteil | Bedeutung | Standard |
|---|---|---|
| Benutzer | Datenbankbenutzer | `inventartool` |
| Passwort | Datenbankpasswort | Individuell |
| Host | Datenbankserver | `localhost` |
| Port | Datenbankport | `3306` |
| Datenbankname | Datenbank | `inventartool` |

Bei Sonderzeichen im Passwort muss dieses für die Verwendung im URL-Verbindungsstring URL-kodiert werden.

### Datenbankberechtigungen

Für den produktiven Betrieb können die Rechte eingeschränkt werden:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE,
CREATE, ALTER, INDEX, DROP, REFERENCES
ON `inventartool`.*
TO 'inventartool'@'localhost';

FLUSH PRIVILEGES;
```

Für die Erstinstallation und Schemaänderungen müssen ausreichende DDL-Berechtigungen vorhanden sein.

### Datenbankverbindung testen

**Direkter Datenbanktest:**

```bash
mysql -u inventartool -p inventartool -e "SHOW TABLES;"
```

**Prisma-Verbindung testen:**

```bash
cd /opt/inventar-tool/backend

node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

prisma.$connect()
  .then(() => {
    console.log('Datenbankverbindung erfolgreich');
    return prisma.$disconnect();
  })
  .catch(error => {
    console.error(error.message);
    process.exit(1);
  });
"
```

### MariaDB-Kompatibilität

Das Inventar-Tool unterstützt MariaDB ab Version 10.6.

Auf Debian/Ubuntu wird MariaDB folgendermaßen gestartet:

```bash
sudo systemctl start mariadb
sudo mysql
```

Der Datenbank-Verbindungsstring bleibt grundsätzlich identisch.

---

# Wichtige Verzeichnisse

| Komponente | Pfad |
|---|---|
| Anwendung | `/opt/inventar-tool` |
| Backend | `/opt/inventar-tool/backend` |
| Frontend | `/opt/inventar-tool/frontend` |
| Frontend-Build | `/opt/inventar-tool/frontend/dist` |
| Konfiguration | `/etc/inventar-tool/backend.env` |
| Update-Skript (manuell) | `installer/update.sh` |
| Update-Helfer (GitHub) | `/usr/local/bin/inventar-update` |
| Update-Konfiguration | `/etc/inventar-tool/update.conf` |
| Update-Status / Wartung | `/var/lib/inventar-tool/update-state.json`, `/var/lib/inventar-tool/maintenance.json` |
| Update-Protokoll | `/var/log/inventar-tool/updates.log` |
| Uploads | `/var/lib/inventar-tool/uploads` |
| Logs | `/var/log/inventar-tool` |
| Backups | `/opt/inventar-tool/backups` |
| Prisma-Schema | `/opt/inventar-tool/backend/prisma/schema.prisma` |
| Systemd-Service | `/etc/systemd/system/inventar-tool.service` |
| Apache-Konfiguration | `/etc/apache2/sites-available/inventar-tool.conf` |

---

# Lokale Entwicklung

Für die Entwicklung kann das Inventar-Tool vollständig lokal betrieben werden.

### Voraussetzungen

- Node.js 22 oder neuer
- MySQL oder MariaDB
- npm
- Git (optional)

### 1. Lokale Datenbank erstellen

MySQL-Konsole öffnen:

```bash
mysql -u root -p
```

Datenbank und Benutzer anlegen:

```sql
CREATE DATABASE IF NOT EXISTS inventartool
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'inventartool'@'localhost'
IDENTIFIED BY 'dev_passwort';

GRANT ALL PRIVILEGES ON inventartool.*
TO 'inventartool'@'localhost';

FLUSH PRIVILEGES;
EXIT;
```

### 2. Backend einrichten

```bash
cd backend

cp .env.example .env
```

Die Datenbankverbindung in `.env` anpassen:

```env
DATABASE_URL=mysql://inventartool:dev_passwort@localhost:3306/inventartool
```

Abhängigkeiten installieren und Datenbank initialisieren:

```bash
npm install
npm run db:migrate
npm run prisma:generate
```

Backend starten:

```bash
npm run dev
```

Das Backend ist anschließend erreichbar unter:

`http://localhost:3456`

### 3. Frontend einrichten

Ein zweites Terminal öffnen:

```bash
cd frontend

npm install
npm run dev
```

Das Frontend ist erreichbar unter:

`http://localhost:5173/inventory/`

### Entwicklungsumgebung

| Dienst | Adresse |
|---|---|
| Frontend | `http://localhost:5173/inventory/` |
| Backend | `http://localhost:3456` |
| API-Healthcheck | `http://localhost:3456/api/health` |

Vite übernimmt im Entwicklungsmodus das Hot-Reloading und die Weiterleitung der API-Anfragen an das Backend.

### Beide Dienste gemeinsam starten

Falls im Projektroot ein entsprechendes npm-Skript eingerichtet ist:

```bash
npm install
npm run dev
```

---

# Fehlerbehebung

Die folgende Tabelle enthält häufige Probleme und mögliche Lösungsansätze.

| Problem | Mögliche Ursache und Lösung |
|---|---|
| Backend startet nicht | `journalctl -u inventar-tool -n 50` prüfen. Konfiguration und Symlink kontrollieren. |
| Datenbank nicht erreichbar | MySQL/MariaDB-Status prüfen: `systemctl status mysql` |
| Falsche Datenbankzugangsdaten | `DATABASE_URL` in `backend.env` überprüfen. |
| Prisma-Fehler | Prisma-Client neu generieren: `npm run prisma:generate` |
| Apache liefert 404 | Site aktivieren, Alias und SPA-Symlink überprüfen. |
| Apache startet nicht | `sudo apachectl configtest` ausführen. |
| Uploads nicht erreichbar | Berechtigungen von `/var/lib/inventar-tool/uploads` kontrollieren. |
| `npm ci` schlägt fehl | Vorhandensein und Aktualität der `package-lock.json` überprüfen. |
| Anwendung lädt nicht | Backend-Status, Apache-Logs und Browser-Konsole prüfen. |

### Nützliche Diagnosebefehle

**Backend-Logs:**

```bash
sudo journalctl -u inventar-tool -n 50
```

**Live-Logs:**

```bash
sudo journalctl -u inventar-tool -f
```

**Apache-Fehlerprotokoll:**

```bash
sudo tail -f /var/log/apache2/inventar_tool_error.log
```

**Dienst neu starten:**

```bash
sudo systemctl restart inventar-tool
```

**Gesamten Status überprüfen:**

```bash
sudo bash installer/status-check.sh
```

---

## Projektinformationen

**Inventar-Tool** – Eine zentrale Plattform für Inventarisierung, Geräteverwaltung, Verleih und Ticketing in schulischen IT-Umgebungen.

Die Anwendung ist für den selbst gehosteten Betrieb konzipiert. Die Datenhaltung, Konfiguration und Updates verbleiben unter der Kontrolle des jeweiligen Betreibers.
