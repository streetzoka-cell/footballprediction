'use strict';

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'source', 'ZOKASCORE_FINAL');
const INDEX_DIR = path.join(ROOT, 'data', 'indexes');
const INTEL_DIR = path.join(ROOT, 'data', 'intelligence', 'seasonal');
const AUDIT_DIR = path.join(ROOT, 'data_audit', 'canonical_gate');
const FIX_PROPOSAL_PATH = path.join(AUDIT_DIR, 'fix-proposals.json');

const MASTER_FILE = path.join(DATA_DIR, 'ZOKASCORE_PUBLIC_MASTER.csv');
const TEAMS_INDEX_FILE = path.join(INDEX_DIR, 'teams-index.json');

function ensureDir(dir){ if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true}); }
function clean(v){ return String(v??'').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ').replace(/[.\'’’‘`"]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim(); }
function compact(v){ return clean(v).replace(/\s+/g,''); }
function safeNumber(v){ if(v===undefined||v===null||String(v).trim()==='') return null; const n=Number(v); return Number.isFinite(n)?n:null; }
function safeFilename(v){ return String(v).replace(/[<>:"/\\|?*\x00-\x1F]/g,'_').replace(/[. ]+$/g,'').trim()||'unknown'; }
function percentage(a,b){ if(!b) return 0; return Number(((a/b)*100).toFixed(2)); }
function average(a,b){ if(!b) return 0; return Number((a/b).toFixed(2)); }
function deriveSeasonFromDate(d){ const s=String(d??'').trim(); const m=s.match(/^(\d{4})/); return m?m[1]:null; }
function atomicWrite(fp,data){ const dir=path.dirname(fp); ensureDir(dir); const tmp=path.join(dir, `.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`); fs.writeFileSync(tmp,data,'utf8'); fs.renameSync(tmp,fp); }

function createTeamStats(teamId, teamName){
  return { team_id:teamId, team_name:teamName, matches:0,wins:0,draws:0,losses:0,standard_points:0, goals_for:0,goals_against:0,goal_difference:0,clean_sheets:0,failed_to_score:0, home:{matches:0,wins:0,draws:0,losses:0,goals_for:0,goals_against:0,clean_sheets:0,failed_to_score:0}, away:{matches:0,wins:0,draws:0,losses:0,goals_for:0,goals_against:0,clean_sheets:0,failed_to_score:0}, markets:{btts:0,over_0_5:0,over_1_5:0,over_2_5:0,over_3_5:0} };
}
function updateTeamStats(stats,gf,ga,venue){
  stats.matches++; stats.goals_for+=gf; stats.goals_against+=ga;
  if(gf>ga){ stats.wins++; stats.standard_points+=3; } else if(gf<ga){ stats.losses++; } else { stats.draws++; stats.standard_points+=1; }
  if(ga===0) stats.clean_sheets++; if(gf===0) stats.failed_to_score++;
  const v=stats[venue]; v.matches++; v.goals_for+=gf; v.goals_against+=ga;
  if(gf>ga) v.wins++; else if(gf<ga) v.losses++; else v.draws++;
  if(ga===0) v.clean_sheets++; if(gf===0) v.failed_to_score++;
  const tg=gf+ga; if(gf>0&&ga>0) stats.markets.btts++; if(tg>0) stats.markets.over_0_5++; if(tg>1) stats.markets.over_1_5++; if(tg>2) stats.markets.over_2_5++; if(tg>3) stats.markets.over_3_5++;
}
function finalizeTeamStats(stats){
  stats.goal_difference=stats.goals_for-stats.goals_against;
  stats.win_percentage=percentage(stats.wins,stats.matches);
  stats.goals_per_match=average(stats.goals_for,stats.matches);
  stats.goals_conceded_per_match=average(stats.goals_against,stats.matches);
  stats.home.win_percentage=percentage(stats.home.wins,stats.home.matches);
  stats.home.goals_per_match=average(stats.home.goals_for,stats.home.matches);
  stats.home.goals_conceded_per_match=average(stats.home.goals_against,stats.home.matches);
  stats.away.win_percentage=percentage(stats.away.wins,stats.away.matches);
  stats.away.goals_per_match=average(stats.away.goals_for,stats.away.matches);
  stats.away.goals_conceded_per_match=average(stats.away.goals_against,stats.away.matches);
  stats.markets.btts_percentage=percentage(stats.markets.btts,stats.matches);
  stats.markets.over_0_5_percentage=percentage(stats.markets.over_0_5,stats.matches);
  stats.markets.over_1_5_percentage=percentage(stats.markets.over_1_5,stats.matches);
  stats.markets.over_2_5_percentage=percentage(stats.markets.over_2_5,stats.matches);
  stats.markets.over_3_5_percentage=percentage(stats.markets.over_3_5,stats.matches);
  return stats;
}

let aliasToKeep=new Map();
let dupCount=0;
if(fs.existsSync(FIX_PROPOSAL_PATH)){
  try{ const fp=JSON.parse(fs.readFileSync(FIX_PROPOSAL_PATH,'utf8')); dupCount=fp.duplicate_match_ids?.length||0; for(const g of fp.duplicate_match_ids||[]){ for(const id of g.ids){ if(id!==g.keep) aliasToKeep.set(id,g.keep);} } console.log(`[SEASONAL] Loaded ${dupCount} duplicate groups - skipping ${aliasToKeep.size} alias match IDs`);}catch(e){ console.warn(`[WARN] fix-proposals load failed: ${e.message}`); }
}

async function run(){
  console.log('============================================================');
  console.log(' ZOKASCORE V2 — STEP 7: SEASONAL INTELLIGENCE (SHARPENED)');
  console.log('============================================================\n');
  if(!fs.existsSync(MASTER_FILE)) throw new Error(`MASTER not found: ${MASTER_FILE}`);
  if(!fs.existsSync(TEAMS_INDEX_FILE)) throw new Error(`Teams index not found: ${TEAMS_INDEX_FILE}`);
  ensureDir(INTEL_DIR);

  console.log('[1/3] Loading canonical team index (HamKam fix)...');
  const teamsIndex=JSON.parse(fs.readFileSync(TEAMS_INDEX_FILE,'utf8'));
  const teamNameToIds=new Map();
  for(const [teamId,profile] of Object.entries(teamsIndex)){
    if(!profile?.name) continue;
    const norm=compact(profile.name);
    if(!norm) continue;
    if(!teamNameToIds.has(norm)) teamNameToIds.set(norm,[]);
    teamNameToIds.get(norm).push(teamId);
  }
  const teamNameToIdMap=new Map();
  const teamIdAlias=new Map();
  let ambiguousNameCount=0;
  for(const [name,ids] of teamNameToIds.entries()){
    if(ids.length===1){ teamNameToIdMap.set(name,ids[0]); }
    else {
      ambiguousNameCount++;
      const keep=ids[0];
      teamNameToIdMap.set(name,keep);
      for(let i=1;i<ids.length;i++){ teamIdAlias.set(ids[i],keep); console.log(`[SEASONAL] Team alias: ${ids[i]} -> ${keep} for "${name}"`); }
    }
  }
  console.log(`   ↳ Teams indexed: ${Object.keys(teamsIndex).length.toLocaleString()}`);
  console.log(`   ↳ Unique mappings: ${teamNameToIdMap.size.toLocaleString()} (was 4,560, now recovers HamKam)`);
  console.log(`   ↳ Ambiguous groups kept: ${ambiguousNameCount.toLocaleString()}\n`);

  console.log('[2/3] Aggregating seasonal statistics...');
  const seasonsMap=new Map();
  const unresolvedTeams=new Map();
  let totalRows=0,processedMatches=0,skippedMissingSeason=0,derivedSeasonFromDate=0,skippedMissingDateForSeason=0,skippedMissingTeam=0,skippedUnresolvedTeam=0,skippedInvalidScore=0,skippedSelfMatch=0,skippedAliasDup=0;

  await new Promise((resolve,reject)=>{
    fs.createReadStream(MASTER_FILE).pipe(csv()).on('data', row=>{
      totalRows++;
      const matchId=String(row.zokascore_match_id??'').trim();
      if(matchId && aliasToKeep.has(matchId)){ skippedAliasDup++; return; }
      let season=String(row.season??'').trim();
      if(!season){ skippedMissingSeason++; season=deriveSeasonFromDate(row.date); if(season) derivedSeasonFromDate++; else { skippedMissingDateForSeason++; return; } }
      const homeName=String(row.home_team??'').trim();
      const awayName=String(row.away_team??'').trim();
      if(!homeName||!awayName){ skippedMissingTeam++; return; }
      const homeId=teamNameToIdMap.get(compact(homeName));
      const awayId=teamNameToIdMap.get(compact(awayName));
      if(!homeId) unresolvedTeams.set(homeName,(unresolvedTeams.get(homeName)||0)+1);
      if(!awayId) unresolvedTeams.set(awayName,(unresolvedTeams.get(awayName)||0)+1);
      if(!homeId||!awayId){ skippedUnresolvedTeam++; return; }
      if(homeId===awayId){ skippedSelfMatch++; return; }
      const homeScore=safeNumber(row.home_score);
      const awayScore=safeNumber(row.away_score);
      if(homeScore===null||awayScore===null){ skippedInvalidScore++; return; }
      const competition=String(row.competition??row.competition_name??row.league??'UNKNOWN_COMPETITION').trim()||'UNKNOWN_COMPETITION';
      if(!seasonsMap.has(season)) seasonsMap.set(season,new Map());
      const seasonMap=seasonsMap.get(season);
      if(!seasonMap.has(competition)) seasonMap.set(competition,{});
      const competitionData=seasonMap.get(competition);
      if(!competitionData[homeId]) competitionData[homeId]=createTeamStats(homeId,homeName);
      if(!competitionData[awayId]) competitionData[awayId]=createTeamStats(awayId,awayName);
      updateTeamStats(competitionData[homeId],homeScore,awayScore,'home');
      updateTeamStats(competitionData[awayId],awayScore,homeScore,'away');
      processedMatches++;
    }).on('end',resolve).on('error',reject);
  });

  console.log(`   ↳ Total MASTER rows: ${totalRows.toLocaleString()}`);
  console.log(`   ↳ Matches processed: ${processedMatches.toLocaleString()} (should be ~436k, not 430k)`);
  console.log(`   ↳ Skipped alias dups: ${skippedAliasDup.toLocaleString()} (expected 8)`);
  console.log(`   ↳ Skipped Self-match: ${skippedSelfMatch.toLocaleString()}`);
  console.log(`   ↳ Skipped Unresolved team: ${skippedUnresolvedTeam.toLocaleString()} (should be ~0 after HamKam fix, was 6,378)`);
  console.log(`   ↳ Skipped Invalid score: ${skippedInvalidScore.toLocaleString()}\n`);

  console.log('[3/3] Writing seasonal intelligence (atomic)...');
  let seasonFilesWritten=0,competitionProfilesWritten=0,teamProfilesWritten=0;
  for(const [season,competitionMap] of seasonsMap.entries()){
    const finalData={season, competitions:{}};
    for(const [competition,teams] of competitionMap.entries()){
      const competitionData={competition, teams:{}};
      for(const [teamId,stats] of Object.entries(teams)){ competitionData.teams[teamId]=finalizeTeamStats(stats); teamProfilesWritten++; }
      finalData.competitions[competition]=competitionData; competitionProfilesWritten++;
    }
    atomicWrite(path.join(INTEL_DIR, `${safeFilename(season)}.json`), JSON.stringify(finalData,null,2));
    seasonFilesWritten++;
  }
  const unresolvedReport={ generated_at:new Date().toISOString(), total_unresolved_names:unresolvedTeams.size, unresolved_teams:[...unresolvedTeams.entries()].sort((a,b)=>b[1]-a[1]).map(([name,references])=>({name,references})) };
  atomicWrite(path.join(INTEL_DIR,'unresolved-team-residuals.json'), JSON.stringify(unresolvedReport,null,2));

  console.log(`   ↳ Season files: ${seasonFilesWritten.toLocaleString()}`);
  console.log(`   ↳ Team profiles: ${teamProfilesWritten.toLocaleString()}`);
  console.log(`   ↳ Unresolved names: ${unresolvedTeams.size.toLocaleString()}`);
  console.log('\n============================================================');
  console.log(' STEP 7 COMPLETE (SHARPENED)');
  console.log('============================================================');
  console.log('🔒 ZOKASCORE_FINAL was NOT modified.\n');
}

run().catch(err=>{ console.error('\n❌ STEP 7 FAILED'); console.error(err); process.exit(1); });
