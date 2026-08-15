'use strict';
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');
const AUDIT_DIR = path.join(ROOT, 'data_audit', 'v2_integrity');
const REPORT_FILE = path.join(AUDIT_DIR, 'v2_integrity_report.json');
const OUTPUT_FILE = path.join(AUDIT_DIR, 'unresolved_orphan_deep_evidence.json');
const GAMES_CSV = path.join(ROOT, 'data', 'source', 'games.csv');

const uniqueSorted = (v) => [...new Set(v.filter(Boolean).map(x => String(x).trim()))].sort();

function readCsv(file, onRow) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(file)) return reject(new Error(`File not found: ${file}`));
    let count = 0;
    fs.createReadStream(file, { encoding: 'utf8' })
      .pipe(csv())
      .on('data', row => {
        count++;
        try { onRow(row); } catch (err) { console.warn('Row parse error:', err.message); }
      })
      .on('end', () => resolve(count))
      .on('error', (err) => reject(err)); // Fail loudly
  });
}

async function main() {
  if (!fs.existsSync(REPORT_FILE)) {
    throw new Error(`❌ Integrity report not found: ${REPORT_FILE}`);
  }

  const report = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'));
  if (!report?.informational_findings?.orphan_team_ids) {
    throw new Error('orphan_team_ids not found in v2_integrity_report.json');
  }

  // We only care about the 105 numeric orphans
  const orphans = report.informational_findings.orphan_team_ids.map(String);
  const numeric = orphans.filter(id => /^\d+$/.test(id));
  const orphanSet = new Set(numeric);

  console.log('🔍 Pipeline 31h — Deep Unresolved Evidence Extraction');
  console.log('============================================================\n');
  console.log(`Target numeric orphans: ${numeric.length}`);
  console.log(`Source: ${path.basename(GAMES_CSV)}\n`);

  const evidence = new Map();
  for (const id of numeric) {
    evidence.set(id, {
      orphanId: id,
      matchCount: 0,
      rawMatches: [],
      aggregated: {
        orphanNames: new Set(),
        opponents: new Set(),
        seasons: new Set(),
        competitions: new Set(),
        stadiums: new Set(),
        managers: new Set(),
        formations: new Set(),
        sampleUrls: new Set()
      }
    });
  }

  console.log('🔎 Scanning games.csv for forensic evidence...');
  await readCsv(GAMES_CSV, row => {
    const homeId = String(row.home_club_id || '');
    const awayId = String(row.away_club_id || '');

    const processMatch = (orphanId, side) => {
      if (orphanSet.has(orphanId)) {
        const e = evidence.get(orphanId);
        e.matchCount++;

        const oppSide = side === 'home' ? 'away' : 'home';
        const orphanName = row[`${side}_club_name`] || '';
        const oppId = row[`${oppSide}_club_id`] || '';
        const oppName = row[`${oppSide}_club_name`] || '';
        const orphanScore = row[`${side}_club_goals`] || '';
        const oppScore = row[`${oppSide}_club_goals`] || '';

        // Aggregate data
        if (orphanName) e.aggregated.orphanNames.add(orphanName);
        if (oppId || oppName) e.aggregated.opponents.add(`${oppId} (${oppName || 'Unnamed'})`);
        if (row.season) e.aggregated.seasons.add(row.season);
        if (row.competition_id) e.aggregated.competitions.add(row.competition_id);
        if (row.stadium) e.aggregated.stadiums.add(row.stadium);
        if (row[`${side}_club_manager_name`]) e.aggregated.managers.add(row[`${side}_club_manager_name`]);
        if (row[`${side}_club_formation`] && !row[`${side}_club_formation`].includes('Starting Line-up')) e.aggregated.formations.add(row[`${side}_club_formation`]);
        if (row.url && e.aggregated.sampleUrls.size < 3) e.aggregated.sampleUrls.add(row.url);

        // Push raw match record
        e.rawMatches.push({
          game_id: row.game_id || null,
          date: row.date || null,
          competition_id: row.competition_id || null,
          season: row.season || null,
          round: row.round || null,
          orphan_side: side,
          orphan_club_name: orphanName || null,
          opponent_club_id: oppId || null,
          opponent_club_name: oppName || null,
          orphan_score: orphanScore || null,
          opponent_score: oppScore || null,
          stadium: row.stadium || null,
          manager: row[`${side}_club_manager_name`] || null,
          formation: row[`${side}_club_formation`] || null,
          url: row.url || null
        });
      }
    };

    processMatch(homeId, 'home');
    processMatch(awayId, 'away');
  });

  // Serialize Sets to Arrays for JSON output
  const outputEvidence = [...evidence.values()].map(e => ({
    orphanId: e.orphanId,
    matchCount: e.matchCount,
    aggregated: {
      orphanNames: uniqueSorted([...e.aggregated.orphanNames]),
      opponents: uniqueSorted([...e.aggregated.opponents]),
      seasons: uniqueSorted([...e.aggregated.seasons]),
      competitions: uniqueSorted([...e.aggregated.competitions]),
      stadiums: uniqueSorted([...e.aggregated.stadiums]),
      managers: uniqueSorted([...e.aggregated.managers]),
      formations: uniqueSorted([...e.aggregated.formations]),
      sampleUrls: uniqueSorted([...e.aggregated.sampleUrls])
    },
    rawMatches: e.rawMatches
  }));

  const output = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    pipeline: '31h',
    sourceScanned: 'games.csv',
    totalOrphans: outputEvidence.length,
    evidence: outputEvidence
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');

  console.log('\n============================================================');
  console.log(' PIPELINE 31h COMPLETE');
  console.log('============================================================');
  console.log(`Total Orphans Extracted: ${outputEvidence.length}`);
  
  // Print a quick sample to console
  const sample = outputEvidence.find(e => e.aggregated.orphanNames.length > 0);
  if (sample) {
    console.log(`\nSample Evidence (Orphan ${sample.orphanId}):`);
    console.log(`  Names:   ${sample.aggregated.orphanNames.join(', ')}`);
    console.log(`  Opponents: ${sample.aggregated.opponents.slice(0, 3).join(', ')}`);
  } else {
    console.log('\nNo orphan IDs with historical names were found.');
  }

  console.log(`\n📄 ${OUTPUT_FILE}`);
  console.log('🛡️ READ-ONLY: no source/entity files modified.');
}

main().catch(e => {
  console.error('❌ Pipeline 31h failed:', e.stack || e.message);
  process.exit(1);
});