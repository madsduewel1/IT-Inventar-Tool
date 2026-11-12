const { execSync } = require('child_process');

try {
  console.log('Generating Prisma client...');
  execSync('npx prisma generate', { stdio: 'inherit', cwd: __dirname + '/..' });
  console.log('Prisma client generated successfully.');

  console.log('Pushing database schema to database...');
  execSync('npx prisma db push', { stdio: 'inherit', cwd: __dirname + '/..' });
  console.log('Database schema pushed successfully.');

  // Datenmigrationen (Settings, Gerätezustände) – siehe scripts/data-migrate.js
  execSync('node scripts/data-migrate.js', { stdio: 'inherit', cwd: __dirname + '/..' });
} catch (error) {
  console.error('Prisma migration/generate failed:', error.message);
  process.exit(1);
}
