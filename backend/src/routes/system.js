const express = require('express');
const os = require('os');
const { execSync } = require('child_process');
const fs = require('fs');
const prisma = require('../config/prisma');
const config = require('../config/config');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Schwellwerte für die Systemprüfung: ab hier wird gewarnt, ab hier ist es kritisch.
const THRESHOLDS = {
  disk: { warn: 0.85, error: 0.95 },
  memory: { warn: 0.85, error: 0.95 },
  load: { warn: 1.0, error: 2.0 }
};

// Ermittelt Provider, Version und Größe der Datenbank (SQLite oder MySQL).
async function readDatabaseInfo() {
  let dbProvider = 'unknown';
  let dbSize = null;
  let dbVersion = null;

  try {
    const driver = await prisma.$queryRaw`SELECT sqlite_version() AS version`;
    if (driver?.[0]?.version) {
      dbProvider = 'sqlite';
      dbVersion = driver[0].version;
      const dbFile = await prisma.$queryRaw`PRAGMA database_list`;
      const mainFile = dbFile?.find(d => d.name === 'main');
      if (mainFile?.file) {
        dbSize = fs.statSync(mainFile.file).size;
      }
    }
  } catch {
    try {
      const versionResult = await prisma.$queryRaw`SELECT VERSION() AS version`;
      if (versionResult?.[0]?.version) {
        dbProvider = 'mysql';
        dbVersion = versionResult[0].version;
        const sizeResult = await prisma.$queryRaw`SELECT SUM(data_length + index_length) AS size FROM information_schema.tables WHERE table_schema = DATABASE()`;
        dbSize = Number(sizeResult[0]?.size || 0);
      }
    } catch {}
  }

  return { type: dbProvider, version: dbVersion, size: dbSize };
}

router.get('/overview', auth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const database = await readDatabaseInfo();

    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    const disk = getDiskUsage();

    const packages = getPackageVersions();

    res.json({
      os: {
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        distro: getDistro(),
        kernel: os.version(),
        uptime: os.uptime(),
        arch: os.arch()
      },
      cpu: {
        model: cpus.length ? cpus[0].model : 'N/A',
        cores: cpus.length,
        loadAvg: os.loadavg()
      },
      memory: {
        total: totalMem,
        used: totalMem - freeMem,
        free: freeMem
      },
      disk,
      database: database,
      packages
    });
  } catch (error) {
    next(error);
  }
});

