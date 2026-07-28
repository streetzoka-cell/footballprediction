import fs from 'fs';
import path from 'path';

const root = process.cwd();

// ★ FIX: Manually load environment variables for the validation script
const loadEnv = (file) => {
  const envPath = path.join(root, file);
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8').split('\n');
    envConfig.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').replace(/^["']|["']$/g, ''); // Remove quotes
        if (!process.env[key]) process.env[key] = value;
      }
    });
  }
};

loadEnv('.env.local');
loadEnv('.env');

const errors = [];
const warnings = [];

const checkFile = (filePath, isCritical = true) => {
  if (!fs.existsSync(path.join(root, filePath))) {
    const msg = `❌ Missing ${isCritical ? 'critical' : 'recommended'} file: ${filePath}`;
    isCritical ? errors.push(msg) : warnings.push(msg);
  }
};

const checkEnv = (varName, isCritical = true) => {
  if (!process.env[varName]) {
    const msg = `❌ Missing ${isCritical ? 'critical' : 'recommended'} env var: ${varName}`;
    isCritical ? errors.push(msg) : warnings.push(msg);
  }
};

console.log('🔍 Running ZOKASCORE Pre-deployment Validation...');

// 1. Check Critical Public Assets
checkFile('public/manifest.json');
checkFile('public/robots.txt');
checkFile('public/favicon.ico');
checkFile('public/icons/icon-192.png');
checkFile('public/icons/icon-512.png');
checkFile('public/loader.css');

// 2. Check HTML Entry Point
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf-8');
if (!indexHtml.includes('<div id="root"></div>')) errors.push('❌ index.html is missing <div id="root">');
if (!indexHtml.includes('type="module" src="/src/main.jsx"')) errors.push('❌ index.html is missing Vite entry script');
if (!indexHtml.includes('application/ld+json')) warnings.push('⚠️ index.html is missing default JSON-LD schema');

// 3. Check Environment Variables
checkEnv('VITE_FIREBASE_API_KEY');
checkEnv('VITE_FIREBASE_AUTH_DOMAIN');
checkEnv('VITE_FIREBASE_PROJECT_ID');
checkEnv('VITE_FIREBASE_APP_ID');

// Output Results
if (warnings.length > 0) {
  console.log('\n⚠️ Warnings:');
  warnings.forEach(w => console.log(w));
}

if (errors.length > 0) {
  console.error('\n🚨 Deployment Validation Failed!');
  errors.forEach(e => console.error(e));
  process.exit(1); // ★ Fail the build
} else {
  console.log('✅ Deployment validation passed. All critical assets present.');
  process.exit(0);
}