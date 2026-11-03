'use strict';
/* Build a portable Windows x64 desktop app without electron-builder / Wine.
 *
 * It downloads the official Electron Windows runtime zip, drops this shell
 * (app.json + package.json + main.cjs) and the web app (repo root files)
 * into resources/app/, renames electron.exe to StarRace.exe,
 * and packs the folder as StarRace-Windows-x64.zip next to the repo root.
 * App name, zip name and port are read from app.json (not hardcoded here).
 *
 * Usage:  node build-windows.cjs            (from the desktop/ folder)
 * Needs:  Node.js, plus `unzip` and `zip` (Linux/macOS) or PowerShell (Windows).
 */
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const DESKTOP_DIR = __dirname;
const REPO_ROOT = path.resolve(DESKTOP_DIR, '..');
const BUILD_DIR = path.join(DESKTOP_DIR, 'build');
const CONFIG = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, 'app.json'), 'utf8'));
const APP_NAME = CONFIG.zipName.replace(/-Windows-x64\.zip$/, '');
const FALLBACK_ELECTRON_VERSION = '33.2.1';

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(download(res.headers.location, dest));
      }
      if (res.statusCode !== 200) return reject(new Error('Download failed: HTTP ' + res.statusCode + ' ' + url));
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    }).on('error', reject);
  });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'starrace-desktop-build' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchJson(res.headers.location));
      }
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'desktop-build' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchText(res.headers.location));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('Checksum manifest download failed: HTTP ' + res.statusCode));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve(body));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function verifyElectronZip(zipPath, version, zipName) {
  const manifest = await fetchText(`https://github.com/electron/electron/releases/download/v${version}/SHASUMS256.txt`);
  const entry = manifest.split(/\r?\n/).find(line => { const fields = line.trim().split(/\s+/); return fields.length >= 2 && fields[fields.length - 1].replace(/^\\*/, '') === zipName; });
  if (!entry) throw new Error('Official SHA-256 entry not found for ' + zipName);
  const expected = entry.trim().split(/\s+/)[0].toLowerCase();
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(zipPath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  const actual = hash.digest('hex');
  if (actual !== expected) throw new Error('Electron ZIP SHA-256 mismatch');
}

function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    execFileSync('powershell', ['-NoProfile', '-Command',
      `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`], { stdio: 'inherit' });
  } else {
    execFileSync('unzip', ['-o', '-q', zipPath, '-d', destDir], { stdio: 'inherit' });
  }
}

function zipFolder(folder, zipPath) {
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
  if (process.platform === 'win32') {
    execFileSync('powershell', ['-NoProfile', '-Command',
      `Compress-Archive -Path '${folder}\\*' -DestinationPath '${zipPath}' -Force`], { stdio: 'inherit' });
  } else {
    execFileSync('zip', ['-r', '-q', zipPath, '.'], { cwd: folder, stdio: 'inherit' });
  }
}

function copyInto(src, destDir) {
  const dest = path.join(destDir, path.basename(src));
  fs.cpSync(src, dest, { recursive: true });
  return dest;
}

(async () => {
  const desktopPackage = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, 'package.json'), 'utf8'));
  const version = desktopPackage.devDependencies && desktopPackage.devDependencies.electron;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('desktop/package.json must pin Electron to an exact x.y.z version');
  }
  console.log('Pinned Electron version:', version);

  fs.mkdirSync(BUILD_DIR, { recursive: true });
  const zipName = `electron-v${version}-win32-x64.zip`;
  const zipPath = path.join(BUILD_DIR, zipName);
  if (!fs.existsSync(zipPath)) {
    console.log('Downloading', zipName, '...');
    await download(`https://github.com/electron/electron/releases/download/v${version}/${zipName}`, zipPath);
  }
  await verifyElectronZip(zipPath, version, zipName);
  console.log('Electron archive SHA-256 verified.');

  const stage = path.join(BUILD_DIR, APP_NAME);
  fs.rmSync(stage, { recursive: true, force: true });
  extractZip(zipPath, stage);

  const defaultApp = path.join(stage, 'resources', 'default_app.asar');
  if (fs.existsSync(defaultApp)) fs.rmSync(defaultApp);

  const appDir = path.join(stage, 'resources', 'app');
  const webDir = path.join(appDir, 'web');
  fs.mkdirSync(webDir, { recursive: true });
  fs.copyFileSync(path.join(DESKTOP_DIR, 'app.json'), path.join(appDir, 'app.json'));
  fs.copyFileSync(path.join(DESKTOP_DIR, 'package.json'), path.join(appDir, 'package.json'));
  fs.copyFileSync(path.join(DESKTOP_DIR, 'main.cjs'), path.join(appDir, 'main.cjs'));
  for (const entry of ['index.html', 'assets', 'src', 'docs', 'README.md', 'manifest.webmanifest', 'service-worker.js']) {
    const src = path.join(REPO_ROOT, entry);
    if (fs.existsSync(src)) copyInto(src, webDir);
  }

  const exeSrc = path.join(stage, 'electron.exe');
  const exeDest = path.join(stage, APP_NAME + '.exe');
  if (fs.existsSync(exeSrc)) fs.renameSync(exeSrc, exeDest);

  const outZip = path.join(REPO_ROOT, CONFIG.zipName);
  const packDir = path.join(BUILD_DIR, 'pack');
  fs.rmSync(packDir, { recursive: true, force: true });
  fs.mkdirSync(packDir, { recursive: true });
  fs.cpSync(stage, path.join(packDir, APP_NAME), { recursive: true });
  zipFolder(path.join(packDir, APP_NAME), outZip);
  console.log('Done:', outZip);
})().catch(err => { console.error(err); process.exit(1); });
