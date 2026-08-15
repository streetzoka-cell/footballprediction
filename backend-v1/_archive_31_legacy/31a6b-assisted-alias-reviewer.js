'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION_DIR = path.join(ROOT, 'public_data_v2', 'migration');
const INDEX_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'indexes');

const TEMPLATE_FILE = path.join(MIGRATION_DIR, '31a6-manual-alias-template.json');
const ASSISTED_FILE = path.join(MIGRATION_DIR, '31a6-assisted-alias-template.json');
const ENTITY_IDENTITY_FILE = path.join(INDEX_DIR, 'entity_identity_index.json');

function normalizeName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.'’`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCoreTokens(name) {
  let str = normalizeName(name);
  str = str.replace(/\b(fc|cf|ac|sc|ssc|us|as|rc|cd|vfl|sv|fk|rb|1)\b/g, '');
  str = str.replace(/\s+/g, ' ').trim();
  return new Set(str.split(/\s+/).filter(t => t.length >= 2));
}

function getEditDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let current = [i];
    for (let j = 1; j <= b.length; j++) {
      const insert = current[j - 1] + 1;
      const remove = prev[j] + 1;
      const replace = prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(insert, remove, replace);
    }
    for (let j = 0; j < current.length; j++) prev[j] = current[j];
  }
  return prev[b.length];
}

// Curated, manually verified Elo -> canonical football identity mappings.
// Ambiguous names (inter, steaua, betis, standard) have been removed.
const VERIFIED_FOOTBALL_ALIASES = {
  "ajax": "AFC Ajax",
  "anderlecht": "RSC Anderlecht",
  "atalanta": "Atalanta BC",
  "ath madrid": "Atlético Madrid",
  "austria wien": "FK Austria Wien",
  "auxerre": "AJ Auxerre",
  "benfica": "SL Benfica",
  "besiktas": "Beşiktaş Jimnastik Kulübü",
  "bologna": "Bologna Football Club 1909",
  "brescia": "Brescia Calcio",
  "brondby": "Bröndby IF",
  "cagliari": "Cagliari Calcio",
  "club brugge": "Club Brugge KV",
  "cska moskva": "PFK CSKA Moskva",
  "dortmund": "Borussia Dortmund",
  "ein frankfurt": "Eintracht Frankfurt",
  "elfsborg": "Idrottsföreningen Elfsborg",
  "espanol": "RCD Espanyol",
  "fc kobenhavn": "FC Copenhagen",
  "feyenoord": "Feyenoord",
  "goeteborg": "IFK Göteborg",
  "greuther furth": "SpVgg Greuther Fürth",
  "hamburg": "Hamburger SV",
  "hannover": "Hannover 96",
  "hertha": "Hertha BSC",
  "lazio": "Società Sportiva Lazio S.p.A.",
  "legia": "Legia Warszawa",
  "levante": "Levante UD",
  "leverkusen": "Bayer 04 Leverkusen",
  "lille": "LOSC Lille",
  "lyon": "Olympique Lyonnais",
  "mainz": "1.FSV Mainz 05",
  "man city": "Manchester City",
  "man united": "Manchester United",
  "marseille": "Olympique Marseille",
  "montpellier": "Montpellier HSC",
  "newcastle": "Newcastle United",
  "nice": "OGC Nice",
  "nurnberg": "1.FC Nuremberg",
  "olympiakos": "Olympiakos Syndesmos Filathlon Peiraios",
  "osasuna": "CA Osasuna",
  "panathinaikos": "Panathinaikos Athlitikos Omilos",
  "rapid wien": "Rapid Vienna",
  "rennes": "Stade Rennais FC",
  "rosenborg": "Rosenborg Ballklub",
  "salzburg": "Fußballclub Red Bull Salzburg",
  "sampdoria": "UC Sampdoria",
  "sp gijon": "Sporting Gijón",
  "sp lisbon": "Sporting CP",
  "st etienne": "AS Saint-Étienne",
  "sturm graz": "Sportklub Puntigamer Sturm Graz",
  "stuttgart": "VfB Stuttgart",
  "tottenham": "Tottenham Hotspur",
  "udinese": "Udinese Calcio",
  "west brom": "West Bromwich Albion",
  "west ham": "West Ham United"
};

