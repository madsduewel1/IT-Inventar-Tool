const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ quiet: true });

const basePathRaw = process.env.BASE_PATH || '/inventory';
const basePath = `/${basePathRaw.replace(/^\/+|\/+$/g, '')}`;
const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
const dataDir = process.env.DATA_DIR || path.dirname(uploadDir);

// Zentrale Versionsinformation. Die version.json ist die verbindliche Quelle,
// VERSION bleibt als Fallback fuer aeltere Installationen erhalten.
function readVersionInfo() {
  const file = process.env.VERSION_FILE || path.join(__dirname, '..', '..', 'version.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      version: String(parsed.version || '').trim().replace(/^v/i, '') || '0.0.0',
      release: parsed.release || 'stable',
      build: parsed.build || '',
      releasedAt: parsed.releasedAt || ''
    };
  } catch {
    try {
      const legacy = fs.readFileSync(path.join(__dirname, '..', '..', 'VERSION'), 'utf8').trim().replace(/^v/i, '');
      return { version: legacy || '0.0.0', release: 'stable', build: '', releasedAt: '' };
    } catch {
      return { version: process.env.APP_VERSION || '0.0.0', release: 'stable', build: '', releasedAt: '' };
    }
  }
}

const versionInfo = readVersionInfo();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3456),
  basePath,
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  setupDone: process.env.SETUP_DONE === 'true',
  uploadDir,
  dataDir,
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB || 10),
  version: versionInfo.version,
  versionInfo,
  updater: {
    repo: process.env.UPDATE_REPO || 'madsduewel1/IT-Inventar-Tool',
    channel: process.env.UPDATE_CHANNEL || 'stable',
    token: process.env.UPDATE_TOKEN || '',
    enabled: process.env.UPDATE_ENABLED !== 'false',
    autoCheck: process.env.UPDATE_AUTO_CHECK !== 'false',
    checkHours: Number(process.env.UPDATE_CHECK_HOURS || 24),
    notify: process.env.UPDATE_NOTIFY !== 'false',
    clientBin: process.env.UPDATE_CLIENT_BIN || '/usr/local/bin/inventar-update',
    installDir: process.env.INSTALL_DIR || '/opt/inventar-tool',
    serviceName: process.env.SERVICE_NAME || 'inventar-tool',
    stateFile: process.env.UPDATER_STATE_FILE || path.join(dataDir, 'update-state.json'),
    logFile: process.env.UPDATER_LOG_FILE || '/var/log/inventar-tool/updates.log',
    maintenanceFile: process.env.MAINTENANCE_FILE || path.join(dataDir, 'maintenance.json'),
    lockFile: process.env.UPDATER_LOCK_FILE || path.join(dataDir, 'update.lock')
  },
  sso: {
    enabled: process.env.SSO_ENABLED === 'true',
    provider: process.env.SSO_PROVIDER || '',
    clientId: process.env.SSO_CLIENT_ID || '',
    clientSecret: process.env.SSO_CLIENT_SECRET || '',
    issuerUrl: process.env.SSO_ISSUER_URL || ''
  }
};
