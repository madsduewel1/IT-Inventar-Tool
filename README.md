# MZ-Inventory Lite

Selbst hostbares Inventarisierungs-, Verleih- und Monitoring-System für Medienzentren und Schulen.

## Entwicklung

1. **Backend einrichten**:
   ```bash
   cd backend
   cp .env.example .env
   npm install
   npx prisma generate
   # Stelle sicher, dass eine lokale MySQL-Datenbank läuft und in .env konfiguriert ist.
   # Schema-Push ausführen:
   npx prisma db push
   npm run dev
   ```

2. **Frontend einrichten**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

* Frontend: `http://localhost:5173/inventory/`
* Backend: `http://localhost:3456/api/health`

## Produktion

Die Produktion läuft über einen Apache2 Webserver und MySQL als Datenbank.

Für eine vollständige Anleitung (automatisch oder manuell) siehe [INSTALL.md](INSTALL.md).
