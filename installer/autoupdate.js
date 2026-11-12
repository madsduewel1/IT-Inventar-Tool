#!/usr/bin/env node
// Auto-Updater für das Inventar-Tool (läuft als root).
// Wird vom Backend via `sudo -n inventar-update install` angestoßen und
// kann auch manuell als root aufgerufen werden.
//
//   inventar-update install     Update installieren (aus update-state.json)
//   inventar-update download    Paket nur herunterladen und verifizieren
//   inventar-update status      Aktuellen Status ausgeben
//   inventar-update rollback    Auf das vorherige Release zurückwechseln
//   inventar-update cleanup     Alte Releases aufräumen
//
// Fehlercodes: 0 = OK, 1 = Fehler, 2 = nichts zu tun, 3 = nicht root.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

// ─── Konfiguration ─────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  INSTALL_DIR: '/opt/inventar-tool',
  CONFIG_DIR: '/etc/inventar-tool',
  DATA_DIR: '/var/lib/inventar-tool',
  LOG_DIR: '/var/log/inventar-tool',
  ENV_FILE: '/etc/inventar-tool/backend.env',
  SERVICE_NAME: 'inventar-tool',
  WEB_SERVICE: 'apache2',
  STATE_FILE: '/var/lib/inventar-tool/update-state.json',
  LOG_FILE: '/var/log/inventar-tool/updates.log',
  KEEP_RELEASES: 5,
  AUTO_DB_PUSH: 'false',
  SKIP_HEALTHCHECK: 'false'
};

function parseConf(file) {
  const values = {};
  if (!fs.existsSync(file)) return values;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] === 'CONFIG_DIR') continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function loadConfig() {
  const confPath = process.env.UPDATE_CONF || '/etc/inventar-tool/update.conf';
  const cfg = { ...DEFAULT_CONFIG, ...parseConf(confPath) };
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    if (process.env[key]) cfg[key] = process.env[key];
  }
  if (process.env.STATE_FILE) cfg.STATE_FILE = process.env.STATE_FILE;
  return cfg;
}

const cfg = loadConfig();

// ─── Logging / State ───────────────────────────────────────────────────────
function log(level, message) {
  const line = `[${new Date().toISOString()}] [${level}] ${message}`;
  try {
    fs.mkdirSync(path.dirname(cfg.LOG_FILE), { recursive: true });
    fs.appendFileSync(cfg.LOG_FILE, line + '\n');
  } catch {}
  console.log(line);
}

function defaultState() {
  return {
    installationId: crypto.randomUUID(),
    currentVersion: readInstalledVersion(),
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

function readInstalledVersion() {
  try {
    const envFile = cfg.ENV_FILE;
    const versionFile = path.join(cfg.INSTALL_DIR, 'backend', 'VERSION');
    if (fs.existsSync(versionFile)) {
      return fs.readFileSync(versionFile, 'utf8').trim().replace(/^v/, '') || '0.0.0';
    }
    if (fs.existsSync(envFile)) {
      const match = fs.readFileSync(envFile, 'utf8').match(/^APP_VERSION\s*=\s*(.+)$/m);
      if (match) return match[1].trim().replace(/^v/, '');
    }
  } catch {}
  return '0.0.0';
}

function readState() {
  try {
    fs.mkdirSync(path.dirname(cfg.STATE_FILE), { recursive: true });
    if (!fs.existsSync(cfg.STATE_FILE)) {
      const fresh = defaultState();
      writeState(fresh);
      return fresh;
    }
    return { ...defaultState(), ...JSON.parse(fs.readFileSync(cfg.STATE_FILE, 'utf8')) };
  } catch (err) {
    log('error', 'update-state.json konnte nicht gelesen werden: ' + err.message);
    return null;
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(cfg.STATE_FILE), { recursive: true });
  const tmp = cfg.STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, cfg.STATE_FILE);
}

function mutateState(fn) {
  const state = readState();
  if (!state) return null;
  fn(state);
  writeState(state);
  return state;
}

function appendInstallLog(state, message) {
  state.installLog = state.installLog || [];
  state.installLog.push({ ts: new Date().toISOString(), message });
  if (state.installLog.length > 200) state.installLog = state.installLog.slice(-200);
}

// ─── Hilfsmittel ───────────────────────────────────────────────────────────
function requireRoot() {
  if (typeof process.getuid === 'function' && process.getuid() !== 0) {
    console.error('Dieses Skript muss als root ausgeführt werden.');
    process.exit(3);
  }
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 50, ...options });
  if (options.stdio) return result;
  if (result.error) {
    const message = `Befehl fehlgeschlagen: ${cmd} ${args.join(' ')} (${result.error.message})`;
    throw new Error(message);
  }
  return result;
}

