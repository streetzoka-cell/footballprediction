
'use strict';

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'source', 'ZOKASCORE_FINAL');
const INDEX_DIR = path.join(ROOT, 'data', 'indexes');
const INTEL_DIR = path.join(ROOT, 'data', 'intelligence');
const AUDIT_DIR = path.join(ROOT, 'data_audit', 'canonical_gate');

const FIX_PROPOSAL_PATH = path.join(AUDIT_DIR, 'fix-proposals.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function clean(v){
  return String(v??'').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ').replace(/[.'’‘`"]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function compact(v){ return clean(v).replace(/\s+/g,''); }
function safeNumber(v){
  if(v===undefined||v===null||String(v).trim()==='') return null;
  const n=Number(v); return Number.isFinite(n)?n:null;
}
function safeFilename(v){ return String(v).replace(/[^a-zA-Z0-9_-]/g,'_'); }

function atomicWrite(filePath, data){
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const tmp = path.join(dir, `.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, filePath);
}

function createTeamStats(){
  return { matches:0,wins:0,draws:0,losses:0,goals_for:0,goals_against:0,recent_form:[] };
}
function createH2HStats(){ return { matches:0,team_a_wins:0,team_b_wins:0,draws:0 }; }
function createPlayerStats(){ return { appearances:0,goals:0,assists:0,yellow_cards:0,red_cards:0 }; }

let aliasToKeep = new Map();
let keepSet = new Set();
let dupCountFromGate = 0;
if(fs.existsSync(FIX_PROPOSAL_PATH)){
  try{
    const fp = JSON.parse(fs.readFileSync(FIX_PROPOSAL_PATH,'utf8'));
    dupCountFromGate = fp.duplicate_match_ids?.length || 0;
    for(const g of fp.duplicate_match_ids || []){
      keepSet.add(g.keep);
      for(const id of g.ids){ if(id!==g.keep) aliasToKeep.set(id, g.keep); }
    }
    console.log(`[INTEL] Loaded ${dupCountFromGate} duplicate groups from fix-proposals.json - aliasMap size ${aliasToKeep.size}`);
  }catch(e){ console.warn(`[INTEL-WARN] Could not load fix-proposals: ${e.message}`); }
}

