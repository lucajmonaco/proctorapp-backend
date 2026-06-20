#!/usr/bin/env node
/**
 * Secure Interview — Rollback Tool
 *
 * If a deploy breaks something, this reverts any file to a known-good SHA.
 *
 * Usage:
 *   GITHUB_TOKEN=xxx node scripts/rollback.js                  # shows all snapshots
 *   GITHUB_TOKEN=xxx node scripts/rollback.js v24              # shows what v24 had
 *   GITHUB_TOKEN=xxx node scripts/rollback.js v24 server.js    # reverts server.js to v24
 *   GITHUB_TOKEN=xxx node scripts/rollback.js v24 all          # reverts ALL files to v24
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error('Set GITHUB_TOKEN env var'); process.exit(1); }
const REPO = 'lucajmonaco/proctorapp-backend';

const snapshotsDir = path.join(__dirname, 'snapshots');
const snapshots = fs.readdirSync(snapshotsDir)
  .filter(f => f.endsWith('.json'))
  .reduce((acc, f) => {
    const name = f.replace('.json','');
    acc[name] = JSON.parse(fs.readFileSync(path.join(snapshotsDir, f)));
    return acc;
  }, {});

function apiReq(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.github.com',
      path: '/repos/' + REPO + '/contents/' + apiPath,
      method,
      headers: {
        Authorization: 'token ' + TOKEN,
        'User-Agent': 'rollback-tool',
        'Content-Type': 'application/json',
        ...(data ? {'Content-Length': Buffer.byteLength(data)} : {})
      }
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function getFileSha(filePath) {
  const d = await apiReq('GET', filePath);
  return d.sha;
}

async function getFileContentBySha(sha) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: 'api.github.com',
      path: '/repos/' + REPO + '/git/blobs/' + sha,
      headers: { Authorization: 'token ' + TOKEN, 'User-Agent': 'rollback', Accept: 'application/vnd.github.v3+json' }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d).content); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

async function revertFile(filePath, sha, label) {
  console.log('  Reverting', filePath, 'to', label, '('+sha.slice(0,8)+')...');
  const content = await getFileContentBySha(sha);
  const currentSha = await getFileSha(filePath);
  const result = await apiReq('PUT', filePath, {
    message: 'ROLLBACK: revert '+filePath+' to '+label,
    content: content.replace(/\n/g, ''),
    sha: currentSha
  });
  if (result.content) console.log('    OK:', result.content.size, 'bytes');
  else console.log('    ERROR:', result.message);
}

const [,, version, target] = process.argv;

if (!version) {
  console.log('\nAvailable snapshots:');
  Object.keys(snapshots).sort().forEach(v => {
    const s = snapshots[v];
    console.log(' ', v, '-', s._meta?.date||'', s._meta?.note||'');
  });
  console.log('\nUsage: node scripts/rollback.js <version> [file|all]\n');
  process.exit(0);
}

const snap = snapshots[version];
if (!snap) { console.error('Unknown version:', version, '\nKnown:', Object.keys(snapshots).join(', ')); process.exit(1); }

if (!target) {
  console.log('\nSnapshot', version, '('+snap._meta?.date+'):');
  Object.entries(snap).filter(([k]) => !k.startsWith('_')).forEach(([f,v]) => {
    console.log(' ', f, v.sha.slice(0,8), v.size+'B');
  });
  console.log('\nTo revert: node scripts/rollback.js '+version+' <file>  OR  all\n');
  process.exit(0);
}

async function main() {
  if (target === 'all') {
    console.log('\nRolling back ALL files to', version, '...');
    for (const [filePath, info] of Object.entries(snap).filter(([k]) => !k.startsWith('_'))) {
      await revertFile(filePath, info.sha, version);
    }
    console.log('\nDone. Go to Fly.io and deploy to go live.\n');
  } else {
    const info = snap[target];
    if (!info) { console.error('File not in snapshot:', target, '\nAvailable:', Object.keys(snap).filter(k=>!k.startsWith('_')).join(', ')); process.exit(1); }
    await revertFile(target, info.sha, version);
    console.log('\nDone. Go to Fly.io and deploy to go live.\n');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
