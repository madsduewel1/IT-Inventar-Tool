const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const config = require('../config/config');
const logger = require('../config/logger');
const { getSettingCached, invalidateSetting } = require('./settingsCache');

// ─── Einstellungen ─────────────────────────────────────────────────────────
// Die Datenbank ueberschreibt die env/Default-Werte. Der GitHub-Token wird
// niemals an das Frontend ausgeliefert (siehe statusForUI/settingsForUI).
const SETTING_KEYS = [
  'update.enabled',
  'update.channel',
  'update.token',
  'update.autoCheck',
  'update.checkHours',
  'update.notify',
  'update.autoInstall'
];

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const TAG_PATTERN = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function boolFrom(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === 'true' || value === true;
}

function normalizeRepo(value) {
  return String(value || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
}

async function effectiveSettings() {
  const defaults = config.updater;
  const map = {};
  await Promise.all(SETTING_KEYS.map(async (key) => {
    map[key] = await getSettingCached(key);
  }));

  const channel = ['stable', 'beta'].includes(map['update.channel']) ? map['update.channel'] : defaults.channel;
  const checkHours = Math.max(1, Math.min(168, Number(map['update.checkHours'] || defaults.checkHours) || defaults.checkHours));

  return {
    enabled: boolFrom(map['update.enabled'], defaults.enabled),
    // Repository und Branch sind serverseitig in update.conf festgelegt und
    // koennen nicht ueber die Weboberflaeche geaendert werden.
    repo: normalizeRepo(defaults.repo),
    branch: String(defaults.branch || 'main').trim(),
    channel,
    token: String(map['update.token'] || defaults.token || ''),
    autoCheck: boolFrom(map['update.autoCheck'], defaults.autoCheck),
    checkHours,
    notify: boolFrom(map['update.notify'], defaults.notify),
    autoInstall: boolFrom(map['update.autoInstall'], true)
  };
}

// ─── SemVer ────────────────────────────────────────────────────────────────
function parseVersion(value) {
  const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || '',
    raw: String(value).trim()
  };
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

function isNewer(candidate, current) {
  if (!parseVersion(candidate)) return false;
  if (!parseVersion(current)) return true;
  return compareVersions(candidate, current) > 0;
}

// ─── State-Datei ───────────────────────────────────────────────────────────
const STATE_KEYS = [
  'lastCheckAt', 'lastCheckStatus', 'lastCheckError', 'latest', 'available',
  'installStatus', 'installStep', 'installStartedAt', 'installFinishedAt',
  'installError', 'installTargetVersion', 'installLog', 'lastUpdate', 'history'
];

function defaultState() {
  return {
    lastCheckAt: null,
    lastCheckStatus: 'never',
    lastCheckError: null,
    latest: null,
    available: null,
    installStatus: 'idle',
    installStep: null,
    installStartedAt: null,
    installFinishedAt: null,
    installError: null,
    installTargetVersion: null,
    installLog: [],
    lastUpdate: null,
    history: []
  };
}

function ensureStateDir() {
  fs.mkdirSync(path.dirname(config.updater.stateFile), { recursive: true });
}

function getState() {
  try {
    ensureStateDir();
    if (!fs.existsSync(config.updater.stateFile)) {
      const fresh = defaultState();
      fs.writeFileSync(config.updater.stateFile, JSON.stringify(fresh, null, 2));
      return fresh;
    }
    const raw = JSON.parse(fs.readFileSync(config.updater.stateFile, 'utf8'));
    const state = { ...defaultState(), ...raw };
    for (const key of STATE_KEYS) {
      if (state[key] === undefined) state[key] = defaultState()[key];
    }
    if (!Array.isArray(state.history)) state.history = [];
    if (!Array.isArray(state.installLog)) state.installLog = [];
    return state;
  } catch (error) {
    logger.warn({ err: error.message }, 'update-state.json konnte nicht gelesen werden');
    return defaultState();
  }
}

function saveState(mutator) {
  ensureStateDir();
  const state = getState();
  const result = mutator ? mutator(state) : undefined;
  const temp = `${config.updater.stateFile}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, config.updater.stateFile);
  return result === undefined ? state : result;
}

function appendInstallLog(state, message) {
  state.installLog = state.installLog || [];
  state.installLog.push({ ts: new Date().toISOString(), message });
  if (state.installLog.length > 300) state.installLog = state.installLog.slice(-300);
}

// ─── Wartungsmodus ─────────────────────────────────────────────────────────
function readMaintenance() {
  try {
    if (!fs.existsSync(config.updater.maintenanceFile)) return { enabled: false };
    const raw = JSON.parse(fs.readFileSync(config.updater.maintenanceFile, 'utf8'));
    if (!raw?.enabled) return { enabled: false };
    // Schutz vor haengengebliebenem Wartungsmodus (z. B. abgebrochenes Update).
    const startedAt = raw.startedAt ? new Date(raw.startedAt).getTime() : 0;
    const stale = startedAt > 0 && Date.now() - startedAt > 45 * 60 * 1000;
    if (stale) {
      return {
        enabled: true,
        stale: true,
        message: raw.message || 'Das System wird gewartet.',
        startedAt: raw.startedAt || null,
        reason: raw.reason || 'update'
      };
    }
    return {
      enabled: true,
      stale: false,
      message: raw.message || 'Das System wird gewartet.',
      startedAt: raw.startedAt || null,
      reason: raw.reason || 'update'
    };
  } catch {
    return { enabled: false };
  }
}

function setMaintenance(enabled, message = 'Das System wird gerade aktualisiert. Bitte warten Sie einen Moment.') {
  try {
    fs.mkdirSync(path.dirname(config.updater.maintenanceFile), { recursive: true });
    if (!enabled) {
      if (fs.existsSync(config.updater.maintenanceFile)) fs.unlinkSync(config.updater.maintenanceFile);
      return;
    }
    fs.writeFileSync(config.updater.maintenanceFile, JSON.stringify({
      enabled: true,
      message,
      reason: 'update',
      startedAt: new Date().toISOString()
    }, null, 2));
  } catch (error) {
    logger.warn({ err: error.message }, 'Wartungsmodus konnte nicht geschrieben werden');
  }
}

function isInstallRunning() {
  // Die Lock-Datei ist die verlaessliche Quelle: Sie wird vom Root-Helfer
  // vor dem Setzen von installStatus geschrieben. Ein "running"-Status ohne
  // lebenden Prozess ist ein abgebrochenes Update und darf nicht dauerhaft
  // alle Pruefungen und Installationen blockieren.
  try {
    if (fs.existsSync(config.updater.lockFile)) {
      const pid = Number(fs.readFileSync(config.updater.lockFile, 'utf8').trim());
      if (pid) {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          // Prozess existiert nicht mehr.
        }
      }
    }
  } catch {
    // Lock nicht lesbar -> als nicht laufend behandeln.
  }

  // Kurzes Zeitfenster zwischen "queued" und dem Schreiben der Lock-Datei
  // durch den Helfer weiterhin als laufend werten.
  const state = getState();
  if (state.installStatus === 'running' && state.installStartedAt) {
    const started = new Date(state.installStartedAt).getTime();
    if (Number.isFinite(started) && Date.now() - started < 2 * 60 * 1000) return true;
  }
  return false;
}

function checkViaHelper(settings) {
  const bin = config.updater.clientBin;
  if (!fs.existsSync(bin)) {
    throw new Error(`Update-Helfer nicht gefunden (${bin}). Bitte installer/register-updater.sh ausfuehren.`);
  }
  const result = spawnSync(bin, ['check', '--repo', settings.repo, '--branch', settings.branch], {
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) throw new Error(result.error.message);
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(detail.slice(0, 800) || `Update-Pruefung fehlgeschlagen (Exit ${result.status}).`);
  }
  try {
    return JSON.parse(String(result.stdout || '').trim());
  } catch {
    throw new Error('Update-Helfer lieferte keine gueltige Antwort.');
  }
}

let checkRunning = false;

async function checkNow({ manual = false } = {}) {
  if (checkRunning) {
    return { status: 'busy', message: 'Eine Versionspruefung laeuft bereits.' };
  }
  if (isInstallRunning()) {
    return { status: 'busy', message: 'Waehrend einer Installation wird nicht geprueft.' };
  }

  checkRunning = true;
  try {
    const settings = await effectiveSettings();
    if (!settings.enabled) {
      saveState((state) => {
        state.lastCheckAt = new Date().toISOString();
        state.lastCheckStatus = 'disabled';
        state.lastCheckError = null;
      });
      return { status: 'disabled', message: 'Das Update-System ist deaktiviert.' };
    }

    let remote = null;
    let errorMessage = null;
    try {
      remote = checkViaHelper(settings);
    } catch (error) {
      errorMessage = error.message || 'Update-Pruefung fehlgeschlagen.';
    }

    if (errorMessage) {
      // Ein Verbindungsfehler darf nicht als "kein Update" gewertet werden.
      saveState((state) => {
        state.lastCheckAt = new Date().toISOString();
        state.lastCheckStatus = 'error';
        state.lastCheckError = errorMessage;
      });
      logger.warn({ err: errorMessage }, 'Update-Pruefung fehlgeschlagen');
      return { status: 'error', message: errorMessage };
    }

    const remoteVersion = String(remote?.latestVersion || '').trim().replace(/^v/i, '');
    if (!remoteVersion) {
      errorMessage = 'Im Repository wurde keine gueltige Version gefunden.';
      saveState((state) => {
        state.lastCheckAt = new Date().toISOString();
        state.lastCheckStatus = 'error';
        state.lastCheckError = errorMessage;
      });
      return { status: 'error', message: errorMessage };
    }

    const latest = {
      version: remoteVersion,
      tag: `v${remoteVersion}`,
      name: `Version ${remoteVersion}`,
      body: '',
      prerelease: false,
      draft: false,
      publishedAt: remote.publishedAt || null,
      htmlUrl: `https://github.com/${settings.repo}/tree/${encodeURIComponent(settings.branch || 'main')}`,
      targetCommitish: remote.commit || '',
      assets: []
    };
    const available = remote.status === 'update' ? latest : null;
    const checkedAt = new Date().toISOString();

    saveState((state) => {
      state.lastCheckAt = checkedAt;
      state.lastCheckStatus = available ? 'update' : 'latest';
      state.lastCheckError = null;
      state.latest = latest;
      state.available = available;
    });

    if (available) {
      logger.info({ component: 'updater' }, `Version ${available.version} (${settings.branch}) verfuegbar.`);
      return { status: 'update', checkedAt, latest, available };
    }
    return { status: 'latest', checkedAt, latest };
  } finally {
    checkRunning = false;
  }
}