// Liefert den aktuellen Systemstatus als einzelne Prüfungen. Wird im
// Admin-Dashboard angezeigt und ersetzt die Kennzahlen: alles in Ordnung
// heißt "alles läuft ordnungsgemäß", Probleme werden einzeln benannt.
router.get('/status', auth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const checks = [];

    // Datenbank: erreichbar und wie schnell sie antwortet.
    const started = Date.now();
    let database = { type: 'unknown', version: null, size: null };
    try {
      database = await readDatabaseInfo();
      await prisma.$queryRaw`SELECT 1`;
      checks.push({
        id: 'database',
        label: 'Datenbank',
        status: 'ok',
        value: `${databaseLabel(database)} · ${Date.now() - started} ms`,
        detail: database.size ? `Größe ${formatBytes(database.size)}` : ''
      });
    } catch (error) {
      checks.push({ id: 'database', label: 'Datenbank', status: 'error', value: 'nicht erreichbar', detail: error.message });
    }

    // Anwendung selbst: Version und Laufzeit.
    const processMemory = process.memoryUsage();
    checks.push({
      id: 'app',
      label: 'Anwendung',
      status: 'ok',
      value: `Version ${config.version}`,
      detail: `Node ${process.version} · läuft seit ${formatUptime(os.uptime())} · Speicher ${formatBytes(processMemory.rss)}`
    });

    // Speicherplatz des Dateisystems.
    const disk = getDiskUsage();
    if (disk && disk.total > 0) {
      const usedRatio = disk.used / disk.total;
      checks.push({
        id: 'disk',
        label: 'Speicherplatz',
        status: rating(usedRatio, THRESHOLDS.disk),
        value: `${formatBytes(disk.free)} frei von ${formatBytes(disk.total)}`,
        detail: `${Math.round(usedRatio * 100)} % belegt`
      });
    } else {
      checks.push({ id: 'disk', label: 'Speicherplatz', status: 'info', value: 'nicht ermittelbar', detail: '' });
    }

    // Arbeitsspeicher.
    const totalMem = os.totalmem();
    if (totalMem > 0) {
      const usedRatio = (totalMem - os.freemem()) / totalMem;
      checks.push({
        id: 'memory',
        label: 'Arbeitsspeicher',
        status: rating(usedRatio, THRESHOLDS.memory),
        value: `${formatBytes(totalMem - os.freemem())} von ${formatBytes(totalMem)} belegt`,
        detail: `${Math.round(usedRatio * 100)} % belegt`
      });
    }

    // Systemlast pro CPU-Kern.
    const cores = os.cpus().length || 1;
    const load = os.loadavg()[0] || 0;
    checks.push({
      id: 'cpu',
      label: 'Systemlast',
      status: rating(load / cores, THRESHOLDS.load),
      value: `Load ${load.toFixed(2)} bei ${cores} ${cores === 1 ? 'Kern' : 'Kernen'}`,
      detail: (os.cpus()[0]?.model || '').trim()
    });

    // Upload-Verzeichnis: ohne Schreibrecht scheitern Bild-Uploads.
    const uploadWritable = checkWritable(config.uploadDir);
    checks.push({
      id: 'uploads',
      label: 'Upload-Verzeichnis',
      status: uploadWritable ? 'ok' : 'error',
      value: uploadWritable ? 'beschreibbar' : 'nicht beschreibbar',
      detail: uploadWritable ? '' : `Kein Schreibzugriff auf ${config.uploadDir}`
    });

    const overall = checks.some((c) => c.status === 'error')
      ? 'error'
      : checks.some((c) => c.status === 'warn')
        ? 'warn'
        : 'ok';

    res.json({
      overall,
      checks,
      hostname: os.hostname(),
      version: config.version,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

function databaseLabel(database) {
  if (database.type === 'sqlite') return 'SQLite';
  if (database.type === 'mysql') return 'MySQL';
  return 'Datenbank';
}

// Wandelt einen Auslastungswert (0–1 bzw. Last pro Kern) in ok/warn/error.
function rating(value, limits) {
  if (value >= limits.error) return 'error';
  if (value >= limits.warn) return 'warn';
  return 'ok';
}

function checkWritable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function formatUptime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days} ${days === 1 ? 'Tag' : 'Tage'}, ${hours} Std`;
  if (hours > 0) return `${hours} Std, ${minutes} Min`;
  return `${minutes} Min`;
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '';
  }
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[index]}`;
}

function getDiskUsage() {
  try {
    const output = execSync('df -k / | tail -1', { timeout: 3000, encoding: 'utf8' });
    const parts = output.trim().split(/\s+/);
    if (parts.length >= 4) {
      return {
        total: parseInt(parts[1], 10) * 1024,
        used: parseInt(parts[2], 10) * 1024,
        free: parseInt(parts[3], 10) * 1024
      };
    }
  } catch {}
  return null;
}

function getDistro() {
  try {
    const output = execSync('cat /etc/os-release 2>/dev/null | grep "^PRETTY_NAME=" | head -1', { timeout: 2000, encoding: 'utf8' });
    const match = output.match(/^PRETTY_NAME="?(.+?)"?$/);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

function getPackageVersions() {
  const result = {};
  try { result.node = process.version; } catch {}
  try { result.npm = execSync('npm --version', { timeout: 2000, encoding: 'utf8' }).trim(); } catch {}
  try { result.mysql = execSync('mysql --version', { timeout: 2000, encoding: 'utf8' }).trim(); } catch {}
  try { result.mysql2 = require('mysql2/package.json').version; } catch {}
  try { result.ubuntu = getDistro(); } catch {}
  return result;
}

module.exports = router;
