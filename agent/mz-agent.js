const os = require('os');
const { exec } = require('child_process');
const axios = require('axios');

const SERVER_URL = process.env.SERVER_URL;
const API_KEY = process.env.API_KEY;
const DEVICE_ID = process.env.DEVICE_ID || '';
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 60_000);

if (!SERVER_URL || !API_KEY) {
  console.error('SERVER_URL und API_KEY müssen gesetzt sein.');
  process.exit(1);
}

function getLocalIp() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return '';
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getCpuUsage() {
  const start = os.cpus();
  await wait(300);
  const end = os.cpus();
  const idle = end.reduce((sum, cpu, index) => sum + (cpu.times.idle - start[index].times.idle), 0);
  const total = end.reduce((sum, cpu, index) => {
    const before = Object.values(start[index].times).reduce((a, b) => a + b, 0);
    const after = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    return sum + after - before;
  }, 0);
  return total ? Math.round((1 - idle / total) * 1000) / 10 : 0;
}

function getDiskUsage() {
  return new Promise((resolve) => {
    exec("df -P / | awk 'NR==2 {gsub(/%/, \"\", $5); print $5}'", (error, stdout) => {
      resolve(error ? null : Number(stdout.trim()));
    });
  });
}

async function report() {
  const data = {
    deviceId: DEVICE_ID || undefined,
    hostname: os.hostname(),
    ip: getLocalIp(),
    cpuPercent: await getCpuUsage(),
    ramPercent: Math.round((1 - os.freemem() / os.totalmem()) * 1000) / 10,
    diskPercent: await getDiskUsage()
  };

  await axios.post(`${SERVER_URL.replace(/\/$/, '')}/api/monitoring/report`, data, {
    headers: { 'X-Api-Key': API_KEY }
  });
}

report().catch((error) => console.error(error.message));
setInterval(() => report().catch((error) => console.error(error.message)), INTERVAL_MS);