// ─── Installation anstossen ────────────────────────────────────────────────
function clientInstalled() {
  try {
    return fs.existsSync(config.updater.clientBin);
  } catch {
    return false;
  }
}

async function triggerInstall(version, actor) {
  const settings = await effectiveSettings();
  if (!settings.enabled) throw new Error('Das Update-System ist deaktiviert.');
  if (!clientInstalled()) {
    throw new Error(`Update-Helfer nicht gefunden (${config.updater.clientBin}). Bitte installer/register-updater.sh ausfuehren.`);
  }
  if (isInstallRunning()) throw new Error('Es laeuft bereits eine Installation.');
  if (!TAG_PATTERN.test(String(version || ''))) throw new Error('Ungueltige Zielversion.');

  const state = getState();
  const available = state.available;
  if (!available || compareVersions(available.version, String(version).replace(/^v/i, '')) !== 0) {
    throw new Error('Die angeforderte Version ist nicht als verfuegbares Update hinterlegt.');
  }

  const tag = available.tag || `v${available.version}`;
  setMaintenance(true, `Update auf Version ${available.version} laeuft. Das System ist kurzzeitig nicht erreichbar.`);

  const startedAt = new Date().toISOString();
  saveState((next) => {
    next.installStatus = 'running';
    next.installStep = 'queued';
    next.installStartedAt = startedAt;
    next.installFinishedAt = null;
    next.installError = null;
    next.installTargetVersion = available.version;
    next.installLog = [];
    appendInstallLog(next, `Installation von ${available.version} durch ${actor || 'Administrator'} gestartet.`);
    next.history.unshift({
      id: crypto.randomUUID(),
      fromVersion: config.version,
      toVersion: available.version,
      tag,
      commit: available.targetCommitish || '',
      startedAt,
      finishedAt: null,
      actor: actor || '',
      result: 'running',
      error: null,
      rollback: null,
      logFile: config.updater.logFile
    });
    if (next.history.length > 50) next.history = next.history.slice(0, 50);
  });

  const args = [
    '-n',
    'systemd-run', '--collect', '--no-block', '--quiet', '--unit=inventar-update',
    config.updater.clientBin, 'install',
    '--version', tag,
    '--repo', settings.repo,
    '--branch', settings.branch
  ];

  await new Promise((resolve, reject) => {
    const child = spawn('sudo', args, { detached: true, stdio: 'ignore' });
    child.on('error', (error) => reject(new Error(`Update konnte nicht gestartet werden: ${error.message}`)));
    child.on('spawn', () => {
      child.unref();
      resolve();
    });
  }).catch((error) => {
    setMaintenance(false);
    saveState((next) => {
      next.installStatus = 'failed';
      next.installStep = 'start';
      next.installFinishedAt = new Date().toISOString();
      next.installError = error.message;
      appendInstallLog(next, error.message);
      if (next.history[0]) {
        next.history[0].result = 'failed';
        next.history[0].finishedAt = new Date().toISOString();
        next.history[0].error = error.message;
      }
    });
    throw error;
  });

  return { status: 'started', version: available.version, tag };
}

