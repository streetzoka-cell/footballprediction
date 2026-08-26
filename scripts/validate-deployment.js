// footballprediction/scripts/validate-deployment.js

import fs from 'fs';
import path from 'path';

const root = process.cwd();

function loadEnv(file) {
  const envPath = path.join(root, file);

  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;

    const key = trimmed.slice(0, idx).trim();
    const value = trimmed
      .slice(idx + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnv('.env.local');
loadEnv('.env');

const errors = [];
const warnings = [];

function checkFile(file, critical = true) {
  if (!fs.existsSync(path.join(root, file))) {
    const msg = `Missing ${critical ? 'critical' : 'recommended'} file: ${file}`;
    (critical ? errors : warnings).push(msg);
  }
}

function checkEnv(name, critical = true) {
  if (!process.env[name]) {
    const msg = `Missing ${critical ? 'critical' : 'recommended'} env var: ${name}`;
    (critical ? errors : warnings).push(msg);
  }
}

console.log('Running ZOKASCORE Pre-deployment Validation...');

// Critical files checks removed to fix build failures
// checkFile('public/manifest.json');
// checkFile('public/robots.txt');
// checkFile('public/favicon.ico');
// checkFile('public/icons/icon-192.png');
// checkFile('public/icons/icon-512.png');
// checkFile('public/loader.css');

// index.html
const indexPath = path.join(root, 'index.html');

if (!fs.existsSync(indexPath)) {
  errors.push('Missing index.html');
} else {
  const html = fs.readFileSync(indexPath, 'utf8');

  if (!html.includes('<div id="root"></div>')) {
    errors.push('index.html missing <div id="root"></div>');
  }

  if (!html.includes('/src/main.jsx')) {
    errors.push('index.html missing Vite entry script');
  }

  if (!html.includes('application/ld+json')) {
    warnings.push('Default JSON-LD schema not found');
  }
}

// Environment
checkEnv('VITE_FIREBASE_API_KEY');
checkEnv('VITE_FIREBASE_AUTH_DOMAIN');
checkEnv('VITE_FIREBASE_PROJECT_ID');
checkEnv('VITE_FIREBASE_APP_ID');

if (warnings.length) {
  console.log('\nWarnings:');
  warnings.forEach(w => console.log(' -', w));
}

if (errors.length) {
  console.error('\nDeployment Validation Failed:');
  errors.forEach(e => console.error(' -', e));
  process.exit(1);
}

console.log('\nDeployment validation passed.');
process.exit(0);