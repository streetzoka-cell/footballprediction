'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_KNOWLEDGE_DIR = path.join(ROOT, 'public_data', 'knowledge', 'football');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function wipeDirectory(dir) {
    if (!fs.existsSync(dir)) return;
    console.log(`   ↳ Wiping old artifacts from: ${path.relative(PUBLIC_KNOWLEDGE_DIR, dir)}`);
    fs.rmSync(dir, { recursive: true, force: true });
    ensureDir(dir);
}

function copyJson(src, dest) {
    if (!fs.existsSync(src)) return;
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
}

function copyDirectory(srcDir, destDir) {
    if (!fs.existsSync(srcDir)) {
        console.warn(`   ⚠️ Source directory not found, skipping: ${srcDir}`);
        return;
    }
    ensureDir(destDir);
    const files = fs.readdirSync(srcDir);
    let count = 0;
    for (const file of files) {
        if (file.endsWith('.json')) {
            copyJson(path.join(srcDir, file), path.join(destDir, file));
            count++;
        }
    }
    console.log(`   ↳ Published ${count} files to: ${path.relative(PUBLIC_KNOWLEDGE_DIR, destDir)}`);
}

function run() {
    console.log('============================================================');
    console.log(' ZOKASCORE V2 — STEP 13: PUBLISH KNOWLEDGE TO PUBLIC_DATA');
    console.log('============================================================\n');

    // 1. Publish Team Intelligence
    console.log('[1/4] Publishing Team Intelligence...');
    const teamDest = path.join(PUBLIC_KNOWLEDGE_DIR, 'history', 'entities', 'team_intelligence');
    wipeDirectory(teamDest);
    copyDirectory(path.join(DATA_DIR, 'intelligence', 'teams'), teamDest);

    // 2. Publish H2H Intelligence
    console.log('\n[2/4] Publishing H2H Intelligence...');
    const h2hDest = path.join(PUBLIC_KNOWLEDGE_DIR, 'history', 'entities', 'h2h');
    wipeDirectory(h2hDest);
    copyDirectory(path.join(DATA_DIR, 'intelligence', 'h2h'), h2hDest);

    // 3. Publish Seasonal Intelligence
    console.log('\n[3/4] Publishing Seasonal Intelligence...');
    const seasonDest = path.join(PUBLIC_KNOWLEDGE_DIR, 'history', 'seasons');
    wipeDirectory(seasonDest);
    copyDirectory(path.join(DATA_DIR, 'intelligence', 'seasonal'), seasonDest);

    // 4. Publish Knowledge Indexes
    console.log('\n[4/4] Publishing Knowledge Indexes...');
    const indexDest = path.join(PUBLIC_KNOWLEDGE_DIR, 'indexes');
    wipeDirectory(indexDest);
    copyDirectory(path.join(DATA_DIR, 'intelligence', 'indexes'), indexDest);

    // Also publish teams-index.json to public indexes
    copyJson(
        path.join(DATA_DIR, 'indexes', 'teams-index.json'),
        path.join(PUBLIC_KNOWLEDGE_DIR, 'indexes', 'teams-index.json')
    );

    console.log('\n============================================================');
    console.log(' STEP 13 COMPLETE');
    console.log('============================================================');
    console.log('🔒 Internal data/ folder remains protected.');
    console.log('✅ Public JSONs are clean and ready for API routes.\n');
}

run();