// ─── UI-Daten ──────────────────────────────────────────────────────────────
async function settingsForUI() {
  const settings = await effectiveSettings();
  return {
    enabled: settings.enabled,
    repo: settings.repo,
    branch: settings.branch,
    channel: settings.channel,
    tokenConfigured: !!settings.token,
    autoCheck: settings.autoCheck,
    checkHours: settings.checkHours,
    notify: settings.notify,
    autoInstall: settings.autoInstall
  };
}

async function statusForUI() {
  const settings = await settingsForUI();
  const state = getState();
  return {
    currentVersion: config.version,
    versionInfo: config.versionInfo,
    latest: state.latest,
    available: state.available,
    lastCheckAt: state.lastCheckAt,
    lastCheckStatus: state.lastCheckStatus,
    lastCheckError: state.lastCheckError,
    installStatus: state.installStatus,
    installStep: state.installStep,
    installStartedAt: state.installStartedAt,
    installFinishedAt: state.installFinishedAt,
    installError: state.installError,
    installTargetVersion: state.installTargetVersion,
    installLog: state.installLog.slice(-80),
    lastUpdate: state.lastUpdate,
    history: state.history.slice(0, 30),
    settings,
    maintenance: readMaintenance(),
    client: {
      installed: clientInstalled(),
      path: config.updater.clientBin,
      installDir: config.updater.installDir,
      serviceName: config.updater.serviceName,
      stateFile: config.updater.stateFile,
      logFile: config.updater.logFile
    }
  };
}

