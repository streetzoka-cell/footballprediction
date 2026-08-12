const fs = require('fs');
const path = require('path');

const ENTITIES_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history', 'entities');
const TEAM_ELO_DIR = path.join(ENTITIES_DIR, 'team_elo');
const TEAM_INTEL_DIR = path.join(ENTITIES_DIR, 'team_intelligence');
const OUTPUT_DIR = path.join(ENTITIES_DIR, 'teams');

function loadJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {}
  return null;
}

function run() {
  console.log('[Profiles] Starting Canonical Team Profile Generation...');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  if (!fs.existsSync(TEAM_INTEL_DIR)) {
    console.error('[Profiles] team_intelligence directory not found. Run generate-team-intelligence.js first.');
    process.exit(1);
  }

  const intelFiles = fs.readdirSync(TEAM_INTEL_DIR).filter(f => f.endsWith('.json'));
  let createdCount = 0;

  for (const file of intelFiles) {
    const slug = file.replace('.json', '');
    
    const intel = loadJson(path.join(TEAM_INTEL_DIR, file));
    if (!intel || !intel.name) continue;

    const elo = loadJson(path.join(TEAM_ELO_DIR, file)) || {};

    const profile = {
      team: intel.name,
      slug: slug,
      identity: {
        aliases: intel.aliases || [],
        providerIds: [] // To be populated later if needed
      },
      elo: {
        current: elo.current_elo || null,
        peak: elo.peak_elo || null,
        lowest: elo.lowest_elo || null,
        seasons: elo.seasons || {}
      },
      stats: {
        overall: intel.overall || {},
        home: intel.home || {},
        away: intel.away || {}
      },
      goalPatterns: intel.goal_patterns || {},
      resilience: intel.resilience || {},
      recent_form: intel.recent_form || []
    };

    const outputPath = path.join(OUTPUT_DIR, `${slug}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(profile, null, 2));
    createdCount++;
  }

  console.log(`\n[Profiles] Done! Created ${createdCount} canonical team profiles in entities/teams/`);
}

try {
  run();
} catch (err) {
  console.error('[Profiles] Failed:', err);
  process.exit(1);
}