async function run(){
  console.log('============================================================');
  console.log(' ZOKASCORE V2 — PHASE C: BUILD INTELLIGENCE INDEXES (SHARPENED + KEEP-FIRST FIX)');
  console.log('============================================================\n');

  ensureDir(INTEL_DIR);
  ensureDir(path.join(INTEL_DIR,'teams'));
  ensureDir(path.join(INTEL_DIR,'h2h'));
  ensureDir(path.join(INTEL_DIR,'players'));

  console.log('[1/4] Loading canonical Team Index...');
  const teamsIndex = JSON.parse(fs.readFileSync(path.join(INDEX_DIR,'teams-index.json'),'utf8'));
  const teamNameToIds = new Map();
  for(const [teamId, profile] of Object.entries(teamsIndex)){
    const norm = compact(profile?.name || profile?.canonical_name || '');
    if(!norm) continue;
    if(!teamNameToIds.has(norm)) teamNameToIds.set(norm, []);
    teamNameToIds.get(norm).push(teamId);
  }
  const teamNameToIdMap = new Map();
  let ambiguousTeamNames=0;
  for(const [name,ids] of teamNameToIds.entries()){
    if(ids.length===1){
      teamNameToIdMap.set(name, ids[0]);
    } else {
      ambiguousTeamNames++;
      const keep = ids[0];
      teamNameToIdMap.set(name, keep);
      console.log(`[INTEL] Team alias KEEP-FIRST: ${keep} for "${name}" duplicates: ${ids.join(', ')}`);
    }
  }
  console.log(`   ↳ Teams indexed: ${Object.keys(teamsIndex).length.toLocaleString()}`);
  console.log(`   ↳ Unique name mappings: ${teamNameToIdMap.size.toLocaleString()}`);
  console.log(`   ↳ Ambiguous (keep-first): ${ambiguousTeamNames.toLocaleString()}\n`);

  console.log('[2/4] Loading MASTER and deduping 8 known duplicates...');
  const matches = Object.create(null);
  let masterRows=0, excludedRows=0, dedupedSkipped=0, aliasSkipped=0;

  await new Promise((resolve,reject)=>{
    fs.createReadStream(path.join(DATA_DIR,'ZOKASCORE_PUBLIC_MASTER.csv')).pipe(csv())
      .on('data', row=>{
        masterRows++;
        let matchId = String(row.zokascore_match_id??'').trim();
        const date = String(row.date??'').trim();
        const homeName = String(row.home_team??'').trim();
        const awayName = String(row.away_team??'').trim();
        if(!matchId||!date||!homeName||!awayName){ excludedRows++; return; }

        if(aliasToKeep.has(matchId)){ aliasSkipped++; return; }

        const homeId = teamNameToIdMap.get(compact(homeName));
        const awayId = teamNameToIdMap.get(compact(awayName));
        if(!homeId||!awayId){ excludedRows++; return; }

        const homeScore = safeNumber(row.home_score);
        const awayScore = safeNumber(row.away_score);
        const validScore = homeScore!==null && awayScore!==null && homeScore>=0 && awayScore>=0;

        if(matches[matchId]){ dedupedSkipped++; return; }

        matches[matchId] = {
          match_id: matchId,
          date,
          home_team: homeName,
          away_team: awayName,
          home_team_id: homeId,
          away_team_id: awayId,
          home_score: homeScore,
          away_score: awayScore,
          has_valid_score: validScore,
          competition: String(row.competition??'').trim()
        };
      })
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(`   ↳ MASTER rows: ${masterRows.toLocaleString()}`);
  console.log(`   ↳ Canonical matches indexed: ${Object.keys(matches).length.toLocaleString()}`);
  console.log(`   ↳ Alias duplicates skipped: ${aliasSkipped.toLocaleString()} (expected ${dupCountFromGate})`);
  console.log(`   ↳ Collision duplicates skipped: ${dedupedSkipped.toLocaleString()}`);
  console.log(`   ↳ Excluded (no team map): ${excludedRows.toLocaleString()} ${excludedRows===0?'✅':''}\n`);

  console.log('[3/4] Building Team and H2H intelligence (sorted by date)...');
  const sortedMatches = Object.values(matches).sort((a,b)=> a.date.localeCompare(b.date));

  const teamData = Object.create(null);
  const h2hData = Object.create(null);
  let validMatchCount=0, invalidScoreCount=0, selfMatchCount=0;

  for(const match of sortedMatches){
    if(!match.has_valid_score){ invalidScoreCount++; continue; }
    if(match.home_team_id===match.away_team_id){ selfMatchCount++; continue; }
    validMatchCount++;
    const hs=match.home_score, as=match.away_score;
    const homeId=match.home_team_id, awayId=match.away_team_id;

    if(!teamData[homeId]) teamData[homeId]=createTeamStats();
    if(!teamData[awayId]) teamData[awayId]=createTeamStats();

    teamData[homeId].matches++; teamData[homeId].goals_for+=hs; teamData[homeId].goals_against+=as;
    teamData[awayId].matches++; teamData[awayId].goals_for+=as; teamData[awayId].goals_against+=hs;

    if(hs>as){
      teamData[homeId].wins++; teamData[awayId].losses++;
      teamData[homeId].recent_form.push('W'); teamData[awayId].recent_form.push('L');
    }else if(as>hs){
      teamData[awayId].wins++; teamData[homeId].losses++;
      teamData[homeId].recent_form.push('L'); teamData[awayId].recent_form.push('W');
    }else{
      teamData[homeId].draws++; teamData[awayId].draws++;
      teamData[homeId].recent_form.push('D'); teamData[awayId].recent_form.push('D');
    }
    if(teamData[homeId].recent_form.length>5) teamData[homeId].recent_form.shift();
    if(teamData[awayId].recent_form.length>5) teamData[awayId].recent_form.shift();

    const [teamA,teamB]=[homeId,awayId].sort();
    const h2hKey=`${teamA}_vs_${teamB}`;
    if(!h2hData[h2hKey]) h2hData[h2hKey]=createH2HStats();
    const h2h=h2hData[h2hKey]; h2h.matches++;
    if(hs>as){ if(homeId===teamA) h2h.team_a_wins++; else h2h.team_b_wins++; }
    else if(as>hs){ if(awayId===teamA) h2h.team_a_wins++; else h2h.team_b_wins++; }
    else h2h.draws++;
  }

  console.log(`   ↳ Valid matches: ${validMatchCount.toLocaleString()}`);
  console.log(`   ↳ Teams: ${Object.keys(teamData).length.toLocaleString()}`);
  console.log(`   ↳ H2H pairs: ${Object.keys(h2hData).length.toLocaleString()}`);
  console.log(`   ↳ Invalid score: ${invalidScoreCount.toLocaleString()} Self: ${selfMatchCount.toLocaleString()}\n`);

  console.log('[4/4] Writing intelligence artifacts (atomic)...');
  for(const [teamId, stats] of Object.entries(teamData)){
    const profile = { team: teamId, ...stats, recent_form: [...stats.recent_form].reverse() };
    atomicWrite(path.join(INTEL_DIR,'teams',`${safeFilename(teamId)}.json`), JSON.stringify(profile,null,2));
  }
  atomicWrite(path.join(INTEL_DIR,'team-intelligence-index.json'), JSON.stringify(teamData,null,2));
  atomicWrite(path.join(INTEL_DIR,'h2h','summaries.json'), JSON.stringify(h2hData,null,2));
  atomicWrite(path.join(INTEL_DIR,'h2h-intelligence-index.json'), JSON.stringify(h2hData,null,2));

  console.log('[4/4] Building Player intelligence...');
  const crosswalk = JSON.parse(fs.readFileSync(path.join(INDEX_DIR,'match-id-crosswalk.json'),'utf8'));
  const playerIndex = JSON.parse(fs.readFileSync(path.join(INDEX_DIR,'players-index.json'),'utf8'));
  const playerData = Object.create(null);
  let appearanceRows=0, appearanceUsed=0, appearanceExcluded=0;

  await new Promise((resolve,reject)=>{
    fs.createReadStream(path.join(DATA_DIR,'ZOKASCORE_APPEARANCES.csv')).pipe(csv())
      .on('data', row=>{
        appearanceRows++;
        const sourceMatchId = String(row.zokascore_match_id??'').trim();
        if(!sourceMatchId){ appearanceExcluded++; return; }
        let canonicalMatchId = crosswalk[sourceMatchId] || sourceMatchId;
        if(aliasToKeep.has(canonicalMatchId)) canonicalMatchId = aliasToKeep.get(canonicalMatchId);
        if(!matches[canonicalMatchId]){ appearanceExcluded++; return; }
        const playerId = String(row.zokascore_player_id??'').trim();
        if(!playerId){ appearanceExcluded++; return; }
        if(!playerData[playerId]) playerData[playerId]=createPlayerStats();
        const s=playerData[playerId];
        s.appearances++;
        s.goals+=safeNumber(row.goals)??0;
        s.assists+=safeNumber(row.assists)??0;
        s.yellow_cards+=safeNumber(row.yellow_cards)??0;
        s.red_cards+=safeNumber(row.red_cards)??0;
        appearanceUsed++;
      })
      .on('end', resolve)
      .on('error', reject);
  });

  for(const [playerId, stats] of Object.entries(playerData)){
    const profile = { player_id: playerId, name: playerIndex[playerId]?.name || 'Unknown', ...stats };
    atomicWrite(path.join(INTEL_DIR,'players',`player_${safeFilename(playerId)}.json`), JSON.stringify(profile,null,2));
  }
  atomicWrite(path.join(INTEL_DIR,'player-intelligence-index.json'), JSON.stringify(playerData,null,2));

  console.log(`   ↳ Appearances: ${appearanceRows.toLocaleString()} used: ${appearanceUsed.toLocaleString()} excluded: ${appearanceExcluded.toLocaleString()}`);
  console.log(`   ↳ Player profiles: ${Object.keys(playerData).length.toLocaleString()}\n`);

  console.log('============================================================');
  console.log(' PHASE C COMPLETE (SHARPENED + KEEP-FIRST FIX)');
  console.log('============================================================');
  console.log(`Teams       : ${Object.keys(teamData).length.toLocaleString()}`);
  console.log(`H2H pairs   : ${Object.keys(h2hData).length.toLocaleString()}`);
  console.log(`Players     : ${Object.keys(playerData).length.toLocaleString()}`);
  console.log(`MASTER rows : ${masterRows.toLocaleString()}`);
  console.log(`Valid matches: ${validMatchCount.toLocaleString()}`);
  console.log(`Deduped (alias) : ${aliasSkipped.toLocaleString()}`);
  console.log(`Ambiguous team names: ${ambiguousTeamNames.toLocaleString()} (keep-first)`);
  console.log('\n🔒 Canonical source files were NOT modified.');
  console.log('============================================================');
}

run().catch(err=>{ console.error('\n❌ Intelligence build failed:'); console.error(err); process.exit(1); });
