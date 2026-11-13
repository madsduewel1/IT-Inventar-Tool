const { execSync } = require('child_process');

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
