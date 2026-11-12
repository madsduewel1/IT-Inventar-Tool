const path = require('path');
const fs = require('fs');
const pino = require('pino');

const logPath = path.join(process.cwd(), 'logs', 'app.log');
fs.mkdirSync(path.dirname(logPath), { recursive: true });

module.exports = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    redact: {
      paths: [
        'password',
        'passwordHash',
        'authorization',
        '*.secret',
        '*.password',
        '*.pass',
        '*.token',
        'clientSecret',
        'sso.clientSecret'
      ],
      censor: '[REDACTED]'
    }
  },
  pino.destination({ dest: logPath, sync: false })
);