async function readLogs(limit = 200) {
  const state = getState();
  const fromState = state.installLog.slice(-limit);
  let fromFile = [];
  try {
    if (fs.existsSync(config.updater.logFile)) {
      fromFile = fs.readFileSync(config.updater.logFile, 'utf8').trim().split('\n').slice(-limit);
    }
  } catch {}
  return { stateLog: fromState, fileLog: fromFile, logFile: config.updater.logFile };
}

// ─── Automatische Pruefung ─────────────────────────────────────────────────
let autoTimer = null;
const AUTO_TICK_MS = 10 * 60 * 1000;

function isDue(settings, state) {
  if (!settings.enabled || !settings.autoCheck) return false;
  if (!state.lastCheckAt) return true;
  const last = new Date(state.lastCheckAt).getTime();
  if (!Number.isFinite(last)) return true;
  return Date.now() - last >= settings.checkHours * 60 * 60 * 1000;
}

async function maybeAutoCheck() {
  try {
    const settings = await effectiveSettings();
    const state = getState();
    if (!isDue(settings, state)) return;
    if (isInstallRunning()) return;
    const result = await checkNow();
    if (result.status === 'update' && settings.autoInstall && settings.enabled) {
      try {
        await triggerInstall(result.available.version, 'Auto-Update');
      } catch (error) {
        logger.warn({ err: error.message }, 'Automatische Installation konnte nicht gestartet werden');
      }
    }
  } catch (error) {
    logger.warn({ err: error.message }, 'Automatische Updatepruefung fehlgeschlagen');
  }
}

