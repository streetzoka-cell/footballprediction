#!/usr/bin/env node

/**
 * ============================================================
 * ZOKASCORE — CONTEXT-AWARE IDENTITY ADJUDICATOR
 * ============================================================
 *
 * Reads dangerous_conflicts.json and enriches them with their
 * exact historical context (Competition, Season).
 *
 * Proposes isolated Canonical Identities (e.g., "Real Madrid Women")
 * instead of merging them with the Senior team.
 *
 * Output:
 *   contextual_adjudication_report.json
 *   approved_candidates.json (Ready to be promoted to production)
 *
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const SCAN_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'identity_scan');
const INPUT_FILE = path.join(SCAN_DIR, 'dangerous_conflicts.json');
const REPORT_FILE = path.join(SCAN_DIR, 'contextual_adjudication_report.json');
const APPROVED_FILE = path.join(SCAN_DIR, 'approved_candidates.json');

if (!fs.existsSync(INPUT_FILE)) {
  console.error('❌ No dangerous_conflicts.json found. Run the scanner first.');
  process.exit(1);
}

const conflicts = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
const report = [];
const approvedCandidates = [];

console.log('[Adjudicator] Enriching conflicts with historical context and isolating identities...');

for (const conflict of conflicts) {
  const context = {
    competitions: new Set(),
    seasons: new Set(),
    sources: []
  };

  // 1. Trace sources to extract Competition and Season
  for (const src of conflict.sources) {
    const parts = src.file.split(path.sep);
    let comp = 'Unknown';
    let season = 'Unknown';
    
    const historyIdx = parts.indexOf('history');
    if (historyIdx !== -1 && parts.length > historyIdx + 4) {
      comp = `${parts[historyIdx + 2]} / ${parts[historyIdx + 3]}`;
      season = parts[historyIdx + 4];
    } else if (parts.includes('fixtures')) {
      comp = 'Live Fixture API';
      season = parts[parts.length - 1].replace('.json', '');
    }

    context.competitions.add(comp);
    context.seasons.add(season);
    context.sources.push({ file: src.file, competition: comp, season: season });
  }

  // 2. Adjudication Rules
  let proposedCanonical = conflict.historicalName;
  let decision = "REJECT"; // Default to reject for boundary conflicts
  let reason = 'Isolated to prevent contamination with Senior team.';

  // RULE A: Scanner Overreach (Formatting differences)
  if (conflict.normalized === 'b 1913 odense') {
    proposedCanonical = 'B1913 Odense';
    decision = 'APPROVE';
    reason = 'SCANNER_OVERREACH: B 1913 Odense and B1913 Odense are the same senior team.';
  } 
  // RULE B: False Positive (Wrong Match)
  else if (conflict.normalized === 'athletic club mg u20') {
    proposedCanonical = null;
    decision = 'REJECT';
    reason = 'WRONG_MATCH: False positive. Athletic Club MG is not Bo\'ness Athletic FC.';
  }
  // RULE C: Women's Teams
  else if (conflict.identityType === 'WOMEN') {
    proposedCanonical = `${conflict.historicalName} Women`;
  } 
  // RULE D: Youth Teams
  else if (conflict.identityType === 'YOUTH') {
    const youthMatch = conflict.discoveredName.match(/U(?:1[0-9]|2[0-3])/i);
    const youthLabel = youthMatch ? youthMatch[0] : 'Youth';
    proposedCanonical = `${conflict.historicalName} ${youthLabel}`;
  } 
  // RULE E: Reserve Teams
  else if (conflict.identityType === 'RESERVE') {
    const resMatch = conflict.discoveredName.match(/\b(B|2|II|III|Am)\b/i);
    const resLabel = resMatch ? resMatch[0] : 'II';
    proposedCanonical = `${conflict.historicalName} ${resLabel}`;
  }

  // 3. Build the Rich Adjudication Object
  const adjudication = {
    discoveredName: conflict.discoveredName,
    providerIds: conflict.providerIds,
    identityType: conflict.identityType,
    historicalName: conflict.historicalName,
    proposed_canonical: proposedCanonical,
    decision: decision,
    adjudication_reason: reason,
    historical_context: {
      appearances: conflict.appearances,
      competitions: [...context.competitions],
      seasons: [...context.seasons],
      sources: context.sources
    }
  };

  report.push(adjudication);

  // If approved, add to the production candidates list
  if (decision === 'APPROVE' && proposedCanonical) {
    approvedCandidates.push({
      liveName: conflict.discoveredName,
      canonicalName: proposedCanonical,
      providerIds: conflict.providerIds
    });
  }
}

// Save the rich report
fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
fs.writeFileSync(APPROVED_FILE, JSON.stringify(approvedCandidates, null, 2));

console.log('\n============================================================');
console.log('           CONTEXT-AWARE ADJUDICATION COMPLETE             ');
console.log('============================================================');
console.log(`✅ Enriched ${report.length} conflicts with competition and season data.`);
console.log(`✅ Approved for Production: ${approvedCandidates.length}`);
console.log(`Reports saved to: 
  - contextual_adjudication_report.json
  - approved_candidates.json`);

// Print a sample to the console
const sample = report.find(r => r.providerIds.includes('30603'));
if (sample) {
  console.log('\n--- Sample Adjudication (Real Madrid Women) ---');
  console.log(JSON.stringify(sample, null, 2));
}