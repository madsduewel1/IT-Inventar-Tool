const express = require('express');
const os = require('os');
const { execSync } = require('child_process');
const prisma = require('../config/prisma');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/overview', auth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const provider = process.env.DB_PROVIDER || 'mysql';
    let dbSize = null;
    let dbVersion = null;

    if (provider === 'mysql') {
      const [sizeResult, versionResult] = await Promise.allSettled([
        prisma.$queryRaw`SELECT SUM(data_length + index_length) AS size FROM information_schema.tables WHERE table_schema = DATABASE()`,
        prisma.$queryRaw`SELECT VERSION() AS version`
      ]);
      if (sizeResult.status === 'fulfilled') dbSize = Number(sizeResult.value[0]?.size || 0);
      if (versionResult.status === 'fulfilled') dbVersion = versionResult.value[0]?.version;
    } else {
      try {
        const fs = require('fs');
        const dbPath = process.env.DATABASE_URL?.replace(/^file:/, '') || './data/mzinventory.db';
        if (fs.existsSync(dbPath)) dbSize = fs.statSync(dbPath).size;
      } catch {}
      dbVersion = 'SQLite';
    }

    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    const disk = getDiskUsage();

    const packages = getPackageVersions();

    res.json({
      os: {
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        distro: getDistro(),
        kernel: os.version(),
        uptime: os.uptime(),
        arch: os.arch()
      },
      cpu: {
        model: cpus.length ? cpus[0].model : 'N/A',
        cores: cpus.length,
        loadAvg: os.loadavg()
      },
      memory: {
        total: totalMem,
        used: totalMem - freeMem,
        free: freeMem
      },
      disk,
      database: {
        type: provider,
        version: dbVersion,
        size: dbSize
      },
      packages
    });
  } catch (error) {
    next(error);
  }
});

function getDiskUsage() {
  try {
    const output = execSync('df -k / | tail -1', { timeout: 3000, encoding: 'utf8' });
    const parts = output.trim().split(/\s+/);
    if (parts.length >= 4) {
      return {
        total: parseInt(parts[1], 10) * 1024,
        used: parseInt(parts[2], 10) * 1024,
        free: parseInt(parts[3], 10) * 1024
      };
    }
  } catch {}
  return null;
}

function getDistro() {
  try {
    const output = execSync('cat /etc/os-release 2>/dev/null | grep "^PRETTY_NAME=" | head -1', { timeout: 2000, encoding: 'utf8' });
    const match = output.match(/^PRETTY_NAME="?(.+?)"?$/);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

function getPackageVersions() {
  const result = {};
  try { result.node = process.version; } catch {}
  try { result.npm = execSync('npm --version', { timeout: 2000, encoding: 'utf8' }).trim(); } catch {}
  try { result.mysql = execSync('mysql --version', { timeout: 2000, encoding: 'utf8' }).trim(); } catch {}
  try {
    const prismaVersion = require('@prisma/client/package.json').version;
    result.prisma = prismaVersion;
  } catch {}
  try { result.ubuntu = getDistro(); } catch {}
  return result;
}

module.exports = router;
