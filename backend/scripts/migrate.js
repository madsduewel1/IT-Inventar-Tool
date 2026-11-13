const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Die .env der Installation ist die verbindliche Quelle. Ein im Shell-Kontext
// gesetztes (fehlerhaftes) DATABASE_URL darf die Migration nicht brechen
// (Prisma P1013: invalid port number).
function readDatabaseUrlFromEnvFile() {
  try {
    const file = path.join(__dirname, '..', '.env');
    const raw = fs.readFileSync(file, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[1].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      return value;
    }
  } catch {}
  return '';
}

const envFileDatabaseUrl = readDatabaseUrlFromEnvFile();
if (envFileDatabaseUrl) process.env.DATABASE_URL = envFileDatabaseUrl;

try {
  console.log('Generating Prisma client...');
  execSync('npx prisma generate', { stdio: 'inherit', cwd: __dirname + '/..' });
  console.log('Prisma client generated successfully.');

  console.log('Pushing database schema to database...');
  // Bei automatisierten Updates ohne TTY muss ein evtl. noetiger Datenverlust
  // explizit erlaubt werden. Der Update-Helfer erstellt vorher ein Backup.
  const acceptDataLoss = process.env.PRISMA_ACCEPT_DATA_LOSS === 'true' ? ' --accept-data-loss' : '';
  execSync(`npx prisma db push${acceptDataLoss}`, { stdio: 'inherit', cwd: __dirname + '/..' });
  console.log('Database schema pushed successfully.');

  // Datenmigrationen (Settings, Gerätezustände) – siehe scripts/data-migrate.js
  execSync('node scripts/data-migrate.js', { stdio: 'inherit', cwd: __dirname + '/..' });
} catch (error) {
  console.error('Prisma migration/generate failed:', error.message);
  process.exit(1);
}
