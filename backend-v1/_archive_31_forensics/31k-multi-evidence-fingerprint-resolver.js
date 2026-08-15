// node pipeline/31k-multi-evidence-fingerprint-resolver.js

'use strict';
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');
const AUDIT_DIR = path.join(ROOT, 'data_audit', 'v2_integrity');
const INPUT_FILE = path.join(AUDIT_DIR, 'unresolved_orphan_deep_evidence.json');
const OUTPUT_FILE = path.join(AUDIT_DIR, 'orphan_fingerprint_resolver_report.json');
const ENTITY_DIR = path.join(ROOT, 'data_audit', 'entity_resolution');
const CANONICAL_FILE = path.join(ENTITY_DIR, 'canonical_teams.json');
const SOURCE_DIR = path.join(ROOT, 'data', 'source');
const APPEARANCES_CSV = path.join(SOURCE_DIR, 'appearances.csv');
const EVENTS_CSV = path.join(SOURCE_DIR, 'game_events.csv');

const loadJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const normalize = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function readCsv(file, onRow) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(file)) return reject(new Error(`File not found: ${file}`));
    let count = 0;
    fs.createReadStream(file, { encoding: 'utf8' })
      .pipe(csv())
      .on('data', row => { count++; try { onRow(row); } catch {} })
      .on('end', () => resolve(count))
      .on('error', reject);
  });
}

