'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AUDIT_DIR = path.join(ROOT, 'data_audit', 'v2_integrity');
const INPUT_FILE = path.join(AUDIT_DIR, 'unresolved_orphan_deep_evidence.json');
const OUTPUT_FILE = path.join(AUDIT_DIR, 'orphan_fingerprint_score_report.json');
const ENTITY_DIR = path.join(ROOT, 'data_audit', 'entity_resolution');
const CANONICAL_FILE = path.join(ENTITY_DIR, 'canonical_teams.json');

const normalize = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const tokenize = (s) => new Set(normalize(s).split(/[\s\-\.]+/).filter(t => t.length > 1));

function jaccard(setA, setB) {
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function calculateScore(orphanName, candidate) {
  let score = 0;
  let reasons = [];
  
  if (!orphanName) return { score: 0, reasons: [] };
  
  const normOrphan = normalize(orphanName);
  const normPrimary = normalize(candidate.primary_name || '');
  
  // 1. Exact Matches (50 pts)
  if (normOrphan === normPrimary) {
    score += 50;
    reasons.push(`+50 Exact primary name match ("${orphanName}")`);
  } else if ((candidate.aliases || []).some(a => normalize(a) === normOrphan)) {
    score += 50;
    reasons.push(`+50 Exact alias match ("${orphanName}")`);
  } else if ((candidate.historical_names || []).some(h => normalize(h) === normOrphan)) {
    score += 50;
    reasons.push(`+50 Exact historical name match ("${orphanName}")`);
  } else {
    // 2. Fuzzy Similarity (Up to 30 pts)
    const sim = jaccard(tokenize(orphanName), tokenize(candidate.primary_name || ''));
    if (sim > 0.4) { // Threshold to prevent weak matches like "Volga" -> "Volga Nizhny Novgorod"
      const fuzzyScore = Math.round(30 * sim);
      score += fuzzyScore;
      reasons.push(`+${fuzzyScore} Fuzzy token match (${(sim * 100).toFixed(0)}% overlap with "${candidate.primary_name}")`);
    }
  }
  
  return { score, reasons };
}

function main() {
  if (!fs.existsSync(INPUT_FILE)) throw new Error(`Input report not found: ${INPUT_FILE}`);
  if (!fs.existsSync(CANONICAL_FILE)) throw new Error(`Canonical teams file not found: ${CANONICAL_FILE}`);

  const deepEvidence = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  const canonicalTeams = JSON.parse(fs.readFileSync(CANONICAL_FILE, 'utf8'));

  console.log('🔍 Pipeline 31j — Fingerprint Candidate Scorer');
  console.log('============================================================\n');
  console.log(`Scoring ${deepEvidence.totalOrphans} orphans against ${canonicalTeams.length} canonical entities...\n`);

  const report = [];
  const summary = {
    HIGH_CONFIDENCE: 0,
    MEDIUM_CONFIDENCE: 0,
    NO_CANDIDATE: 0,
    UNNAMED_GHOST: 0
  };

  for (const ev of deepEvidence.evidence) {
    const orphanNames = ev.aggregated.orphanNames || [];
    
    let topCandidates = [];
    let classification = 'NO_CANDIDATE';
    let confidence = 0.0;
    let action = 'HOLD_FOR_REVIEW';

    if (orphanNames.length === 0) {
      classification = 'UNNAMED_GHOST';
      action = 'QUARANTINE_OR_MANUAL_URL_LOOKUP';
      summary.UNNAMED_GHOST++;
    } else {
      // Score ALL canonical teams against ALL observed orphan names
      const scored = [];
      for (const c of canonicalTeams) {
        let maxScoreForCandidate = 0;
        let reasonsForCandidate = [];
        
        for (const name of orphanNames) {
          const res = calculateScore(name, c);
          if (res.score > maxScoreForCandidate) {
            maxScoreForCandidate = res.score;
            reasonsForCandidate = res.reasons;
          }
        }
        
        if (maxScoreForCandidate > 0) {
          scored.push({ candidate: c, score: maxScoreForCandidate, reasons: reasonsForCandidate });
        }
      }

      // Sort descending by score and take top 3
      scored.sort((a, b) => b.score - a.score);
      topCandidates = scored.slice(0, 3);

      if (topCandidates.length > 0 && topCandidates[0].score >= 50) {
        classification = 'HIGH_CONFIDENCE';
        confidence = 0.95;
        action = 'CANDIDATE_FOR_MAPPING';
        summary.HIGH_CONFIDENCE++;
      } else if (topCandidates.length > 0 && topCandidates[0].score >= 15) { // Minimum threshold for fuzzy
        classification = 'MEDIUM_CONFIDENCE';
        confidence = 0.50;
        action = 'MANUAL_REVIEW_REQUIRED';
        summary.MEDIUM_CONFIDENCE++;
      } else {
        classification = 'NO_CANDIDATE';
        action = 'CANDIDATE_FOR_NEW_ENTITY';
        summary.NO_CANDIDATE++;
      }
    }

    report.push({
      orphanId: ev.orphanId,
      observedNames: orphanNames,
      classification,
      confidence,
      action,
      topCandidates: topCandidates.map(c => ({
        canonicalId: c.candidate.canonical_id,
        primaryName: c.candidate.primary_name,
        score: c.score,
        reasons: c.reasons
      })),
      context: {
        opponents: ev.aggregated.opponents.slice(0, 3),
        seasons: ev.aggregated.seasons.slice(0, 3),
        competitions: ev.aggregated.competitions.slice(0, 2),
        sampleUrl: ev.aggregated.sampleUrls[0] || null
      }
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    pipeline: '31j',
    summary,
    candidates: report
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');

  console.log('============================================================');
  console.log(' PIPELINE 31j COMPLETE');
  console.log('============================================================');
  console.log(`HIGH_CONFIDENCE:   ${summary.HIGH_CONFIDENCE} (Strong exact match -> ready to map)`);
  console.log(`MEDIUM_CONFIDENCE: ${summary.MEDIUM_CONFIDENCE} (Fuzzy match -> manual review needed)`);
  console.log(`NO_CANDIDATE:      ${summary.NO_CANDIDATE} (Name exists, but no local match -> new entity)`);
  console.log(`UNNAMED_GHOST:     ${summary.UNNAMED_GHOST} (No name -> unrecoverable locally)`);
  console.log(`\n📄 ${OUTPUT_FILE}`);
  console.log('🛡️ READ-ONLY: no source/entity files modified.');
}

try {
  main();
} catch (e) {
  console.error('❌ Pipeline 31j failed:', e.stack || e.message);
  process.exit(1);
}