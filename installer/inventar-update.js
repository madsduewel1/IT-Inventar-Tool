#!/usr/bin/env node
'use strict';

/*
 * Root-Installationshelfer des Git-basierten Update-Systems.
 *
 * Aufruf:
 *   inventar-update check --repo owner/name --branch main
 *   inventar-update install --repo owner/name --branch main [--version v2.2.1]
 *   inventar-update status
 *   inventar-update rollback
 *
 * Das Skript validiert alle Argumente selbst. Es werden niemals frei vom
 * Frontend uebermittelte Shell-Befehle oder Pfade ausgefuehrt.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const CONFIG_FILE = process.env.UPDATE_CONF || '/etc/inventar-tool/update.conf';

function parseConfig(file) {
  const result = {};
  try {
    const raw = fs.readFileSync(file, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  } catch {}
  return result;
}

const fileConfig = parseConfig(CONFIG_FILE);

const cfg = {
  repo: process.env.UPDATE_REPO || fileConfig.REPO || 'madsduewel1/IT-Inventar-Tool',
  branch: process.env.UPDATE_BRANCH || fileConfig.BRANCH || 'main',
  installDir: process.env.INSTALL_DIR || fileConfig.INSTALL_DIR || '/opt/inventar-tool',
  dataDir: process.env.DATA_DIR || fileConfig.DATA_DIR || '/var/lib/inventar-tool',
  logDir: process.env.LOG_DIR || fileConfig.LOG_DIR || '/var/log/inventar-tool',
  envFile: process.env.ENV_FILE || fileConfig.ENV_FILE || '/etc/inventar-tool/backend.env',
  serviceName: process.env.SERVICE_NAME || fileConfig.SERVICE_NAME || 'inventar-tool',
  basePath: process.env.BASE_PATH || fileConfig.BASE_PATH || '/inventar-tool',
  port: process.env.PORT || fileConfig.PORT || '3456',
  stateFile: process.env.STATE_FILE || fileConfig.STATE_FILE || '',
  logFile: process.env.LOG_FILE || fileConfig.LOG_FILE || '',
  maintenanceFile: process.env.MAINTENANCE_FILE || fileConfig.MAINTENANCE_FILE || '',
  lockFile: process.env.LOCK_FILE || fileConfig.LOCK_FILE || '',
  keepReleases: Number(process.env.KEEP_RELEASES || fileConfig.KEEP_RELEASES || 5),
  githubToken: process.env.GITHUB_TOKEN || fileConfig.GITHUB_TOKEN || '',
  serviceUser: process.env.SERVICE_USER || fileConfig.SERVICE_USER || 'inventartool',
  skipDbMigrate: process.env.SKIP_DB_MIGRATE === 'true'
};

cfg.stateFile = cfg.stateFile || path.join(cfg.dataDir, 'update-state.json');
cfg.logFile = cfg.logFile || path.join(cfg.logDir, 'updates.log');
cfg.maintenanceFile = cfg.maintenanceFile || path.join(cfg.dataDir, 'maintenance.json');
cfg.lockFile = cfg.lockFile || path.join(cfg.dataDir, 'update.lock');
cfg.releasesDir = path.join(cfg.installDir, 'releases');
cfg.backupsDir = path.join(cfg.installDir, 'backups');
cfg.lastReleaseFile = path.join(cfg.dataDir, 'last-release.json');

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const TAG_PATTERN = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const BRANCH_PATTERN = /^(?!.*\.\.)[A-Za-z0-9._\/-]+$/;

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '');
}

function normalizeRepo(value) {
  return String(value || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function chownService(target) {
  try {
    const { uid, gid } = userIds(cfg.serviceUser);
    if (uid === null) return;
    fs.chownSync(target, uid, gid);
  } catch {}
}

function chownRecursive(target) {
  try {
    const { uid, gid } = userIds(cfg.serviceUser);
    if (uid === null) return;
    const stat = fs.lstatSync(target);
    // Symlinks (z. B. backend/.env) duerfen ihr Ziel nicht veraendern.
    if (stat.isSymbolicLink()) {
      fs.lchownSync(target, uid, gid);
      return;
    }
    fs.chownSync(target, uid, gid);
    if (!stat.isDirectory()) return;
    for (const entry of fs.readdirSync(target)) {
      chownRecursive(path.join(target, entry));
    }
  } catch {}
}

function userIds(user) {
  const passwd = spawnSync('getent', ['passwd', user], { encoding: 'utf8' });
  if (passwd.status !== 0) return { uid: null, gid: null };
  const parts = passwd.stdout.trim().split(':');
  return { uid: Number(parts[2]), gid: Number(parts[3]) };
}

function nowIso() {
  return new Date().toISOString();
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(cfg.stateFile, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(mutator) {
  ensureDir(path.dirname(cfg.stateFile));
  const state = readState();
  mutator(state);
  const temp = `${cfg.stateFile}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, cfg.stateFile);
  chownService(cfg.stateFile);
}

function appendStateLog(state, message) {
  state.installLog = state.installLog || [];
  state.installLog.push({ ts: nowIso(), message });
  if (state.installLog.length > 300) state.installLog = state.installLog.slice(-300);
}

function log(level, message) {
  const line = `[${nowIso()}] [${level}] ${message}`;
  try {
    ensureDir(path.dirname(cfg.logFile));
    fs.appendFileSync(cfg.logFile, line + '\n');
    try { fs.chmodSync(cfg.logFile, 0o640); } catch {}
    chownService(cfg.logFile);
  } catch {}
  if (level !== 'debug') console.log(line);
  writeState((state) => appendStateLog(state, message));
}

function setStep(step) {
  writeState((state) => {
    state.installStatus = 'running';
    state.installStep = step;
  });
}

function setMaintenance(enabled, message) {
  ensureDir(path.dirname(cfg.maintenanceFile));
  if (!enabled) {
    try { fs.unlinkSync(cfg.maintenanceFile); } catch {}
    return;
  }
  fs.writeFileSync(cfg.maintenanceFile, JSON.stringify({
    enabled: true,
    message,
    reason: 'update',
    startedAt: nowIso()
  }, null, 2));
  chownService(cfg.maintenanceFile);
}

function acquireLock() {
  ensureDir(path.dirname(cfg.lockFile));
  try {
    const existing = Number(fs.readFileSync(cfg.lockFile, 'utf8').trim());
    if (existing) {
      try {
        process.kill(existing, 0);
        throw new Error(`Es laeuft bereits ein Update (PID ${existing}).`);
      } catch (error) {
        if (error.message.startsWith('Es laeuft bereits')) throw error;
        try { fs.unlinkSync(cfg.lockFile); } catch {}
      }
    }
  } catch (error) {
    if (error.message.startsWith('Es laeuft bereits')) throw error;
  }
  fs.writeFileSync(cfg.lockFile, String(process.pid));
  chownService(cfg.lockFile);
}

function releaseLock() {
  try {
    const pid = Number(fs.readFileSync(cfg.lockFile, 'utf8').trim());
    if (pid === process.pid) fs.unlinkSync(cfg.lockFile);
  } catch {}
}

function which(command) {
  const result = spawnSync('bash', ['-lc', `command -v ${command}`], { encoding: 'utf8' });
  if (result.status === 0) return result.stdout.trim();
  for (const candidate of ['/usr/bin', '/usr/local/bin', '/bin']) {
    const full = path.join(candidate, command);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function redactSecrets(value) {
  let out = String(value || '');
  if (cfg.githubToken) out = out.split(cfg.githubToken).join('***');
  return out.replace(/\/\/[^/@\s]+@github\.com/g, '//***@github.com');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 100,
    ...options
  });
  if (result.error) throw new Error(redactSecrets(result.error.message));
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(redactSecrets(`${path.basename(command)} ${args.join(' ')} fehlgeschlagen (Exit ${result.status}): ${detail.slice(0, 800)}`));
  }
  return result.stdout || '';
}

function commandExists(command) {
  return !!which(command);
}

function readEnvValue(key) {
  try {
    const raw = fs.readFileSync(cfg.envFile, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index === -1) continue;
      if (trimmed.slice(0, index).trim() === key) {
        return trimmed.slice(index + 1).trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
      }
    }
  } catch {}
  return '';
}

function parseDatabaseUrl(value) {
  try {
    const url = new URL(value);
    if (!['mysql:', 'mariadb:'].includes(url.protocol)) return null;
    return {
      host: url.hostname,
      port: url.port || '3306',
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, ''))
    };
  } catch {
    return null;
  }
}

function diskFreeBytes(target) {
  try {
    if (typeof fs.statfsSync === 'function') {
      const stats = fs.statfsSync(target);
      return Number(stats.bavail) * Number(stats.bsize);
    }
  } catch {}
  try {
    const output = run('df', ['-k', target]);
    const line = output.trim().split('\n').pop();
    const parts = line.split(/\s+/);
    return Number(parts[3]) * 1024;
  } catch {}
  return null;
}

function readVersionFile(dir) {
  const candidates = [
    path.join(dir, 'backend', 'version.json'),
    path.join(dir, 'version.json'),
    path.join(dir, 'backend', 'VERSION')
  ];
  for (const file of candidates) {
    try {
      const raw = fs.readFileSync(file, 'utf8').trim();
      if (file.endsWith('.json')) {
        const parsed = JSON.parse(raw);
        if (parsed.version) return normalizeVersion(parsed.version);
      } else if (raw) {
        return normalizeVersion(raw);
      }
    } catch {}
  }
  return null;
}

function currentReleasePath(kind) {
  try {
    return fs.realpathSync(path.join(cfg.installDir, kind));
  } catch {
    return null;
  }
}

function atomicSymlink(target, link) {
  const temp = `${link}.new-${process.pid}`;
  try { fs.unlinkSync(temp); } catch {}
  fs.symlinkSync(target, temp);
  fs.renameSync(temp, link);
}

function lstatOrNull(target) {
  try { return fs.lstatSync(target); } catch { return null; }
}

// Installationen aus installer/install.sh liegen direkt unter backend/ und
// frontend/ (keine Release-Symlinks). Vor dem ersten Update werden sie in das
// Release-Layout verschoben, damit Aktivierung und Rollback funktionieren.
function migrateLegacyLayout() {
  const backendLink = path.join(cfg.installDir, 'backend');
  const frontendLink = path.join(cfg.installDir, 'frontend');
  const backendStat = lstatOrNull(backendLink);
  const frontendStat = lstatOrNull(frontendLink);
  const backendIsDir = backendStat?.isDirectory();
  const frontendIsDir = frontendStat?.isDirectory();
  if (!backendIsDir && !frontendIsDir) return null;

  ensureDir(cfg.releasesDir);
  const legacyDir = path.join(cfg.releasesDir, `legacy-${nowIso().replace(/[:.]/g, '-')}`);
  ensureDir(legacyDir);

  if (backendIsDir) {
    fs.renameSync(backendLink, path.join(legacyDir, 'backend'));
    atomicSymlink(path.join(legacyDir, 'backend'), backendLink);
  } else if (backendStat?.isSymbolicLink()) {
    fs.symlinkSync(fs.realpathSync(backendLink), path.join(legacyDir, 'backend'));
  }

  if (frontendIsDir) {
    fs.renameSync(frontendLink, path.join(legacyDir, 'frontend'));
    atomicSymlink(path.join(legacyDir, 'frontend'), frontendLink);
  } else if (frontendStat?.isSymbolicLink()) {
    fs.symlinkSync(fs.realpathSync(frontendLink), path.join(legacyDir, 'frontend'));
  }

  atomicSymlink(legacyDir, path.join(cfg.installDir, 'current'));
  log('info', `Bestehende Installation in Release-Layout verschoben: ${legacyDir}`);
  return legacyDir;
}

function switchRelease(releaseDir) {
  atomicSymlink(path.join(releaseDir, 'backend'), path.join(cfg.installDir, 'backend'));
  atomicSymlink(path.join(releaseDir, 'frontend'), path.join(cfg.installDir, 'frontend'));
  atomicSymlink(releaseDir, path.join(cfg.installDir, 'current'));
}

function saveLastRelease() {
  const backend = currentReleasePath('backend');
  const frontend = currentReleasePath('frontend');
  if (!backend || !frontend) return;
  ensureDir(path.dirname(cfg.lastReleaseFile));
  fs.writeFileSync(cfg.lastReleaseFile, JSON.stringify({
    backend,
    frontend,
    releaseDir: path.dirname(backend),
    savedAt: nowIso()
  }, null, 2));
  chownService(cfg.lastReleaseFile);
}

function isInsideReleases(target) {
  if (!target) return false;
  const resolved = path.resolve(target);
  const base = path.resolve(cfg.releasesDir);
  return resolved === base || resolved.startsWith(`${base}${path.sep}`);
}

function restoreLastRelease() {
  try {
    const raw = JSON.parse(fs.readFileSync(cfg.lastReleaseFile, 'utf8'));
    if (!raw.backend || !raw.frontend) throw new Error('Kein vorheriges Release gespeichert.');
    // Die State-Datei liegt im Schreibbereich des Dienstbenutzers. Pfade
    // muessen daher zwingend innerhalb des Release-Verzeichnisses liegen.
    if (!isInsideReleases(raw.backend) || !isInsideReleases(raw.frontend)) {
      throw new Error('Gespeicherte Release-Pfade sind ungueltig.');
    }
    if (!fs.existsSync(raw.backend) || !fs.existsSync(raw.frontend)) {
      throw new Error('Vorheriges Release ist nicht mehr vorhanden.');
    }
    atomicSymlink(raw.backend, path.join(cfg.installDir, 'backend'));
    atomicSymlink(raw.frontend, path.join(cfg.installDir, 'frontend'));
    if (raw.releaseDir && isInsideReleases(raw.releaseDir)) {
      atomicSymlink(raw.releaseDir, path.join(cfg.installDir, 'current'));
    }
    return raw;
  } catch (error) {
    throw new Error(`Rollback nicht moeglich: ${error.message}`);
  }
}

function backupDatabase(timestamp) {
  const databaseUrl = readEnvValue('DATABASE_URL');
  const parsed = parseDatabaseUrl(databaseUrl);
  if (!parsed) {
    log('warn', 'Datenbank-Backup uebersprungen (DATABASE_URL nicht lesbar).');
    return null;
  }
  if (!commandExists('mysqldump')) {
    log('warn', 'Datenbank-Backup uebersprungen (mysqldump fehlt).');
    return null;
  }
  const backupDir = path.join(cfg.backupsDir, timestamp);
  ensureDir(backupDir);
  const target = path.join(backupDir, 'db.sql.gz');
  const dump = spawnSync('mysqldump', [
    `--host=${parsed.host}`,
    `--port=${parsed.port}`,
    `--user=${parsed.user}`,
    '--single-transaction',
    '--routines',
    '--triggers',
    parsed.database
  ], {
    encoding: 'buffer',
    maxBuffer: 1024 * 1024 * 500,
    env: { ...process.env, MYSQL_PWD: parsed.password }
  });
  if (dump.error) throw dump.error;
  if (dump.status !== 0) {
    throw new Error(`mysqldump fehlgeschlagen: ${String(dump.stderr || '').slice(0, 500)}`);
  }
  fs.writeFileSync(target, zlib.gzipSync(dump.stdout));
  chownService(target);
  log('info', `Datenbank-Backup erstellt: ${target}`);
  return target;
}

function cloneRelease(repo, tag, releaseDir) {
  const git = which('git');
  const safeTag = tag.replace(/[^0-9A-Za-z._-]/g, '_');
  ensureDir(cfg.releasesDir);
  if (fs.existsSync(releaseDir)) {
    fs.rmSync(releaseDir, { recursive: true, force: true });
  }

  if (git) {
    const auth = cfg.githubToken
      ? `https://x-access-token:${encodeURIComponent(cfg.githubToken)}@github.com/${repo}.git`
      : `https://github.com/${repo}.git`;
    log('info', `Lade Release ${tag} via git...`);
    run(git, ['clone', '--branch', tag, '--depth', '1', '--single-branch', auth, releaseDir]);
    try {
      const commit = run(git, ['-C', releaseDir, 'rev-parse', 'HEAD']).trim();
      return commit;
    } catch {
      return '';
    }
  }

  log('info', `Lade Release ${tag} via GitHub-Tarball...`);
  ensureDir(releaseDir);
  const archive = path.join(os.tmpdir(), `inventar-${safeTag}-${Date.now()}.tar.gz`);
  const headers = cfg.githubToken ? ['-H', `Authorization: Bearer ${cfg.githubToken}`] : [];
  run(which('curl') || 'curl', [
    '-fsSL',
    ...headers,
    `https://codeload.github.com/${repo}/tar.gz/refs/tags/${tag}`,
    '-o', archive
  ]);
  run('tar', ['-xzf', archive, '--strip-components=1', '-C', releaseDir]);
  try { fs.unlinkSync(archive); } catch {}
  return '';
}

function verifyRelease(releaseDir, tag) {
  const required = [
    'backend/package.json',
    'frontend/package.json',
    'backend/prisma/schema.prisma'
  ];
  for (const relative of required) {
    if (!fs.existsSync(path.join(releaseDir, relative))) {
      throw new Error(`Release unvollstaendig: ${relative} fehlt.`);
    }
  }
  const version = readVersionFile(releaseDir);
  if (!version) throw new Error('Release enthaelt keine Versionsdatei (version.json/VERSION).');
  if (version !== normalizeVersion(tag)) {
    throw new Error(`Versionskonflikt: Release meldet ${version}, angefordert war ${normalizeVersion(tag)}.`);
  }
  return version;
}

function installDependencies(releaseDir) {
  const npm = which('npm');
  const node = which('node');
  if (!npm || !node) throw new Error('node/npm nicht gefunden.');

  const envFile = path.join(releaseDir, 'backend', '.env');
  try { fs.unlinkSync(envFile); } catch {}
  fs.symlinkSync(cfg.envFile, envFile);

  log('info', 'Installiere Backend-Abhaengigkeiten...');
  run(npm, ['ci', '--omit=dev'], { cwd: path.join(releaseDir, 'backend') });
  log('info', 'Generiere Prisma-Client...');
  run(npm, ['run', 'prisma:generate'], { cwd: path.join(releaseDir, 'backend') });

  if (!cfg.skipDbMigrate) {
    log('info', 'Aktualisiere Datenbankschema...');
    run(npm, ['run', 'db:migrate'], {
      cwd: path.join(releaseDir, 'backend'),
      env: { ...process.env, PRISMA_ACCEPT_DATA_LOSS: 'true' }
    });
  } else {
    log('warn', 'Datenbankmigration uebersprungen (SKIP_DB_MIGRATE=true).');
  }

  log('info', 'Installiere Frontend-Abhaengigkeiten und baue Frontend...');
  run(npm, ['ci', '--include=dev'], { cwd: path.join(releaseDir, 'frontend') });
  const base = `/${String(cfg.basePath).replace(/^\/+|\/+$/g, '')}/`;
  run(npm, ['run', 'build'], {
    cwd: path.join(releaseDir, 'frontend'),
    env: { ...process.env, VITE_BASE_PATH: base }
  });

  const baseDirName = String(cfg.basePath).replace(/^\/+|\/+$/g, '');
  if (baseDirName) {
    const link = path.join(releaseDir, 'frontend', 'dist', baseDirName);
    try { fs.unlinkSync(link); } catch {}
    fs.symlinkSync('.', link);
  }
}

function restartService() {
  const systemctl = which('systemctl') || '/usr/bin/systemctl';
  run(systemctl, ['restart', cfg.serviceName]);
}

function reloadWebServer() {
  const systemctl = which('systemctl') || '/usr/bin/systemctl';
  for (const name of ['apache2', 'httpd']) {
    const active = spawnSync(systemctl, ['is-active', '--quiet', name]);
    if (active.status === 0) {
      const result = spawnSync(systemctl, ['reload', name], { encoding: 'utf8' });
      if (result.status !== 0) log('warn', `Webserver ${name} konnte nicht neu geladen werden.`);
      return;
    }
  }
}

function healthcheck({ expectVersion = null, attempts = 30 } = {}) {
  const curl = which('curl') || 'curl';
  const url = `http://127.0.0.1:${cfg.port}/api/health`;
  for (let i = 0; i < attempts; i += 1) {
    const result = spawnSync(curl, ['-fsS', url], { encoding: 'utf8' });
    if (result.status === 0) {
      let payload = null;
      try { payload = JSON.parse(result.stdout); } catch {}
      if (!expectVersion || normalizeVersion(payload?.version) === normalizeVersion(expectVersion)) {
        return payload || {};
      }
    }
    spawnSync('sleep', ['2']);
  }
  throw new Error(`Healthcheck fehlgeschlagen (${url}).`);
}

function pruneReleases(keep) {
  try {
    const dirs = fs.readdirSync(cfg.releasesDir)
      .map((name) => path.join(cfg.releasesDir, name))
      .filter((dir) => {
        try { return fs.statSync(dir).isDirectory(); } catch { return false; }
      })
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    const current = currentReleasePath('backend');
    for (const dir of dirs.slice(keep)) {
      if (current && path.dirname(current) === dir) continue;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (error) {
    log('warn', `Aufraeumen alter Releases fehlgeschlagen: ${error.message}`);
  }
}

function finishHistory(result, extra = {}) {
  writeState((state) => {
    if (state.history?.[0]) {
      Object.assign(state.history[0], { finishedAt: nowIso(), result, ...extra });
    }
  });
}

function cloneBranch(repo, branch, dest) {
  const git = which('git');
  if (!git) throw new Error('git nicht gefunden.');
  const auth = cfg.githubToken
    ? `https://x-access-token:${encodeURIComponent(cfg.githubToken)}@github.com/${repo}.git`
    : `https://github.com/${repo}.git`;
  ensureDir(path.dirname(dest));
  run(git, ['clone', '--depth', '1', '--branch', branch, '--single-branch', auth, dest]);
  return run(git, ['-C', dest, 'rev-parse', 'HEAD']).trim();
}

function cmdCheck(args) {
  const repoIndex = args.indexOf('--repo');
  const branchIndex = args.indexOf('--branch');
  const repo = normalizeRepo(repoIndex >= 0 ? args[repoIndex + 1] : cfg.repo);
  const branch = branchIndex >= 0 ? String(args[branchIndex + 1] || '').trim() : cfg.branch;

  if (!REPO_PATTERN.test(repo)) throw new Error('Ungueltiges Repository.');
  if (normalizeRepo(cfg.repo) !== repo) {
    throw new Error(`Repository ${repo} ist nicht freigegeben (erlaubt: ${cfg.repo}).`);
  }
  if (!BRANCH_PATTERN.test(branch)) throw new Error('Ungueltiger Branch.');

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'inventar-check-'));
  try {
    const repoDir = path.join(work, 'repo');
    const commit = cloneBranch(repo, branch, repoDir);
    const latestVersion = readVersionFile(repoDir);
    if (!latestVersion) throw new Error('version.json fehlt im Repository.');
    const currentVersion = readVersionFile(cfg.installDir);
    let publishedAt = null;
    try { publishedAt = run('git', ['-C', repoDir, 'log', '-1', '--format=%cI']).trim(); } catch {}
    const status = normalizeVersion(latestVersion) !== normalizeVersion(currentVersion) ? 'update' : 'latest';
    console.log(JSON.stringify({
      status,
      currentVersion,
      latestVersion,
      commit,
      branch,
      repo,
      publishedAt
    }));
    return 0;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

function cmdInstall(args) {
  const versionIndex = args.indexOf('--version');
  const repoIndex = args.indexOf('--repo');
  const branchIndex = args.indexOf('--branch');
  const requestedVersion = versionIndex >= 0 ? String(args[versionIndex + 1] || '').trim() : '';
  const repo = normalizeRepo(repoIndex >= 0 ? args[repoIndex + 1] : cfg.repo);
  const branch = branchIndex >= 0 ? String(args[branchIndex + 1] || '').trim() : cfg.branch;

  if (requestedVersion && !TAG_PATTERN.test(requestedVersion)) throw new Error('Ungueltige Zielversion.');
  if (!REPO_PATTERN.test(repo)) throw new Error('Ungueltiges Repository.');
  if (normalizeRepo(cfg.repo) !== repo) {
    throw new Error(`Repository ${repo} ist nicht freigegeben (erlaubt: ${cfg.repo}).`);
  }
  if (!BRANCH_PATTERN.test(branch)) throw new Error('Ungueltiger Branch.');

  acquireLock();
  let work = null;
  try {
    if (!fs.existsSync(cfg.envFile)) throw new Error(`Konfiguration fehlt: ${cfg.envFile}`);
    const free = diskFreeBytes(cfg.installDir);
    if (free !== null && free < 500 * 1024 * 1024) {
      throw new Error(`Zu wenig Speicherplatz (${Math.round(free / 1024 / 1024)} MB frei, mind. 500 MB noetig).`);
    }

    setMaintenance(true, 'Update laeuft. Das System ist kurzzeitig nicht erreichbar.');
    log('info', `Pruefe ${repo} (${branch})...`);

    work = fs.mkdtempSync(path.join(os.tmpdir(), 'inventar-update-'));
    const repoDir = path.join(work, 'repo');
    const commit = cloneBranch(repo, branch, repoDir);
    const latestVersion = readVersionFile(repoDir);
    if (!latestVersion) throw new Error('version.json fehlt im Repository.');
    if (requestedVersion && normalizeVersion(requestedVersion) !== normalizeVersion(latestVersion)) {
      throw new Error(`Repository meldet Version ${latestVersion}, erwartet war ${normalizeVersion(requestedVersion)}.`);
    }

    const currentVersion = readVersionFile(cfg.installDir);
    if (currentVersion && normalizeVersion(latestVersion) === normalizeVersion(currentVersion)) {
      log('info', `Version ${latestVersion} ist bereits installiert.`);
      setMaintenance(false);
      writeState((state) => {
        state.installStatus = 'success';
        state.installStep = 'done';
        state.installFinishedAt = nowIso();
        state.installError = null;
        state.lastUpdate = { version: latestVersion, at: nowIso(), commit, branch, noop: true };
        state.available = null;
      });
      finishHistory('success', { commit, version: latestVersion, noop: true });
      return 0;
    }

    const updateScript = path.join(repoDir, 'installer', 'update.sh');
    if (!fs.existsSync(updateScript)) throw new Error('installer/update.sh fehlt im Repository.');

    log('info', `Update von ${currentVersion || 'unbekannt'} auf ${latestVersion} wird gestartet...`);
    setStep('dependencies');
    run('bash', [updateScript], {
      cwd: repoDir,
      env: {
        ...process.env,
        INSTALL_DIR: cfg.installDir,
        CONFIG_DIR: path.dirname(cfg.envFile),
        DATA_DIR: cfg.dataDir,
        LOG_DIR: cfg.logDir,
        ENV_FILE: cfg.envFile,
        SERVICE_NAME: cfg.serviceName,
        BASE_PATH: cfg.basePath,
        PORT: cfg.port
      }
    });

    setStep('healthcheck');
    const health = healthcheck();
    const installedVersion = normalizeVersion(health?.version || readVersionFile(cfg.installDir) || '');
    if (normalizeVersion(latestVersion) !== installedVersion) {
      throw new Error(`Healthcheck meldet Version ${installedVersion || 'unbekannt'}, erwartet ${latestVersion}.`);
    }

    setMaintenance(false);
    log('info', `Update auf ${latestVersion} erfolgreich abgeschlossen.`);
    writeState((state) => {
      state.installStatus = 'success';
      state.installStep = 'done';
      state.installFinishedAt = nowIso();
      state.installError = null;
      state.lastUpdate = { version: latestVersion, at: nowIso(), commit, branch };
      state.available = null;
    });
    finishHistory('success', { commit, version: latestVersion });
    return 0;
  } catch (error) {
    log('error', `Update fehlgeschlagen: ${error.message}`);
    let healthy = false;
    try { healthcheck({ attempts: 5 }); healthy = true; } catch {}
    if (healthy) setMaintenance(false);
    else setMaintenance(true, `Update fehlgeschlagen. Bitte Administrator informieren: ${error.message}`);
    writeState((state) => {
      state.installStatus = 'failed';
      state.installStep = 'failed';
      state.installError = error.message;
      state.installFinishedAt = nowIso();
    });
    finishHistory('failed', { error: error.message });
    return 1;
  } finally {
    releaseLock();
    if (work) {
      try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
    }
  }
}

function cmdRollback() {
  acquireLock();
  try {
    setMaintenance(true, 'Rollback laeuft. Das System ist kurzzeitig nicht erreichbar.');
    const previous = restoreLastRelease();
    restartService();
    reloadWebServer();
    healthcheck();
    setMaintenance(false);
    log('info', `Rollback auf ${previous.releaseDir || 'vorheriges Release'} erfolgreich.`);
    return 0;
  } catch (error) {
    log('error', `Rollback fehlgeschlagen: ${error.message}`);
    setMaintenance(true, `Rollback fehlgeschlagen: ${error.message}`);
    return 1;
  } finally {
    releaseLock();
  }
}

function cmdStatus() {
  const state = readState();
  console.log(JSON.stringify({
    currentVersion: readVersionFile(cfg.installDir) || null,
    backend: currentReleasePath('backend'),
    frontend: currentReleasePath('frontend'),
    maintenance: (() => {
      try { return JSON.parse(fs.readFileSync(cfg.maintenanceFile, 'utf8')); } catch { return { enabled: false }; }
    })(),
    state
  }, null, 2));
  return 0;
}

function main(argv) {
  const [command, ...args] = argv;
  try {
    ensureDir(cfg.dataDir);
    ensureDir(cfg.logDir);
    if (command === 'check') return cmdCheck(args);
    if (command === 'install') return cmdInstall(args);
    if (command === 'rollback') return cmdRollback();
    if (command === 'status') return cmdStatus();
    console.error('Aufruf: inventar-update <check | install --repo OWNER/NAME [--branch BRANCH] [--version VERSION] | rollback | status>');
    return 2;
  } catch (error) {
    console.error(`FEHLER: ${error.message}`);
    return 1;
  }
}

process.exit(main(process.argv.slice(2)));