async function main() {
  const deepEvidence = loadJson(INPUT_FILE);
  const canonical = loadJson(CANONICAL_FILE) || [];
  if (!deepEvidence) throw new Error('Missing 31h deep evidence report.');

  console.log('🔍 Pipeline 31k — Multi-Evidence Orphan Fingerprint Resolver');
  console.log('============================================================\n');

  const canonicalSet = new Set(canonical.map(c => String(c.canonical_id)));
  const primaryLookup = new Map();
  for (const c of canonical) primaryLookup.set(normalize(c.primary_name), String(c.canonical_id));

  // 1. Build Game Context Map (Array-based to handle multiple orphans per game)
  const gameContext = new Map();
  for (const ev of deepEvidence.evidence) {
    for (const m of (ev.rawMatches || [])) {
      if (!m.game_id) continue;
      const gid = String(m.game_id);
      if (!gameContext.has(gid)) gameContext.set(gid, []);
      
      gameContext.get(gid).push({
        orphanId: ev.orphanId,
        opponentId: String(m.opponent_club_id || ''),
        season: m.season || '',
        competition: m.competition_id || ''
      });
    }
  }

  // 2. Track Candidate Frequencies
  const orphanCandidates = new Map();

  const addCandidateEvidence = (orphanId, candidateId, type, ctx) => {
    if (!candidateId) return;
    
    if (!orphanCandidates.has(orphanId)) orphanCandidates.set(orphanId, new Map());
    const cands = orphanCandidates.get(orphanId);
    
    if (!cands.has(candidateId)) {
      cands.set(candidateId, {
        candidateId,
        appearances: 0,
        events: 0,
        distinctGames: new Set(),
        seasons: new Set(),
        competitions: new Set()
      });
    }
    
    const c = cands.get(candidateId);
    if (type === 'appearance') c.appearances++;
    if (type === 'event') c.events++;
    c.distinctGames.add(ctx.gameId);
    if (ctx.season) c.seasons.add(ctx.season);
    if (ctx.competition) c.competitions.add(ctx.competition);
  };

  // Helper for strict canonical resolution
  const resolveCanonicalId = (cId, cName) => {
    if (cId && canonicalSet.has(cId)) return cId;
    if (cName) {
      const nameId = primaryLookup.get(normalize(cName));
      if (nameId && canonicalSet.has(nameId)) return nameId;
    }
    return null; // Return null if not strictly canonical
  };

  // 3. Scan Appearances
  console.log('🔎 Scanning appearances.csv (strict canonical validation)...');
  await readCsv(APPEARANCES_CSV, row => {
    const gid = String(row.game_id || '');
    const contexts = gameContext.get(gid);
    if (contexts) {
      for (const ctx of contexts) {
        const cId = String(row.player_club_id || '');
        const cName = String(row.player_club_name || '');
        
        // Exclude opponent ID explicitly
        if (cId && cId !== ctx.opponentId) {
          const resolvedId = resolveCanonicalId(cId, cName);
          if (resolvedId) {
            addCandidateEvidence(ctx.orphanId, resolvedId, 'appearance', { gameId: gid, ...ctx });
          }
        }
      }
    }
  });

  // 4. Scan Events
  console.log('🔎 Scanning game_events.csv (strict canonical validation)...');
  await readCsv(EVENTS_CSV, row => {
    const gid = String(row.game_id || '');
    const contexts = gameContext.get(gid);
    if (contexts) {
      for (const ctx of contexts) {
        const cId = String(row.club_id || '');
        const cName = String(row.club || '');
        
        if (cId && cId !== ctx.opponentId) {
          const resolvedId = resolveCanonicalId(cId, cName);
          if (resolvedId) {
            addCandidateEvidence(ctx.orphanId, resolvedId, 'event', { gameId: gid, ...ctx });
          }
        }
      }
    }
  });

  // 5. Score and Classify
  const report = [];
  const summary = {
    HIGH_CONFIDENCE: 0,
    MEDIUM_CONFIDENCE: 0,
    LOW_CONFIDENCE: 0,
    CONFLICT: 0,
    UNRESOLVED: 0
  };

  for (const ev of deepEvidence.evidence) {
    const orphanId = ev.orphanId;
    const cands = orphanCandidates.get(orphanId) || new Map();
    
    let classification = 'UNRESOLVED';
    let confidence = 0.0;
    let bestCandidate = null;
    let reasons = [];

    // Convert map to array and sort by distinct games desc, then appearances desc
    const sortedCands = [...cands.values()].map(c => ({
      candidateId: c.candidateId,
      appearances: c.appearances,
      events: c.events,
      distinctGames: [...c.distinctGames], // Expose raw game IDs
      distinctGamesCount: c.distinctGames.size,
      seasons: [...c.seasons],
      competitions: [...c.competitions]
    })).sort((a, b) => b.distinctGamesCount - a.distinctGamesCount || b.appearances - a.appearances);

    if (sortedCands.length > 0) {
      bestCandidate = sortedCands[0];
      const totalOcc = bestCandidate.appearances + bestCandidate.events;
      
      // Strict Thresholds based on distinct games
      if (bestCandidate.distinctGamesCount >= 3) {
        classification = 'HIGH_CONFIDENCE';
        confidence = 0.95;
        reasons.push(`Strong recurring evidence: ${totalOcc} occurrences across ${bestCandidate.distinctGamesCount} distinct games.`);
      } else if (bestCandidate.distinctGamesCount === 2) {
        classification = 'MEDIUM_CONFIDENCE';
        confidence = 0.65;
        reasons.push(`Medium recurring evidence: ${totalOcc} occurrences across ${bestCandidate.distinctGamesCount} distinct games.`);
      } else if (bestCandidate.distinctGamesCount === 1) {
        classification = 'LOW_CONFIDENCE';
        confidence = 0.30;
        reasons.push(`Weak evidence: ${totalOcc} occurrences in only 1 distinct game.`);
      }
      
      // CONFLICT: If 2nd best candidate is at least 80% as strong
      if (sortedCands.length > 1) {
        const second = sortedCands[1];
        if (second.distinctGamesCount >= 2 && second.distinctGamesCount / bestCandidate.distinctGamesCount >= 0.8) {
          classification = 'CONFLICT';
          confidence = 0.0;
          reasons.push(`Conflict between candidate ${bestCandidate.candidateId} (${bestCandidate.distinctGamesCount} games) and ${second.candidateId} (${second.distinctGamesCount} games).`);
        }
      }
    } else {
      reasons.push('No secondary player/event data found for this orphan\'s matches.');
    }

    summary[classification] = (summary[classification] || 0) + 1;

    report.push({
      orphanId,
      classification,
      confidence,
      candidateCanonicalId: classification === 'CONFLICT' ? null : bestCandidate?.candidateId,
      action: classification === 'HIGH_CONFIDENCE' ? 'CANDIDATE_FOR_MAPPING' : 'HOLD_FOR_REVIEW',
      reasons,
      candidateEvidence: sortedCands.slice(0, 3), // Top 3 candidates with game IDs
      context: ev.aggregated
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    pipeline: '31k',
    summary,
    report
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');

  console.log('\n============================================================');
  console.log(' PIPELINE 31k COMPLETE');
  console.log('============================================================');
  console.log(`HIGH_CONFIDENCE:   ${summary.HIGH_CONFIDENCE} (3+ distinct games)`);
  console.log(`MEDIUM_CONFIDENCE: ${summary.MEDIUM_CONFIDENCE} (2 distinct games)`);
  console.log(`LOW_CONFIDENCE:    ${summary.LOW_CONFIDENCE} (1 distinct game)`);
  console.log(`CONFLICT:          ${summary.CONFLICT} (Multiple strong candidates)`);
  console.log(`UNRESOLVED:        ${summary.UNRESOLVED} (No canonical secondary evidence)`);
  console.log(`\n📄 ${OUTPUT_FILE}`);
  console.log('🛡️ READ-ONLY: no source/entity files modified.');
}

main().catch(e => {
  console.error('❌ Pipeline 31k failed:', e.stack || e.message);
  process.exit(1);
});