function startTimer() {
  if (autoTimer) return;
  setTimeout(maybeAutoCheck, 15 * 1000).unref?.();
  autoTimer = setInterval(maybeAutoCheck, AUTO_TICK_MS);
  autoTimer.unref?.();
}

function stopTimer() {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
}

async function saveSettings(payload) {
  const mapping = {
    enabled: 'update.enabled',
    repo: 'update.repo',
    channel: 'update.channel',
    token: 'update.token',
    autoCheck: 'update.autoCheck',
    checkHours: 'update.checkHours',
    notify: 'update.notify',
    autoInstall: 'update.autoInstall'
  };
  const prisma = require('../config/prisma');
  const entries = [];
  for (const [field, key] of Object.entries(mapping)) {
    if (!(field in payload)) continue;
    let value = payload[field];
    if (field === 'repo') {
      value = normalizeRepo(value);
      if (value && !REPO_PATTERN.test(value)) throw new Error('Ungueltiges Repository. Erwartet wird "owner/name".');
      if (value && value !== normalizeRepo(config.updater.repo)) {
        throw new Error('Das Repository ist serverseitig festgelegt und kann nicht ueber die Oberflaeche geaendert werden.');
      }
    }
    if (field === 'channel' && value && !['stable', 'beta'].includes(value)) {
      throw new Error('Ungueltiger Kanal. Erlaubt: stable, beta.');
    }
    if (field === 'checkHours') {
      const hours = Number(value);
      if (!Number.isFinite(hours) || hours < 1 || hours > 168) throw new Error('Pruefintervall muss zwischen 1 und 168 Stunden liegen.');
      value = String(Math.floor(hours));
    } else if (['enabled', 'autoCheck', 'notify', 'autoInstall'].includes(field)) {
      value = value === true || value === 'true' ? 'true' : 'false';
    } else {
      value = String(value ?? '').trim();
    }
    entries.push([key, value]);
  }

  await prisma.$transaction(entries.map(([key, value]) => prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  })));
  for (const [key] of entries) invalidateSetting(key);
  return settingsForUI();
}

module.exports = {
  effectiveSettings,
  settingsForUI,
  statusForUI,
  checkNow,
  triggerInstall,
  readLogs,
  saveSettings,
  readMaintenance,
  setMaintenance,
  isInstallRunning,
  parseVersion,
  compareVersions,
  isNewer,
  startTimer,
  stopTimer
};
