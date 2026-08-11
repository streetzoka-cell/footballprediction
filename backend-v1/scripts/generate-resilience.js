// backend-v1/scripts/generate-resilience.js
const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');
const INTEL_DIR = path.join(HISTORY_DIR, 'entities', 'team_intelligence');

function findMatchesFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      findMatchesFiles(filePath, fileList);
    } else if (file === 'matches.json') {
      fileList.push(filePath);
    }
  }
  return fileList;
}

async function run() {
  console.log('[Resilience] Starting Comeback & Resilience Generation...');
  
  const matchesFiles = findMatchesFiles(HISTORY_DIR);
  const teamResilience = {};

  function initStats() {
    return {
      comeback_wins: 0,     // Losing at HT, Winning at FT
      lead_surrendered: 0,   // Winning at HT, Drawing/Losing at FT
      half_time_leads: 0,    // Winning at HT (regardless of FT)
      first_half_goals: 0,
      second_half_goals: 0
    };
  }

  function getTeam(name) {
    if (!teamResilience[name]) teamResilience[name] = initStats();
    return teamResilience[name];
  }

  console.log(`[Resilience] Scanning ${matchesFiles.length} match files...`);

  for (const matchesFile of matchesFiles) {
    try {
      const raw = fs.readFileSync(matchesFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.matches)) continue;

      for (const match of parsed.matches) {
        const htHome = match.score?.ht?.home;
        const htAway = match.score?.ht?.away;
        const ftHome = match.score?.ft?.home;
        const ftAway = match.score?.ft?.away;

        // Only process if we have valid HT and FT scores
        if (htHome !== null && htAway !== null && ftHome !== null && ftAway !== null) {
          const home = getTeam(match.home_team);
          const away = getTeam(match.away_team);

          // Calculate 1st half vs 2nd half goals
          const home2ndHalf = ftHome - htHome;
          const away2ndHalf = ftAway - htAway;

          home.first_half_goals += htHome;
          home.second_half_goals += home2ndHalf > 0 ? home2ndHalf : 0;
          away.first_half_goals += htAway;
          away.second_half_goals += away2ndHalf > 0 ? away2ndHalf : 0;

          // Comeback Wins (Losing at HT, Winning at FT)
          if (htHome < htAway && ftHome > ftAway) home.comeback_wins++;
          if (htAway < htHome && ftAway > ftHome) away.comeback_wins++;

          // Half Time Leads
          if (htHome > htAway) home.half_time_leads++;
          if (htAway > htHome) away.half_time_leads++;

          // Lead Surrendered (Winning at HT, Drawing/Losing at FT)
          if (htHome > htAway && ftHome <= ftAway) home.lead_surrendered++;
          if (htAway > htHome && ftAway <= ftHome) away.lead_surrendered++;
        }
      }
    } catch (e) {}
  }

  console.log(`[Resilience] Updating ${Object.keys(teamResilience).length} team intelligence files...`);
  let updatedCount = 0;

  for (const teamName in teamResilience) {
    const slug = teamName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const filePath = path.join(INTEL_DIR, `${slug}.json`);

    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const teamIntel = JSON.parse(raw);

        const stats = teamResilience[teamName];
        
        teamIntel.resilience = {
          comeback_wins: stats.comeback_wins,
          half_time_leads: stats.half_time_leads,
          lead_surrendered: stats.lead_surrendered,
          lead_protection_rate: stats.half_time_leads > 0 
            ? parseFloat((((stats.half_time_leads - stats.lead_surrendered) / stats.half_time_leads) * 100).toFixed(1))
            : null,
          first_half_goals: stats.first_half_goals,
          second_half_goals: stats.second_half_goals,
          second_half_dominance: stats.second_half_goals > stats.first_half_goals
        };

        fs.writeFileSync(filePath, JSON.stringify(teamIntel, null, 2));
        updatedCount++;
      } catch (e) {}
    }
  }

  console.log(`\n[Resilience] Done! Updated ${updatedCount} team files with resilience stats.`);
}

run().catch(err => { console.error('[Resilience] Failed:', err); process.exit(1); });