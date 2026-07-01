#!/usr/bin/env node
/**
 * Writes APK build manifest for test-harness or candidate builds.
 * Usage: node scripts/test/write-apk-build-manifest.mjs --type <test-harness|candidate>
 */
import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const TYPE_INDEX = process.argv.indexOf('--type');
const TYPE = TYPE_INDEX >= 0 ? process.argv[TYPE_INDEX + 1] : 'candidate';

if (!['test-harness', 'candidate'].includes(TYPE)) {
  console.error(`Invalid type: ${TYPE}. Use --type test-harness or --type candidate`);
  process.exit(1);
}

// Find APK
const apkDir = resolve(process.cwd(), 'android/app/build/outputs/apk/release');
const apkFiles = execSync(`find "${apkDir}" -name "*.apk" 2>/dev/null || true`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
const apkPath = apkFiles.find(f => f.includes('release')) || apkFiles[0];

if (!apkPath || !existsSync(apkPath)) {
  console.error('APK not found. Build it first with npm run android:apk');
  process.exit(1);
}

// Read metadata from aapt
let versionName = 'unknown';
let versionCode = '0';
let packageName = 'com.wardrobe.outfit';
try {
  const buildTools = execSync('ls -d "$ANDROID_HOME"/build-tools/*/ | tail -1', { encoding: 'utf-8' }).trim();
  const badging = execSync(`"${buildTools}aapt" dump badging "${apkPath}" 2>/dev/null || true`, { encoding: 'utf-8' });
  const matchName = badging.match(/package: name='([^']+)/);
  const matchVer = badging.match(/versionName='([^']+)/);
  const matchCode = badging.match(/versionCode='([^']+)/);
  if (matchName) packageName = matchName[1];
  if (matchVer) versionName = matchVer[1];
  if (matchCode) versionCode = matchCode[1];
} catch { /* use defaults */ }

// SHA256
let apkSha256 = '';
try {
  apkSha256 = execSync(`shasum -a 256 "${apkPath}" | cut -d' ' -f1`, { encoding: 'utf-8' }).trim();
} catch { /* skip */ }

// Current commit
let commit = '';
try {
  commit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
} catch { /* skip */ }

const manifest = {
  type: TYPE,
  commit,
  versionName,
  versionCode,
  apkPath,
  apkSha256,
  builtAt: new Date().toISOString(),
  packageName,
};

const outDir = TYPE === 'test-harness' 
  ? resolve(process.cwd(), 'test-results/apk-test-harness')
  : resolve(process.cwd(), 'test-results/apk-candidate');

execSync(`mkdir -p "${outDir}"`, { shell: true });
writeFileSync(`${outDir}/build-manifest.json`, JSON.stringify(manifest, null, 2), 'utf-8');
console.log(`Build manifest written to ${outDir}/build-manifest.json`);
console.log(JSON.stringify(manifest, null, 2));
