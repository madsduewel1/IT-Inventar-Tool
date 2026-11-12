const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const axios = require('axios');
const { spawn } = require('child_process');
const config = require('../config/config');
const logger = require('../config/logger');
const { getSettingCached } = require('./settingsCache');

// ─── Kanonisches JSON für Signaturpruefung (identisch zum Update-Server) ────
function canonicalStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite number in canonical JSON');
    return String(value);
  }
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const parts = keys
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`);
    return `{${parts.join(',')}}`;
  }
  throw new Error(`Unsupported type in canonical JSON: ${typeof value}`);
}

function verifySignature(manifest, signatureB64, publicKeyPem) {
  try {
    const canonical = canonicalStringify(manifest);
    const signature = Buffer.from(String(signatureB64 || ''), 'base64');
    const publicKey = crypto.createPublicKey({ key: normalizeKey(publicKeyPem), format: 'pem', type: 'spki' });
    return crypto.verify(null, Buffer.from(canonical, 'utf8'), publicKey, signature);
  } catch {
    return false;
  }
}

// Erlaubt eingegebene PEMs mit Literal-\n (aus UIs) sowie echte Zeilenumbrüche.
function normalizeKey(pem) {
  return String(pem || '').replace(/\\n/g, '\n').trim() + '\n';
}

// ─── SemVer ────────────────────────────────────────────────────────────────
function parseVersion(version) {
  const match = String(version || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-.]+))?/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4] || '', raw: String(version).trim() };
}
function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;
  if (!pa.prerelease && !pb.prerelease) return 0;
  if (!pa.prerelease) return 1;
  if (!pb.prerelease) return -1;
  return pa.prerelease.localeCompare(pb.prerelease);
}
const gt = (a, b) => compareVersions(a, b) > 0;
const gte = (a, b) => compareVersions(a, b) >= 0;

// ─── State-Datei ───────────────────────────────────────────────────────────
const ALLOWED_STATE_KEYS = [
  'installationId', 'currentVersion', 'lastCheckAt', 'lastCheckStatus', 'lastCheckError',
  'available', 'installStatus', 'installStartedAt', 'installFinishedAt', 'installError',
  'lastUpdate', 'releaseNotes', 'installLog', 'history'
];

function defaultState() {
  return {
    installationId: crypto.randomUUID(),
    currentVersion: config.version,
    lastCheckAt: null,
    lastCheckStatus: 'never',
    lastCheckError: null,
    available: null,
    installStatus: 'idle',
    installStartedAt: null,
    installFinishedAt: null,
    installError: null,
    lastUpdate: null,
    releaseNotes: [],
    installLog: [],
    history: []
  };
}

function ensureStateFile() {
  fs.mkdirSync(path.dirname(config.updater.stateFile), { recursive: true });
}

function getState() {
  try {
    ensureStateFile();
    if (!fs.existsSync(config.updater.stateFile)) {
      const fresh = defaultState();
      fs.writeFileSync(config.updater.stateFile, JSON.stringify(fresh, null, 2));
      return fresh;
    }
    const raw = JSON.parse(fs.readFileSync(config.updater.stateFile, 'utf8'));
    return { ...defaultState(), ...raw };
  } catch (err) {
    logger.warn({ err: err.message }, 'update-state.json konnte nicht gelesen werden');
    return defaultState();
  }
}

function saveState(mutator) {
  ensureStateFile();
  const state = getState();
  const result = mutator(state);
  fs.writeFileSync(config.updater.stateFile, JSON.stringify(state, null, 2));
  return result === undefined ? state : result;
}

// ─── Log-Datei ─────────────────────────────────────────────────────────────
function logUpdate(level, message) {
  const line = `[${new Date().toISOString()}] [${level}] ${message}`;
  try {
    fs.mkdirSync(path.dirname(config.updater.logFile), { recursive: true });
    fs.appendFileSync(config.updater.logFile, line + '\n');
  } catch {}
  if (level !== 'debug') logger.info({ component: 'updater' }, message);
  saveState((state) => {
    state.installLog = state.installLog || [];
    state.installLog.push({ ts: new Date().toISOString(), message });
    if (state.installLog.length > 200) state.installLog = state.installLog.slice(-200);
  });
}

// ─── Wirksame Einstellungen (DB-Settings übersteuern env/update.conf) ──────
async function effectiveSettings() {
  const defaults = config.updater;
  const keys = ['update.enabled', 'update.serverUrl', 'update.channel', 'update.publicKey', 'update.autoInstall', 'update.telemetry', 'update.checkHour'];
  const entries = await Promise.all(keys.map(async (key) => [key, await getSettingCached(key)]));
  const map = Object.fromEntries(entries);

  const channel = map['update.channel'] && ['stable', 'beta'].includes(map['update.channel']) ? map['update.channel'] : defaults.channel;
  const autoInstallRaw = map['update.autoInstall'];
  const telemetryRaw = map['update.telemetry'];

  return {
    enabled: map['update.enabled'] ? map['update.enabled'] === 'true' : defaults.enabled,
    serverUrl: (map['update.serverUrl'] || defaults.serverUrl || '').replace(/\/+$/, ''),
    channel,
    publicKey: normalizeKey(map['update.publicKey'] || defaults.publicKey),
    autoInstall: autoInstallRaw ? autoInstallRaw === 'true' : defaults.autoInstall,
    telemetry: telemetryRaw ? telemetryRaw === 'true' : defaults.telemetry,
    checkHour: clampHour(map['update.checkHour'] ? Number(map['update.checkHour']) : defaults.checkHour)
  };
}

function clampHour(hour) {
  const value = Number(hour);
  if (!Number.isFinite(value)) return 2;
  return Math.max(0, Math.min(23, Math.floor(value)));
}

function settingsToStore(settings) {
  return {
    enabled: settings.enabled,
    serverUrl: settings.serverUrl,
    channel: settings.channel,
    publicKeyConfigured: !!settings.publicKey,
    autoInstall: settings.autoInstall,
    telemetry: settings.telemetry,
    checkHour: settings.checkHour
  };
}

// ─── Update-Check ──────────────────────────────────────────────────────────
let checkRunning = false;

async function checkNow() {
  if (checkRunning) {
    return { status: 'busy', message: 'Update-Check läuft bereits.' };
  }
  checkRunning = true;
  const state = getState();
  try {
    const settings = await effectiveSettings();
    if (!settings.enabled) {
      logUpdate('warn', 'Update-Funktion ist deaktiviert – Check übersprungen.');
      return { status: 'disabled', message: 'Automatische Updates sind deaktiviert.' };
    }
    logUpdate('info', 'Update-Check gestartet.');

    if (!settings.serverUrl) {
      const result = { status: 'not_configured', message: 'Kein Update-Server konfiguriert.' };
      saveState((s) => {
        s.lastCheckAt = new Date().toISOString();
        s.lastCheckStatus = 'not_configured';
        s.lastCheckError = 'Kein Update-Server konfiguriert.';
      });
      logUpdate('warn', 'Update-Server nicht konfiguriert.');
      return result;
    }
    if (!settings.publicKey) {
      const result = { status: 'key_missing', message: 'Oeffentlicher Schluessel fehlt.' };
      saveState((s) => {
        s.lastCheckAt = new Date().toISOString();
        s.lastCheckStatus = 'key_missing';
        s.lastCheckError = 'Oeffentlicher Schluessel des Update-Servers fehlt.';
      });
      logUpdate('warn', 'Oeffentlicher Schluessel fehlt.');
      return result;
    }

    const url = buildCheckUrl(settings, state.installationId);
    const response = await axios.get(url, { timeout: 20000, validateStatus: (status) => status === 200, headers: { 'User-Agent': `inventar-tool/${config.version} updater` } });
    const payload = response.data;

    if (payload.status === 'latest') {
      const checkedAt = new Date().toISOString();
      saveState((s) => {
        s.lastCheckAt = checkedAt;
        s.lastCheckStatus = 'latest';
        s.lastCheckError = null;
        s.available = null;
      });
      logUpdate('info', 'Keine neue Version verfügbar (Kanal: ' + settings.channel + ').');
      return { status: 'latest', checkedAt };
    }

    // Update verfügbar → Signatur prüfen
    const { manifest, signature } = payload.release || {};
    if (!manifest || !signature) {
      throw new Error('Antwort des Update-Servers enthält kein gültiges Release.');
    }
    if (!verifySignature(manifest, signature, settings.publicKey)) {
      saveState((s) => {
        s.lastCheckAt = new Date().toISOString();
        s.lastCheckStatus = 'signature_invalid';
        s.lastCheckError = 'Signatur des Updates ungültig.';
        s.available = null;
      });
      logUpdate('error', 'Signatur des Updates UNGUELTIG – Update verworfen.');
      return { status: 'signature_invalid', message: 'Signatur des Updates ungültig.' };
    }
    if (!gt(manifest.version, state.currentVersion)) {
      saveState((s) => {
        s.lastCheckAt = new Date().toISOString();
        s.lastCheckStatus = 'latest';
        s.lastCheckError = null;
        s.available = null;
      });
      logUpdate('warn', `Update ${manifest.version} nicht neuer als installierte Version ${state.currentVersion}.`);
      return { status: 'latest' };
    }

    saveState((s) => {
      s.lastCheckAt = new Date().toISOString();
      s.lastCheckStatus = 'update';
      s.lastCheckError = null;
      s.available = {
        manifest,
        signature,
        publicKey: settings.publicKey,
        checkedAt: new Date().toISOString(),
        channel: settings.channel,
        serverUrl: settings.serverUrl,
        downloadUrl: `${settings.serverUrl}/api/v1/releases/${manifest.id}/download`
      };
      s.releaseNotes = manifest.releaseNotes || [];
    });
    logUpdate('info', `Version ${manifest.version} (${manifest.channel}) verfügbar.`);

    if (settings.autoInstall && manifest.channel === settings.channel) {
      logUpdate('info', 'Automatische Installation aktiv – wird gestartet.');
      try {
        await installNow();
      } catch (err) {
        logUpdate('error', 'Automatische Installation fehlgeschlagen: ' + err.message);
      }
    }

    return { status: 'update', version: manifest.version, channel: manifest.channel, manifest };
  } catch (error) {
    saveState((s) => {
      s.lastCheckAt = new Date().toISOString();
      s.lastCheckStatus = 'error';
      s.lastCheckError = error.message || 'Unbekannter Fehler';
    });
    logUpdate('error', 'Update-Check fehlgeschlagen: ' + (error.message || error));
    return { status: 'error', message: error.message };
  } finally {
    checkRunning = false;
  }
}

function buildCheckUrl(settings, installationId) {
  const params = new URLSearchParams({
    app: 'inventar-tool',
    version: config.version,
    channel: settings.channel,
    os: `${process.platform}`,
    arch: process.arch || os.arch()
  });
  if (settings.telemetry && installationId) {
    params.set('installation_id', installationId);
  }
  return `${settings.serverUrl}/api/v1/update/check?${params.toString()}`;
}

// ─── Installation ──────────────────────────────────────────────────────────
let installRunning = false;

async function installNow() {
  const state = getState();
  if (installRunning) {
    throw new Error('Eine Installation läuft bereits.');
  }
  const settings = await effectiveSettings();
  if (!settings.enabled) {
    throw new Error('Automatische Updates sind deaktiviert.');
  }
  if (!state.available) {
    throw new Error('Kein überprüftes Update zum Installieren vorhanden.');
  }
  const { manifest } = state.available;

  installRunning = true;
  saveState((s) => {
    s.installStatus = 'installing';
    s.installStartedAt = new Date().toISOString();
    s.installError = null;
  });
  logUpdate('info', `Installation von Version ${manifest.version} wird gestartet.`);
  const result = spawnInstaller();
  installRunning = false;
  return result;
}

function spawnInstaller() {
  const clientBin = config.updater.clientBin;
  const args = ['install'];

  // Via systemd-run laeuft die Installation ausserhalb des Service-Cgroups
  // und ueberlebt so den Neustart des backends.
  return new Promise((resolve, reject) => {
    const cmd = ['sudo', '-n', 'systemd-run', '--collect', '--no-block', '--quiet', '--unit=inventar-update', clientBin, ...args];
    const child = spawn(cmd[0], cmd.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => {
      // sudo fehlt → Fallback auf den direkten Weg (detached).
      logUpdate('warn', 'systemd-run/sudo nicht verfügbar (' + err.message + ') – versuche direkten Start.');
      runDetachedFallback(clientBin, args).then(resolve).catch(reject);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ started: true, method: 'systemd-run' });
      } else {
        const message = stderr.trim() || `Exit ${code}`;
        logUpdate('warn', `systemd-run fehlgeschlagen (${message}) – versuche direkten Start.`);
        runDetachedFallback(clientBin, args).then(resolve).catch(reject);
      }
    });
    child.unref();
  });
}

function runDetachedFallback(clientBin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('sudo', ['-n', clientBin, ...args], {
      stdio: 'ignore',
      detached: true
    });
    child.on('error', (err) => {
      const error = new Error('Auto-Updater nicht startbar. Bitte register-autoupdater.sh ausführen (' + err.message + ').');
      saveState((s) => { s.installStatus = 'failed'; s.installError = error.message; s.installFinishedAt = new Date().toISOString(); });
      logUpdate('error', error.message);
      reject(error);
    });
    child.unref();
    resolve({ started: true, method: 'detached' });
  });
}

// ─── Timer (taeglich zur konfigurierten Stunde) ────────────────────────────
let checkTimer = null;
let currentCheckHour = config.updater.checkHour;

async function startTimer() {
  const settings = await effectiveSettings();
  stopTimer();
  currentCheckHour = settings.checkHour;
  if (!settings.enabled) {
    logger.info('Automatischer Update-Check deaktiviert (UPDATE_ENABLED / update.enabled)');
    return;
  }
  scheduleNextCheck();
  logger.info({ checkHour: currentCheckHour }, 'Automatischer Update-Check alle 24h zur Stunde ' + currentCheckHour);
}

function scheduleNextCheck() {
  if (checkTimer) clearInterval(checkTimer);
  const delay = getDelayToNextRun(currentCheckHour);
  checkTimer = setTimeout(async () => {
    let keepGoing = true;
    try {
      const settings = await effectiveSettings();
      if (!settings.enabled) {
        logger.info('Automatischer Update-Check deaktiviert – Timer beendet.');
        stopTimer();
        keepGoing = false;
        return;
      }
      currentCheckHour = settings.checkHour;
      await checkNow();
    } catch (err) {
      logger.warn({ err: err.message }, 'Automatischer Update-Check fehlgeschlagen');
    } finally {
      if (keepGoing) scheduleNextCheck();
    }
  }, Math.min(delay, 24 * 60 * 60 * 1000));
}

function getDelayToNextRun(hour) {
  const clamped = Math.min(23, Math.max(0, Math.floor(Number(hour) || 2)));
  const now = new Date();
  const next = new Date(now);
  next.setHours(clamped, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function stopTimer() {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
}

// ─── Status für die UI ─────────────────────────────────────────────────────
async function statusForUI() {
  const state = getState();
  const settings = await effectiveSettings();
  const effectiveKeyConfigured = !!settings.publicKey;
  return {
    ...state,
    currentVersion: config.version,
    settings: settingsToStore(settings),
    configured: {
      serverUrl: settings.serverUrl,
      channel: settings.channel,
      publicKeyReady: effectiveKeyConfigured
    }
  };
}

module.exports = {
  canonicalStringify,
  verifySignature,
  compareVersions,
  getState,
  saveState,
  logUpdate,
  effectiveSettings,
  settingsToStore,
  checkNow,
  installNow,
  statusForUI,
  startTimer,
  stopTimer,
  normalizeKey
};