function check(command) {
  const result = spawnSync('which', [command], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Benoetigter Befehl fehlt: ${command}`);
  }
}

function readEnvValue(key) {
  if (!fs.existsSync(cfg.ENV_FILE)) return null;
  const match = fs.readFileSync(cfg.ENV_FILE, 'utf8').match(new RegExp(`^${key}\\s*=\\s*(.*)$`, 'm'));
  if (!match) return null;
  return match[1].replace(/^["']|["']$/g, '').replace(/^\/+|\/+$/g, '');
}

function basePath() {
  const raw = readEnvValue('BASE_PATH') || '/inventar-tool';
  const cleaned = `/${String(raw).replace(/^\/+|\/+$/g, '')}`;
  return cleaned.endsWith('/') ? cleaned : cleaned + '/';
}

// ─── Verifikation (nutzt das Werkzeug des aktuell laufenden Backends) ──────
function currentBackendDir() {
  const link = path.join(cfg.INSTALL_DIR, 'backend');
  return fs.existsSync(link) ? fs.realpathSync(link) : link;
}

function verifyTool() {
  return path.join(currentBackendDir(), 'tools', 'verify-update.js');
}

function verifyManifest(manifestFile, signatureFile, keyFile) {
  if (!fs.existsSync(verifyTool())) {
    throw new Error('verify-update.js im aktuellen Release nicht gefunden.');
  }
  const result = run('node', [verifyTool(), '--manifest', manifestFile, '--signature', signatureFile, '--key', keyFile]);
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || 'Signatur-Verifizierung fehlgeschlagen.');
  }
  log('info', result.stdout.trim());
}

// ─── Download / Paket ──────────────────────────────────────────────────────
function packageCacheDir() {
  return path.join(cfg.DATA_DIR, 'updates');
}

function download(available) {
  const manifest = available.manifest;
  if (!manifest || !manifest.id || !manifest.filename) throw new Error('Ungueltiges Manifest.');
  const cacheDir = packageCacheDir();
  fs.mkdirSync(cacheDir, { recursive: true });
  const target = path.join(cacheDir, path.basename(manifest.filename).replace(/\.\./g, '_'));
  if (fs.existsSync(target) && Number(manifest.size) === fs.statSync(target).size) {
    log('info', `Paket bereits vorhanden: ${target}`);
    return target;
  }
  const url = available.downloadUrl || `${available.serverUrl}/api/v1/releases/${manifest.id}/download`;
  if (!url) throw new Error('Keine Download-URL im Manifest.');
  log('info', `Lade Paket herunter: ${url}`);
  const tmp = target + '.part';
  const result = spawnSync('curl', ['-fSL', '--retry', '2', '-o', tmp, url], { encoding: 'utf8' });
  if (result.status !== 0) {
    fs.rmSync(tmp, { force: true });
    throw new Error('Download fehlgeschlagen: ' + (result.stderr || result.stdout || '').trim().slice(0, 500));
  }
  const size = fs.statSync(tmp).size;
  const hash = crypto.createHash('sha256').update(fs.readFileSync(tmp)).digest('hex');
  if (manifest.sha256 && hash !== manifest.sha256) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`SHA-256 des heruntergeladenen Pakets stimmt nicht (erwartet ${manifest.sha256.slice(0, 16)}…, ist ${hash.slice(0, 16)}…).`);
  }
  if (Number(manifest.size) !== size) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`Groesse des Pakets stimmt nicht (erwartet ${manifest.size}, ist ${size}).`);
  }
  fs.renameSync(tmp, target);
  log('info', `Download verifiziert (SHA-256): ${hash}`);
  return target;
}

function assertTarSafe(packageFile) {
  const result = run('tar', ['-tzf', packageFile], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Paket kann nicht gelesen werden.');
  const entries = result.stdout.split('\n').filter(Boolean);
  for (const entry of entries) {
    if (entry.startsWith('/') || entry.split('/').some((part) => part === '..')) {
      throw new Error(`Ungueltiger Pfad im Paket gefunden: ${entry}`);
    }
  }
  if (entries.length === 0) throw new Error('Paket ist leer.');
}

function extractPackage(packageFile) {
  assertTarSafe(packageFile);
  const version = path.basename(packageFile).replace(/^inventar-tool-/, '').replace(/\.tar\.gz$/, '');
  const releaseDir = path.join(cfg.INSTALL_DIR, 'releases', `${Date.now()}-${version}`);
  fs.mkdirSync(releaseDir, { recursive: true });
  log('info', `Entpacke Paket nach ${releaseDir}`);
  const result = run('tar', ['-xzf', packageFile, '-C', releaseDir, '--strip-components=1', '--no-same-owner']);
  if (result.status !== 0) {
    fs.rmSync(releaseDir, { recursive: true, force: true });
    throw new Error('Entpacken fehlgeschlagen: ' + (result.stderr || '').trim());
  }
  if (!fs.existsSync(path.join(releaseDir, 'backend')) || !fs.existsSync(path.join(releaseDir, 'frontend'))) {
    fs.rmSync(releaseDir, { recursive: true, force: true });
    throw new Error('Paket enthält weder backend/ noch frontend/ – verworfen.');
  }
  const versionFile = path.join(releaseDir, 'backend', 'VERSION');
  if (!fs.existsSync(versionFile)) {
    fs.writeFileSync(versionFile, version.replace(/^\d+-/, '').split('-').slice(1).join('-') || '0.0.0');
  }
  return releaseDir;
}

// ─── Build ─────────────────────────────────────────────────────────────────
function buildRelease(releaseDir) {
  log('info', 'Installiere Backend-Abhaengigkeiten (npm ci, prisma generate)…');
  check('npm');
  let res = run('npm', ['ci', '--omit=dev'], { cwd: path.join(releaseDir, 'backend') });
  if (res.status !== 0) throw new Error('npm ci (backend) fehlgeschlagen: ' + (res.stderr || res.stdout || '').trim().slice(0, 500));
  res = run('npm', ['run', 'prisma:generate'], { cwd: path.join(releaseDir, 'backend') });
  if (res.status !== 0) throw new Error('prisma generate fehlgeschlagen: ' + (res.stderr || res.stdout || '').trim().slice(0, 500));

  if (cfg.AUTO_DB_PUSH === 'true') {
    log('info', 'Aktualisiere Datenbank-Schema (prisma db push)…');
    res = run('npm', ['run', 'db:push'], { cwd: path.join(releaseDir, 'backend') });
    if (res.status !== 0) throw new Error('prisma db push fehlgeschlagen: ' + (res.stderr || res.stdout || '').trim().slice(0, 500));
  } else {
    log('info', 'Datenbank-Migration wird übersprungen (AUTO_DB_PUSH=false).');
  }

  log('info', 'Baue Frontend (npm ci + vite build)…');
  res = run('npm', ['ci'], { cwd: path.join(releaseDir, 'frontend') });
  if (res.status !== 0) throw new Error('npm ci (frontend) fehlgeschlagen: ' + (res.stderr || res.stdout || '').trim().slice(0, 500));
  res = run('npm', ['run', 'build'], {
    cwd: path.join(releaseDir, 'frontend'),
    env: { ...process.env, VITE_BASE_PATH: basePath() }
  });
  if (res.status !== 0) throw new Error('Frontend-Build fehlgeschlagen: ' + (res.stderr || res.stdout || '').trim().slice(0, 500));

  const baseDirName = basePath().replace(/^\/+|\/+$/g, '');
  if (baseDirName) {
    fs.symlinkSync('.', path.join(releaseDir, 'frontend', 'dist', baseDirName));
  }
}

// ─── Switch / Healthcheck / Rollback ───────────────────────────────────────
function serviceManager() {
  if (spawnSync('systemctl', ['--version'], { encoding: 'utf8' }).error) return null;
  return 'systemctl';
}

function stopService() {
  const sys = serviceManager();
  if (sys) spawnSync('systemctl', ['stop', cfg.SERVICE_NAME], { encoding: 'utf8' });
}

function startService() {
  const sys = serviceManager();
  if (sys) {
    spawnSync('systemctl', ['daemon-reload'], { encoding: 'utf8' });
    spawnSync('systemctl', ['start', cfg.SERVICE_NAME], { encoding: 'utf8' });
  }
}

function reloadWeb() {
  spawnSync('systemctl', ['reload', cfg.WEB_SERVICE], { encoding: 'utf8' });
  spawnSync('systemctl', ['restart', cfg.WEB_SERVICE], { encoding: 'utf8' });
}

function healthcheck(port) {
  if (cfg.SKIP_HEALTHCHECK === 'true') return true;
  const url = `http://127.0.0.1:${port}/api/health`;
  for (let i = 0; i < 10; i += 1) {
    const res = spawnSync('curl', ['-fsS', url], { encoding: 'utf8' });
    if (res.status === 0) {
      log('info', 'Backend-Healthcheck OK.');
      return true;
    }
    spawnSync('sleep', ['2']);
  }
  return false;
}

function switchRelease(releaseDir) {
  const liveBackend = path.join(cfg.INSTALL_DIR, 'backend');
  const liveFrontend = path.join(cfg.INSTALL_DIR, 'frontend');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(cfg.INSTALL_DIR, 'backups', timestamp);
  fs.mkdirSync(backupDir, { recursive: true });

  const previousBackend = path.join(backupDir, 'backend.previous');
  const previousFrontend = path.join(backupDir, 'frontend.previous');
  resolvePrevious(liveBackend, previousBackend);
  resolvePrevious(liveFrontend, previousFrontend);

  fs.rmSync(liveBackend, { force: true });
  fs.rmSync(liveFrontend, { force: true });
  fs.symlinkSync(path.join(releaseDir, 'backend'), liveBackend);
  fs.symlinkSync(path.join(releaseDir, 'frontend'), liveFrontend);

  try {
    spawnSync('useradd', ['-r', '-s', '/bin/false', 'inventartool'], { encoding: 'utf8' });
  } catch {}
  spawnSync('chown', ['-R', 'inventartool:inventartool', releaseDir, cfg.DATA_DIR, cfg.LOG_DIR], { encoding: 'utf8' });
  spawnSync('chmod', ['755', cfg.INSTALL_DIR], { encoding: 'utf8' });
  spawnSync('chmod', ['-R', '755', path.join(releaseDir, 'frontend')], { encoding: 'utf8' });
  if (fs.existsSync(cfg.ENV_FILE)) {
    spawnSync('chown', ['root:inventartool', cfg.ENV_FILE], { encoding: 'utf8' });
    spawnSync('chmod', ['660', cfg.ENV_FILE], { encoding: 'utf8' });
  }

  return { backupDir, previousBackend, previousFrontend };
}

// Sichern des bisherigen live-Verzeichnisses: Symlink-Ziel wird als fester Pfad
// nachgezogen, echte Verzeichnisse werden verschoben.
function resolvePrevious(livePath, targetPath) {
  if (!fs.existsSync(livePath)) return;
  const info = fs.lstatSync(livePath);
  if (info.isSymbolicLink()) {
    const current = fs.readlinkSync(livePath);
    fs.symlinkSync(current, targetPath);
  } else {
    fs.renameSync(livePath, targetPath);
  }
}

function rollbackTo(protectedBackend, protectedFrontend) {
  log('error', 'Rollback auf vorherigen Stand…');
  stopService();
  const liveBackend = path.join(cfg.INSTALL_DIR, 'backend');
  const liveFrontend = path.join(cfg.INSTALL_DIR, 'frontend');
  fs.rmSync(liveBackend, { force: true });
  fs.rmSync(liveFrontend, { force: true });
  if (protectedBackend) fs.symlinkSync(protectedBackend, liveBackend);
  if (protectedFrontend) fs.symlinkSync(protectedFrontend, liveFrontend);
  startService();
  reloadWeb();
  log('error', 'Rollback abgeschlossen.');
}

function cleanupOldReleases() {
  const releasesDir = path.join(cfg.INSTALL_DIR, 'releases');
  if (!fs.existsSync(releasesDir)) return;
  const keep = Number(cfg.KEEP_RELEASES) || 5;
  const dirs = fs.readdirSync(releasesDir)
    .filter((name) => fs.statSync(path.join(releasesDir, name), { throwIfNoEntry: false })?.isDirectory())
    .sort()
    .reverse();
  for (const name of dirs.slice(keep)) {
    fs.rmSync(path.join(releasesDir, name), { recursive: true, force: true });
    log('info', `Altes Release entfernt: ${name}`);
  }
}

// ─── Kommandos ─────────────────────────────────────────────────────────────
function cmdStatus() {
  const state = readState();
  const out = {
    currentVersion: state?.currentVersion,
    installStatus: state?.installStatus,
    lastCheckAt: state?.lastCheckAt,
    lastCheckStatus: state?.lastCheckStatus,
    available: state?.available?.manifest?.version || null,
    lastUpdate: state?.lastUpdate,
    installError: state?.installError
  };
  console.log(JSON.stringify(out, null, 2));
}

function cmdDownload() {
  requireRoot();
  log('info', 'Download-Kommando gestartet.');
  return mutateState((state) => {
    if (state.installStatus === 'installing') throw new Error('Ein Update wird gerade installiert.');
    if (!state.available?.manifest) throw new Error('Kein überprüftes Update vorhanden.');
    download(state.available);
  });
}

function cmdInstall() {
  requireRoot();
  log('info', '=== Inventar-Tool Auto-Update gestartet ===');

  const state = readState();
  if (!state?.available?.manifest) {
    log('warn', 'Kein überprüftes Update vorhanden – nichts zu tun.');
    return 2;
  }

  const manifest = state.available.manifest;
  const signature = state.available.signature;
  const publicKey = state.available.publicKey;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventar-update-'));
  const manifestFile = path.join(workDir, 'manifest.json');
  const signatureFile = path.join(workDir, 'signature.b64');
  const keyFile = path.join(workDir, 'public.pem');
  let releaseDir = null;
  let switchInfo = null;

  mutateState((s) => {
    s.installStatus = 'installing';
    s.installStartedAt = new Date().toISOString();
    s.installError = null;
    appendInstallLog(s, `Update auf ${manifest.version} gestartet.`);
  });

  try {
    check('node');
    check('npm');
    check('tar');
    check('curl');

    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
    fs.writeFileSync(signatureFile, signature);
    fs.writeFileSync(keyFile, '-----BEGIN PUBLIC KEY-----\n' + publicKey.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\n/g, '').trim() + '\n-----END PUBLIC KEY-----\n');

    log('info', `Manifest-Signatur wird geprüft (Version ${manifest.version}, Kanal ${manifest.channel}).`);
    verifyManifest(manifestFile, signatureFile, keyFile);

    const packageFile = download(state.available);
    log('info', `Paket: ${packageFile}`);
    releaseDir = extractPackage(packageFile);
    buildRelease(releaseDir);

    const serviceUnit = path.join('/etc/systemd/system', `${cfg.SERVICE_NAME}.service`);
    if (fs.existsSync(serviceUnit)) {
      const backupDir = path.join(cfg.INSTALL_DIR, 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
      fs.mkdirSync(backupDir, { recursive: true });
      fs.copyFileSync(serviceUnit, path.join(backupDir, path.basename(serviceUnit)));
    }

    stopService();
    switchInfo = switchRelease(releaseDir);
    startService();
    reloadWeb();

    const port = Number(readEnvValue('PORT') || 3456);
    if (!healthcheck(port)) {
      throw new Error('Healthcheck nach dem Update fehlgeschlagen – Rollback durchgeführt.');
    }

    mutateState((s) => {
      s.currentVersion = manifest.version;
      s.lastUpdate = { version: manifest.version, channel: manifest.channel, at: new Date().toISOString(), success: true };
      s.releaseNotes = (s.releaseNotes || []).concat(manifest.releaseNotes || []).slice(-200);
      s.history = s.history || [];
      s.history.unshift({ version: manifest.version, status: 'success', at: new Date().toISOString(), releaseDir });
      s.history = s.history.slice(0, 20);
      s.available = null;
      s.installStatus = 'success';
      s.installFinishedAt = new Date().toISOString();
      s.installError = null;
      appendInstallLog(s, `Update auf ${manifest.version} erfolgreich (Backup: ${switchInfo.backupDir}).`);
    });

    cleanupOldReleases();
    fs.rmSync(workDir, { recursive: true, force: true });
    log('info', `=== Update auf ${manifest.version} abgeschlossen ===`);
    return 0;
  } catch (error) {
    if (switchInfo) {
      // Erst nach dem Umschalten lohnt ein Rollback; vorher wurde nichts gefasst.
      rollbackTo(switchInfo.previousBackend, switchInfo.previousFrontend);
    }
    mutateState((s) => {
      s.installStatus = 'failed';
      s.installFinishedAt = new Date().toISOString();
      s.installError = error.message;
      appendInstallLog(s, `Update fehlgeschlagen: ${error.message}`);
    });
    log('error', error.message);
    fs.rmSync(workDir, { recursive: true, force: true });
    return 1;
  }
}

function cmdRollback() {
  requireRoot();
  const state = readState();
  if (!state?.history?.length) {
    log('warn', 'Keine frühere Version bekannt.');
    return 2;
  }
  const previous = state.history.find((h) => h.status === 'success');
  if (previous?.releaseDir && fs.existsSync(path.join(previous.releaseDir, 'backend'))) {
    stopService();
    fs.rmSync(path.join(cfg.INSTALL_DIR, 'backend'), { force: true });
    fs.rmSync(path.join(cfg.INSTALL_DIR, 'frontend'), { force: true });
    fs.symlinkSync(path.join(previous.releaseDir, 'backend'), path.join(cfg.INSTALL_DIR, 'backend'));
    fs.symlinkSync(path.join(previous.releaseDir, 'frontend'), path.join(cfg.INSTALL_DIR, 'frontend'));
    startService();
    reloadWeb();
    mutateState((s) => {
      s.history.unshift({ version: previous.version, status: 'rollback', at: new Date().toISOString() });
      s.currentVersion = previous.version;
      log('info', `Rollback auf ${previous.version} durchgeführt.`);
    });
    return 0;
  }
  log('warn', 'Rollback nicht möglich.');
  return 2;
}

// ─── Main ──────────────────────────────────────────────────────────────────
const command = process.argv[2] || 'status';
let exitCode = 0;
try {
  switch (command) {
    case 'install': exitCode = cmdInstall(); break;
    case 'download': exitCode = cmdDownload(); break;
    case 'rollback': exitCode = cmdRollback(); break;
    case 'cleanup': exitCode = cleanupOldReleases() || 0; break;
    case 'status':
    default: cmdStatus(); break;
  }
} catch (error) {
  log('error', error.message);
  exitCode = 1;
}
process.exit(typeof exitCode === 'number' ? exitCode : 1);