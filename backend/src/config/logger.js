const path = require('path');
const pino = require('pino');

const logPath = path.join(process.cwd(), 'logs', 'app.log');

module.exports = pino(
  { level: process.env.LOG_LEVEL || 'info' },
  pino.destination({ dest: logPath, sync: false })
);
