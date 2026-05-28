const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const passport = require('passport');
const path = require('path');
const config = require('./config/config');
const logger = require('./config/logger');
const { apiLimiter } = require('./middleware/rateLimit');
const { issueCsrfToken, csrfProtection } = require('./middleware/csrf');
const { notFound, errorHandler } = require('./middleware/errors');
const { startWorker } = require('./services/mailQueue');
const { startInboxWatcher } = require('./services/mailInbound');

fs.mkdirSync(config.uploadDir, { recursive: true });
fs.mkdirSync(path.join(process.cwd(), 'logs'), { recursive: true });

const app = express();
app.set('trust proxy', 'loopback, linklocal, uniquelocal');

app.use(helmet());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());
app.use(cors({
  origin: config.env === 'production' ? false : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: false
}));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'mz-inventory-lite', setupDone: process.env.SETUP_DONE === 'true' });
});

app.use('/api', apiLimiter);
app.get('/api/csrf-token', issueCsrfToken);
app.use('/api', csrfProtection);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/setup', require('./routes/setup'));
app.use('/api/devices', require('./routes/devices'));
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/loans', require('./routes/loans'));
app.use('/api/issues', require('./routes/issues'));
app.use('/api/monitoring', require('./routes/monitoring'));
app.use('/api/users', require('./routes/users'));
app.use('/api/api-keys', require('./routes/api-keys'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/mail', require('./routes/mail'));
app.use('/api/system', require('./routes/system'));

app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  logger.info({ port: config.port, basePath: config.basePath }, 'MZ-Inventory Lite backend started');
  console.log(`MZ-Inventory Lite backend listening on :${config.port}`);
  startWorker();
  startInboxWatcher();
});
