const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ quiet: true });

// Maschinen-Konfiguration des Update-Systems (falls vorhanden). Backend und
// automatisches Update-Skript lesen dieselbe Datei, damit Pfade zusammenpassen.
const UPDATE_CONF = '/etc/inventar-tool/update.conf';
if (fs.existsSync(UPDATE_CONF)) {
  dotenv.config({ path: UPDATE_CONF, quiet: true, override: false });
}

const basePathRaw = process.env.BASE_PATH || '/inventory';
const basePath = `/${basePathRaw.replace(/^\/+|\/+$/g, '')}`;
const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

function readVersion() {
  const file = process.env.VERSION_FILE || path.join(__dirname, '..', 'VERSION');
  try {
    return fs.readFileSync(file, 'utf8').trim().replace(/^v/, '');
  } catch {
    return process.env.APP_VERSION || '0.0.0';
  }
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3456),
  basePath,
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  setupDone: process.env.SETUP_DONE === 'true',
  uploadDir,
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB || 10),
  version: readVersion(),
  updater: {
    updateConf: UPDATE_CONF,
    enabled: process.env.UPDATE_ENABLED === 'true',
    serverUrl: (process.env.UPDATE_SERVER_URL || '').replace(/\/+$/, ''),
    channel: process.env.UPDATE_CHANNEL || 'stable',
    publicKey: process.env.UPDATE_PUBLIC_KEY || '',
    autoInstall: process.env.UPDATE_AUTO_INSTALL === 'true',
    telemetry: process.env.UPDATE_TELEMETRY !== 'false',
    checkHour: Number(process.env.UPDATE_CHECK_HOUR || 2),
    clientBin: process.env.UPDATE_CLIENT_BIN || '/usr/local/bin/inventar-update',
    installDir: process.env.INSTALL_DIR || '/opt/inventar-tool',
    configDir: process.env.CONFIG_DIR || '/etc/inventar-tool',
    serviceName: process.env.SERVICE_NAME || 'inventar-tool',
    stateFile: process.env.UPDATER_STATE_FILE || path.join(path.dirname(uploadDir), 'update-state.json'),
    logFile: process.env.UPDATER_LOG_FILE || path.join(process.env.LOG_DIR || path.join(path.dirname(uploadDir), 'logs'), 'updates.log')
  },
  sso: {
    enabled: process.env.SSO_ENABLED === 'true',
    provider: process.env.SSO_PROVIDER || '',
    clientId: process.env.SSO_CLIENT_ID || '',
    clientSecret: process.env.SSO_CLIENT_SECRET || '',
    issuerUrl: process.env.SSO_ISSUER_URL || ''
  }
};
