'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AUDIT_DIR = path.join(ROOT, 'data_audit', 'v2_integrity');
const INPUT_FILE = path.join(AUDIT_DIR, 'unresolved_orphan_deep_evidence.json');
const OUTPUT_FILE = path.join(AUDIT_DIR, 'orphan_candidate_resolver_report.json');
const ENTITY_DIR = path.join(ROOT, 'data_audit', 'entity_resolution');
const CANONICAL_FILE = path.join(ENTITY_DIR, 'canonical_teams.json');
const ALIAS_FILE = path.join(ENTITY_DIR, 'team_alias_map.json');

const loadJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const normalize = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function buildEntityIndexes(canonical, aliasMap) {
  const primary = new Map(), historical = new Map(), aliases = new Map();
  for (const t of canonical) {
    if (!t?.canonical_id) continue;
    const id = String(t.canonical_id);
    if (t.primary_name) primary.set(normalize(t.primary_name), id);
    for (const n of (t.historical_names || [])) historical.set(normalize(n), id);
    for (const a of (t.aliases || [])) { const k = normalize(a); if (!primary.has(k)) aliases.set(k, id); }
  }
  for (const [n, id] of Object.entries(aliasMap || {})) aliases.set(normalize(n), String(id));
  return { primary, aliases, historical };
}

function resolveName(name, indexes) {
  const key = normalize(name);
  if (!key) return { id: null, type: null };
  if (indexes.primary.has(key)) return { id: indexes.primary.get(key), type: 'EXACT_PRIMARY_MATCH' };
  if (indexes.aliases.has(key)) return { id: indexes.aliases.get(key), type: 'ALIAS_MATCH' };
  if (indexes.historical.has(key)) return { id: indexes.historical.get(key), type: 'HISTORICAL_NAME_MATCH' };
  return { id: null, type: null };
}

function main() {
  if (!fs.existsSync(INPUT_FILE)) throw new Error(`Input report not found: ${INPUT_FILE}`);

  const deepEvidence = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  const canonical = loadJson(CANONICAL_FILE) || [];
  const aliasMap = loadJson(ALIAS_FILE) || {};
  const indexes = buildEntityIndexes(canonical, aliasMap);

  console.log('🔍 Pipeline 31i — Historical Orphan Candidate Resolver');
  console.log('============================================================\n');
  console.log(`Evaluating ${deepEvidence.totalOrphans} numeric orphans...\n`);

  const report = [];
  const summary = {
    HIGH_CONFIDENCE: 0,
    MEDIUM_CONFIDENCE: 0,
    NO_CANDIDATE: 0,
    CONFLICT: 0
  };

  for (const ev of deepEvidence.evidence) {
    const names = ev.aggregated.orphanNames || [];
    const matchedIds = new Set();
    const reasons = [];

    for (const name of names) {
      const res = resolveName(name, indexes);
      if (res.id) {
        matchedIds.add(res.id);
        reasons.push(`Name "${name}" matched via ${res.type} -> Canonical ID ${res.id}`);
      }
    }

    let classification = 'NO_CANDIDATE';
    let confidence = 0.0;
    let candidateId = null;
    let action = 'HOLD_FOR_REVIEW';

    if (matchedIds.size === 1) {
      candidateId = [...matchedIds][0];
      classification = 'HIGH_CONFIDENCE';
      confidence = 0.95;
      action = 'CANDIDATE_FOR_MAPPING';
    } else if (matchedIds.size > 1) {
      classification = 'CONFLICT';
      confidence = 0.0;
      action = 'MANUAL_REVIEW_REQUIRED';
      reasons.push(`Evidence points to multiple canonical IDs: ${[...matchedIds].join(', ')}`);
    } else if (names.length > 0) {
      // We have names, but they don't match anything in the DB
      classification = 'MEDIUM_CONFIDENCE';
      confidence = 0.40;
      action = 'CANDIDATE_FOR_NEW_ENTITY';
      reasons.push(`Observed names (${names.join(', ')}) not found in canonical database. May require new entity creation.`);
    } else {
      // No names, no matches
      classification = 'NO_CANDIDATE';
      confidence = 0.0;
      action = 'HOLD_FOR_REVIEW';
      reasons.push('No historical names found in match evidence.');
    }

    summary[classification] = (summary[classification] || 0) + 1;

    report.push({
      orphanId: ev.orphanId,
      observedNames: names,
      classification,
      confidence,
      candidateCanonicalId: candidateId,
      reasons,
      action,
      // Keep a tiny bit of context for the final review
      context: {
        opponents: ev.aggregated.opponents.slice(0, 3),
        seasons: ev.aggregated.seasons.slice(0, 3),
        competitions: ev.aggregated.competitions.slice(0, 2)
      }
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    pipeline: '31i',
    summary,
    candidates: report
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');

  console.log('============================================================');
  console.log(' PIPELINE 31i COMPLETE');
  console.log('============================================================');
  console.log(`HIGH_CONFIDENCE:  ${summary.HIGH_CONFIDENCE} (Safely map to existing)`);
  console.log(`MEDIUM_CONFIDENCE:${summary.MEDIUM_CONFIDENCE} (Genuinely new clubs)`);
  console.log(`NO_CANDIDATE:     ${summary.NO_CANDIDATE} (Singleton ghosts)`);
  console.log(`CONFLICT:         ${summary.CONFLICT} (Requires manual review)`);
  console.log(`\n📄 ${OUTPUT_FILE}`);
  console.log('🛡️ READ-ONLY: no source/entity files modified.');
}

try {
  main();
} catch (e) {
  console.error('❌ Pipeline 31i failed:', e.stack || e.message);
  process.exit(1);
}