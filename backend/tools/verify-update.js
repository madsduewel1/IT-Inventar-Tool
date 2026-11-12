#!/usr/bin/env node
// Standalone-Verifikation eines Update-Manifests (ed25519) und ggf. SHA-256
// eines heruntergeladenen Pakets. Bewusst ohne Abhängigkeiten, damit das
// Skript auch als root und ohne installierte node_modules laeuft.
//
// Aufruf:
//   node verify-update.js --manifest <file> --signature <file> --key <file>
//                        [--data <file>]
//
// Exit-Code 0 = OK, 1 = Fehler.

const fs = require('fs');
const crypto = require('crypto');

function canonicalStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite number in canonical JSON');
    return String(value);
  }
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const parts = keys
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`);
    return `{${parts.join(',')}}`;
  }
  throw new Error(`Unsupported type in canonical JSON: ${typeof value}`);
}

function readArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('--')) result[args[i].slice(2)] = args[i + 1];
  }
  return result;
}

function fail(message) {
  console.error('VERIFY-FEHLER: ' + message);
  process.exit(1);
}

const { manifest: manifestPath, signature: signaturePath, key: keyPath, data: dataPath } = readArgs();
if (!manifestPath || !signaturePath || !keyPath) fail('Manifest, Signatur und Schluessel sind erforderlich.');

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (error) {
  fail('Manifest nicht lesbar: ' + error.message);
}

let publicKey;
try {
  const pem = fs.readFileSync(keyPath, 'utf8');
  publicKey = crypto.createPublicKey({ key: pem, format: 'pem', type: 'spki' });
} catch (error) {
  fail('Oeffentlicher Schluessel nicht lesbar: ' + error.message);
}

let canonical;
try {
  canonical = canonicalStringify(manifest);
} catch (error) {
  fail('Manifest kann nicht kanonisch serialisiert werden: ' + error.message);
}

let signature;
try {
  signature = Buffer.from(fs.readFileSync(signaturePath, 'utf8').trim(), 'base64');
} catch (error) {
  fail('Signatur nicht lesbar: ' + error.message);
}

try {
  const valid = crypto.verify(null, Buffer.from(canonical, 'utf8'), publicKey, signature);
  if (!valid) fail('Signatur des Manifests ist UNGUELTIG.');
} catch (error) {
  fail('Signaturpruefung fehlgeschlagen: ' + error.message);
}

if (dataPath) {
  if (!manifest.sha256) fail('Manifest enthaelt keinen sha256-Hash.');
  let actual;
  try {
    actual = crypto.createHash('sha256').update(fs.readFileSync(dataPath)).digest('hex');
  } catch (error) {
    fail('Paket nicht lesbar: ' + error.message);
  }
  if (actual !== manifest.sha256) {
    fail('SHA-256 des Pakets stimmt nicht mit dem Manifest ueberein.');
  }
  if (manifest.size && Number(manifest.size) !== fs.statSync(dataPath).size) {
    fail('Dateigroesse des Pakets stimmt nicht mit dem Manifest ueberein.');
  }
}

console.log('VERIFY-OK ' + JSON.stringify({
  version: manifest.version,
  channel: manifest.channel,
  sha256: manifest.sha256 ? manifest.sha256.slice(0, 16) + '…' : null
}));
process.exit(0);