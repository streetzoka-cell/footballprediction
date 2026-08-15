'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AUDIT_DIR = path.join(ROOT, 'data_audit', 'v2_integrity');
const INPUT_FILE = path.join(AUDIT_DIR, 'orphan_team_forensics_report.json');
const OUTPUT_FILE = path.join(AUDIT_DIR, 'orphan_team_evidence_classification.json');
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
  if (!key) return null;
  if (indexes.primary.has(key)) return indexes.primary.get(key);
  if (indexes.aliases.has(key)) return indexes.aliases.get(key);
  if (indexes.historical.has(key)) return indexes.historical.get(key);
  return null;
}

function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ Input report not found: ${INPUT_FILE}`);
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  const findings = report.findings || [];

  const canonical = loadJson(CANONICAL_FILE) || [];
  const aliasMap = loadJson(ALIAS_FILE) || {};
  const indexes = buildEntityIndexes(canonical, aliasMap);

  console.log('🔍 Pipeline 31f — Orphan Evidence Classification\n============================================================\n');
  console.log(`Total orphans to classify: ${findings.length}\n`);

  const classifications = [];
  const summary = {
    SAFE_MAP: 0,
    STRONG_NAME_VARIANT: 0,
    SINGLETON_NAME: 0,
    UNRESOLVED_NAME: 0,
    OPPONENT_FINGERPRINT: 0,
    SINGLETON_UNKNOWN: 0,
    CONFLICT: 0
  };

  for (const f of findings) {
    const games = f.sourceEvidence?.games || { occurrences: 0, homeNames: [], awayNames: [] };
    const clubs = f.sourceEvidence?.clubs || { found: false };
    
    const occurrences = games.occurrences || 0;
    const rawNames = [...(games.homeNames || []), ...(games.awayNames || [])];
    const namedOccurrences = rawNames.length;
    
    const secondarySources = ['appearances', 'game_events', 'players', 'player_valuations', 'ranking', 'results', 'matches', 'goalscorers', 'shootouts'];
    const secondarySourceOccurrences = secondarySources.reduce((sum, src) => sum + (f.sourceEvidence?.[src]?.occurrences || 0), 0);

    // Resolve all observed names to canonical IDs
    const matchedIds = new Set();
    for (const name of rawNames) {
      const cId = resolveName(name, indexes);
      if (cId) matchedIds.add(cId);
    }

    let classification = 'SINGLETON_UNKNOWN';
    let confidence = 0.0;
    let action = 'HOLD_FOR_REVIEW';
    let evidence = {
      gameOccurrences: occurrences,
      namedOccurrences,
      clubMasterOccurrences: clubs.found ? clubs.occurrences : 0,
      secondarySourceOccurrences,
      resolvedCanonicalIds: [...matchedIds]
    };

    // 1. Already resolved perfectly by 31e
    if (f.classification === 'EXACT_MATCH' || f.classification === 'ALIAS_MATCH' || f.classification === 'HISTORICAL_NAME_MATCH') {
      classification = 'SAFE_MAP';
      confidence = 1.0;
      action = 'APPLY_MAPPING';
    } 
    // 2. Has names, but unresolved by 31e
    else if (namedOccurrences > 0) {
      if (matchedIds.size > 1) {
        classification = 'CONFLICT';
        confidence = 0.0;
        action = 'MANUAL_REVIEW_REQUIRED';
      } else if (matchedIds.size === 1) {
        // Multiple name variants, but ALL resolve to the exact same canonical entity!
        classification = 'STRONG_NAME_VARIANT';
        confidence = 0.95;
        action = 'CANDIDATE_FOR_MAPPING';
      } else {
        // Has names, but none could be resolved to our canonical database
        classification = 'UNRESOLVED_NAME';
        confidence = 0.30;
        action = 'HOLD_FOR_REVIEW';
      }
    } 
    // 3. No names, but has multiple match occurrences
    else if (occurrences > 1) {
      classification = 'OPPONENT_FINGERPRINT';
      confidence = 0.20;
      action = 'HOLD_FOR_HISTORICAL_REVIEW';
    } 
    // 4. Total ghosts (1 occurrence, no name, no secondary)
    else {
      classification = 'SINGLETON_UNKNOWN';
      confidence = 0.0;
      action = 'HOLD_FOR_REVIEW';
    }

    summary[classification] = (summary[classification] || 0) + 1;

    classifications.push({
      orphanId: f.orphanId,
      type: f.type,
      classification,
      confidence,
      evidence,
      action
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    pipeline: '31f',
    summary,
    classifications
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');

  console.log('============================================================\n PIPELINE 31f COMPLETE\n============================================================');
  console.log(`SAFE_MAP:               ${summary.SAFE_MAP}`);
  console.log(`STRONG_NAME_VARIANT:    ${summary.STRONG_NAME_VARIANT}`);
  console.log(`SINGLETON_NAME:         ${summary.SINGLETON_NAME}`);
  console.log(`UNRESOLVED_NAME:        ${summary.UNRESOLVED_NAME}`);
  console.log(`OPPONENT_FINGERPRINT:   ${summary.OPPONENT_FINGERPRINT}`);
  console.log(`SINGLETON_UNKNOWN:      ${summary.SINGLETON_UNKNOWN}`);
  console.log(`CONFLICT:               ${summary.CONFLICT}`);
  console.log(`\n📄 ${OUTPUT_FILE}`);
  console.log('🛡️ READ-ONLY: no source/entity files modified.');
}

try {
  main();
} catch (e) {
  console.error('❌ Pipeline 31f failed:', e.stack || e.message);
  process.exit(1);
}