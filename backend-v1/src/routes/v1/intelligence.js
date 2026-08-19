const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(process.cwd(), 'public_data');
const INDEX_DIR = path.join(PUBLIC_DIR, 'knowledge', 'football', 'indexes');
const ENTITIES_DIR = path.join(PUBLIC_DIR, 'knowledge', 'football', 'history', 'entities');
const INTERNAL_MAP_FILE = path.join(process.cwd(), 'data', 'zokascore_football_data', 'canonical_sources', 'internal_team_map.json');

// ============================================================
// V2 IDENTITY RESOLVER
// Loads indexes into memory once for fast lookups
// ============================================================
let teamsIndex = {};
let providerMap = {};
let nameToIdMap = new Map();
let h2hSummaries = {};

try {
  // Load canonical team index
  teamsIndex = JSON.parse(fs.readFileSync(path.join(INDEX_DIR, 'teams-index.json'), 'utf8'));
  
  // Build reverse map (slugified name -> ZK_TEAM_ID)
  Object.entries(teamsIndex).forEach(([zkId, profile]) => {
    if (profile && profile.name) {
      const slug = String(profile.name).toLowerCase().replace(/[^a-z0-9]+/g, '_');
      nameToIdMap.set(slug, zkId);
    }
  });
} catch (e) {
  console.warn('[IntelligenceRoute] teams-index.json not found in public_data. Run Step 13.');
}

try {
  // Load provider map to resolve API IDs
  const mapData = JSON.parse(fs.readFileSync(INTERNAL_MAP_FILE, 'utf8'));
  providerMap = mapData.by_provider_club_id || {};
} catch (e) {
  console.warn('[IntelligenceRoute] internal_team_map.json not found.');
}

try {
  // Load H2H summaries into memory for instant lookups
  h2hSummaries = JSON.parse(fs.readFileSync(path.join(ENTITIES_DIR, 'h2h', 'summaries.json'), 'utf8'));
} catch (e) {
  console.warn('[IntelligenceRoute] H2H summaries.json not found. Run Step 13.');
}

function resolveTeamId(input) {
  const val = String(input || '').trim();
  if (!val) return null;

  // 1. Check if it's already a ZK_TEAM_ID
  if (val.startsWith('ZK_TEAM_')) return val;

  // 2. Check if it's a provider ID
  if (providerMap[val]) return providerMap[val];

  // 3. Check if it's a slugified name
  const slug = val.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (nameToIdMap.has(slug)) return nameToIdMap.get(slug);

  return null; // Unresolved
}

// ============================================================
// ROUTES
// ============================================================

// GET /api/v1/intelligence/team/:teamName
// Fetches deep team intelligence (Form, Goals, Resilience, Match States)
router.get('/team/:teamName', (req, res) => {
  try {
    const zkId = resolveTeamId(req.params.teamName);
    
    if (!zkId) {
      return res.status(404).json({ success: false, error: 'Team identity could not be resolved.' });
    }

    const filePath = path.join(ENTITIES_DIR, 'team_intelligence', `${zkId}.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Team intelligence file not found.', zkId });
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load team intelligence.' });
  }
});

// GET /api/v1/intelligence/h2h/:teamA/:teamB
// Fetches Head-to-Head intelligence
router.get('/h2h/:teamA/:teamB', (req, res) => {
  try {
    const idA = resolveTeamId(req.params.teamA);
    const idB = resolveTeamId(req.params.teamB);
    
    if (!idA || !idB) {
      return res.status(404).json({ success: false, error: 'One or both team identities could not be resolved.' });
    }

    // H2H keys are stored sorted: "ZK_TEAM_A_vs_ZK_TEAM_B"
    const teams = [idA, idB].sort();
    const h2hKey = `${teams[0]}_vs_${teams[1]}`;
    
    const data = h2hSummaries[h2hKey];

    if (!data) {
      return res.status(404).json({ success: false, error: 'H2H record not found.', h2hKey });
    }
    
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load H2H data.' });
  }
});

module.exports = router;