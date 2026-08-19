'use strict';

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'source', 'ZOKASCORE_FINAL');
const INDEX_DIR = path.join(ROOT, 'data', 'indexes');
const EVENTS_DIR = path.join(ROOT, 'public_data', 'knowledge', 'football', 'history', 'events');

const EVENTS_FILE = path.join(DATA_DIR, 'ZOKASCORE_EVENTS.csv');
const CROSSWALK_FILE = path.join(INDEX_DIR, 'match-id-crosswalk.json');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function run() {
    console.log('============================================================');
    console.log(' ZOKASCORE V2 — STEP 15: PUBLISH MATCH EVENTS & SCORERS');
    console.log('============================================================\n');

    if (!fs.existsSync(EVENTS_FILE)) {
        console.error('❌ ZOKASCORE_EVENTS.csv not found!');
        process.exit(1);
    }

    ensureDir(EVENTS_DIR);
    
    // Clear old events
    console.log('[1/3] Clearing old events...');
    fs.rmSync(EVENTS_DIR, { recursive: true, force: true });
    ensureDir(EVENTS_DIR);

    console.log('[2/3] Loading match ID crosswalk...');
    const crosswalk = JSON.parse(fs.readFileSync(CROSSWALK_FILE, 'utf8'));

    console.log('[3/3] Processing events and writing match files...');
    
    const eventMap = new Map();
    let totalEvents = 0;
    let scorersCount = 0;

    await new Promise((resolve, reject) => {
        fs.createReadStream(EVENTS_FILE)
            .pipe(csv())
            .on('data', row => {
                const secondaryId = String(row.zokascore_match_id ?? '').trim();
                if (!secondaryId) return;

                const canonicalId = crosswalk[secondaryId] || secondaryId;
                
                if (!eventMap.has(canonicalId)) {
                    eventMap.set(canonicalId, []);
                }

                const event = {
                    event_type: String(row.event_type || '').trim(),
                    minute: Number(row.minute) || 0,
                    extra_minute: Number(row.extra_minute) || 0,
                    player_name: String(row.player_name || '').trim(),
                    team_name: String(row.team_name || '').trim(),
                    assist: String(row.assist || '').trim(),
                    description: String(row.description || '').trim(),
                    score: String(row.score || '').trim(),
                    penalty: String(row.penalty || '').trim() === 'true',
                    own_goal: String(row.own_goal || '').trim() === 'true'
                };

                eventMap.get(canonicalId).push(event);
                totalEvents++;

                if (event.event_type === 'Goal' && !event.own_goal) {
                    scorersCount++;
                }
            })
            .on('end', resolve)
            .on('error', reject);
    });

    let filesWritten = 0;
    for (const [matchId, events] of eventMap.entries()) {
        // Sort by minute
        events.sort((a, b) => (a.minute + a.extra_minute) - (b.minute + b.extra_minute));
        
        const filePath = path.join(EVENTS_DIR, `${matchId}.json`);
        fs.writeFileSync(filePath, JSON.stringify({
            match_id: matchId,
            total_events: events.length,
            events: events
        }, null, 2), 'utf8');
        filesWritten++;
    }

    console.log(`   ↳ Total events processed: ${totalEvents.toLocaleString()}`);
    console.log(`   ↳ Total goals processed: ${scorersCount.toLocaleString()}`);
    console.log(`   ↳ Match event files written: ${filesWritten.toLocaleString()}\n`);

    console.log('============================================================');
    console.log(' STEP 15 COMPLETE');
    console.log('============================================================');
    console.log('✅ Match events & scorers published to public_data.\n');
}

run().catch(err => {
    console.error('\n❌ STEP 15 FAILED');
    console.error(err);
    process.exit(1);
});