// Explicitly ambiguous names that must never be auto-approved
const EXPLICIT_REVIEW_ALIASES = new Set([
  "inter", "steaua", "betis", "standard", "roma", "parma", "genk", "gent",
  "paok", "zenit", "wolves", "celta"
]);

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 31A.6B');
  console.log(' CONSERVATIVE CANDIDATE GENERATOR (COLLISION-AWARE)');
  console.log('============================================================\n');

  console.log('> Loading Entity Identity Index...');
  const entityIndex = JSON.parse(fs.readFileSync(ENTITY_IDENTITY_FILE, 'utf8'));

  // Build Lookup Maps for CLUBS only
  const canonicalLookup = []; 
  // CRITICAL FIX: Map normName -> Set of entityIds to detect collisions
  const canonicalNormMap = new Map(); 
  
  for (const [entityId, data] of Object.entries(entityIndex)) {
    if (data.type !== 'CLUB') continue;
    const names = [data.canonical_name, ...(data.aliases || [])];
    for (const name of names) {
      const norm = normalizeName(name);
      canonicalLookup.push({ normName: norm, entityId, canonicalName: data.canonical_name });
      
      if (!canonicalNormMap.has(norm)) {
        canonicalNormMap.set(norm, new Set());
      }
      canonicalNormMap.get(norm).add(entityId);
    }
  }

  console.log('> Loading Manual Alias Template...');
  const template = JSON.parse(fs.readFileSync(TEMPLATE_FILE, 'utf8'));

  let reviewCount = 0;
  let rejectCount = 0;
  let safeCount = 0;
  let verifiedAliasCount = 0;
  let explicitReviewCount = 0;

  console.log('> Analyzing unresolved names with strict candidate generation...\n');

  for (const item of template.aliases) {
    const eloName = item.eloName;
    const normElo = normalizeName(eloName);
    
    // 1. Auto-Reject Reserve Teams
    if (/\b(b|ii|iii|u21|u19|u17|reserves|reserve|m)\b/i.test(eloName)) {
      item.status = "REJECT";
      item.matchType = "RESERVE_TEAM";
      item.confidence = 0.0;
      item.notes = "Auto-rejected: Reserve team identifier.";
      item.candidates = [];
      rejectCount++;
      continue;
    }

    // 2. Explicit Ambiguity Block
    if (EXPLICIT_REVIEW_ALIASES.has(normElo)) {
      item.status = "REVIEW";
      item.entityId = null;
      item.canonicalName = null;
      item.matchType = "EXPLICIT_REVIEW";
      item.confidence = 0.0;
      item.candidates = [];
      item.notes = "Explicitly requires manual identity verification (ambiguous name).";
      explicitReviewCount++;
      reviewCount++;
      continue;
    }

    const candidates = [];
    let exactAliasMatch = false;

    // 3. Check Verified Football Aliases Dictionary
    const verifiedCanonical = VERIFIED_FOOTBALL_ALIASES[normElo];
    if (verifiedCanonical) {
      const verifiedNorm = normalizeName(verifiedCanonical);
      if (canonicalNormMap.has(verifiedNorm)) {
        const entityIds = canonicalNormMap.get(verifiedNorm);
        // Only mark SAFE if the target canonical name maps to exactly ONE entity
        if (entityIds.size === 1) {
          const entityId = [...entityIds][0];
          candidates.push({
            entityId: entityId,
            canonicalName: entityIndex[entityId].canonical_name,
            matchType: "VERIFIED_ALIAS"
          });
          exactAliasMatch = true;
          verifiedAliasCount++;
        } else {
          item.notes = `Verified alias target "${verifiedCanonical}" is ambiguous in index.`;
        }
      } else {
        item.notes = `Verified alias target "${verifiedCanonical}" not found in index.`;
      }
    }

    // 4. Check for Exact Normalized Match (The ONLY other path to SAFE)
    if (candidates.length === 0) {
      if (canonicalNormMap.has(normElo)) {
        const entityIds = canonicalNormMap.get(normElo);
        // Only mark SAFE if the exact normalized name maps to exactly ONE entity
        if (entityIds.size === 1) {
          const entityId = [...entityIds][0];
          candidates.push({
            entityId: entityId,
            canonicalName: entityIndex[entityId].canonical_name,
            matchType: "EXACT_ALIAS"
          });
          exactAliasMatch = true;
        }
      }
    }

    // 5. Check for Core Token Match (REVIEW Candidate)
    if (candidates.length === 0) {
      const eloTokens = getCoreTokens(eloName);
      if (eloTokens.size > 0) {
        for (const canonical of canonicalLookup) {
          const canonTokens = getCoreTokens(canonical.canonicalName);
          if (eloTokens.size === canonTokens.size) {
            let setsEqual = true;
            for (const t of eloTokens) {
              if (!canonTokens.has(t)) { setsEqual = false; break; }
            }
            if (setsEqual) {
              candidates.push({
                entityId: canonical.entityId,
                canonicalName: canonical.canonicalName,
                matchType: "CORE_TOKEN"
              });
            }
          }
        }
      }
    }

    // 6. Check for Reverse Substring (REVIEW Candidate)
    if (candidates.length === 0 && normElo.length >= 5) {
      for (const canonical of canonicalLookup) {
        if (canonical.normName.includes(normElo)) {
          candidates.push({
            entityId: canonical.entityId,
            canonicalName: canonical.canonicalName,
            matchType: "REVERSE_SUBSTRING"
          });
        }
      }
    }

    // 7. Check for Levenshtein Distance (REVIEW Candidate)
    if (candidates.length === 0) {
      for (const canonical of canonicalLookup) {
        const dist = getEditDistance(normElo, canonical.normName);
        if (dist <= 2) {
          candidates.push({
            entityId: canonical.entityId,
            canonicalName: canonical.canonicalName,
            matchType: "FUZZY",
            distance: dist
          });
        }
      }
    }

    // Deduplicate candidates by entityId
    const uniqueCandidates = [];
    const seenIds = new Set();
    for (const c of candidates) {
      if (!seenIds.has(c.entityId)) {
        uniqueCandidates.push(c);
        seenIds.add(c.entityId);
      }
    }

    // 8. Assign Status based on candidates
    if (exactAliasMatch && uniqueCandidates.length === 1) {
      item.entityId = uniqueCandidates[0].entityId;
      item.canonicalName = uniqueCandidates[0].canonicalName;
      item.status = "SAFE";
      item.matchType = uniqueCandidates[0].matchType;
      item.confidence = 1.0;
      item.candidates = uniqueCandidates;
      item.notes = "Auto-approved: Exact unique alias or verified dictionary match.";
      safeCount++;
    } else {
      item.status = "REVIEW";
      item.candidates = uniqueCandidates;
      
      if (uniqueCandidates.length === 1) {
        item.entityId = uniqueCandidates[0].entityId;
        item.canonicalName = uniqueCandidates[0].canonicalName;
        item.matchType = uniqueCandidates[0].matchType;
        item.confidence = 0.5;
        item.notes = `Requires review: Single ${uniqueCandidates[0].matchType} match.`;
      } else if (uniqueCandidates.length > 1) {
        item.entityId = null;
        item.canonicalName = null;
        item.matchType = "AMBIGUOUS";
        item.confidence = 0.2;
        item.notes = `Requires review: ${uniqueCandidates.length} candidates found.`;
      } else {
        item.entityId = null;
        item.canonicalName = null;
        item.matchType = "NO_CANDIDATE";
        item.confidence = 0.0;
        item.notes = "No confident match found in entity index.";
      }
      reviewCount++;
    }
  }

  fs.writeFileSync(ASSISTED_FILE, JSON.stringify(template, null, 2), 'utf8');

  console.log('============================================================');
  console.log(' ASSISTED REVIEW SUMMARY');
  console.log('============================================================');
  console.log(`Total Names Evaluated : ${template.aliases.length}`);
  console.log(`✅ Marked SAFE        : ${safeCount} (${verifiedAliasCount} via verified dict)`);
  console.log(`⚠️  Marked REVIEW      : ${reviewCount} (${explicitReviewCount} explicit review)`);
  console.log(`❌ Marked REJECT      : ${rejectCount}\n`);

  console.log(`   ✅ Saved assisted template: ${path.relative(ROOT, ASSISTED_FILE)}`);
  console.log('\n============================================================');
  console.log(' STEP 31A.6B COMPLETE');
  console.log('============================================================');
  console.log('Open the assisted template file.');
  console.log('Manually verify the "SAFE" entries (if any).');
  console.log('Manually resolve "REVIEW" entries by picking from the "candidates" array.');
  console.log('Then run Step 31A.7 to apply only the "SAFE" aliases.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});