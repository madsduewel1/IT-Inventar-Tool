const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const basePath = process.env.BASE_PATH || '/inventory';
const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3456),
  basePath: basePath.startsWith('/') ? basePath : `/${basePath}`,
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  setupDone: process.env.SETUP_DONE === 'true',
  uploadDir,
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB || 10),
  sso: {
    enabled: process.env.SSO_ENABLED === 'true',
    provider: process.env.SSO_PROVIDER || '',
    clientId: process.env.SSO_CLIENT_ID || '',
    clientSecret: process.env.SSO_CLIENT_SECRET || '',
    issuerUrl: process.env.SSO_ISSUER_URL || ''
  }
};
