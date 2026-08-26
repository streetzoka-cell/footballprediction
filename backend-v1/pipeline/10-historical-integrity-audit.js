'use strict';
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'source', 'ZOKASCORE_FINAL');
const INDEX_DIR = path.join(ROOT, 'data', 'indexes');
const INTEL_DIR = path.join(ROOT, 'data', 'intelligence');
const SEASONAL_DIR = path.join(INTEL_DIR, 'seasonal');
const AUDIT_DIR = path.join(ROOT, 'data_audit');
const MASTER_FILE = path.join(DATA_DIR, 'ZOKASCORE_PUBLIC_MASTER.csv');
const APPEARANCES_FILE = path.join(DATA_DIR, 'ZOKASCORE_APPEARANCES.csv');
const TEAMS_INDEX_FILE = path.join(INDEX_DIR, 'teams-index.json');
const CROSSWALK_FILE = path.join(INDEX_DIR, 'match-id-crosswalk.json');
const TEAM_INTEL_FILE = path.join(INTEL_DIR, 'team-intelligence-index.json');
const H2H_INTEL_FILE = path.join(INTEL_DIR, 'h2h-intelligence-index.json');
const PLAYER_INTEL_FILE = path.join(INTEL_DIR, 'player-intelligence-index.json');
const FIX_PROPOSAL_PATH = path.join(ROOT, 'data_audit','canonical_gate','fix-proposals.json');
function ensureDir(dir){ if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true}); }
function readJson(fp){ if(!fs.existsSync(fp)) throw new Error(`Required file not found: ${fp}`); return JSON.parse(fs.readFileSync(fp,'utf8')); }
function clean(v){ return String(v??'').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ').replace(/[.\'’‘`"]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim(); }
function compact(v){ return clean(v).replace(/\s+/g,''); }
function safeNumber(v){ if(v===undefined||v===null||String(v).trim()==='') return null; const n=Number(v); return Number.isFinite(n)?n:null; }
function normalizeId(v){ const s=String(v??'').trim(); return s||null; }
function safeFilename(v){ return String(v).replace(/[<>:"/\\|?*\x00-\x1F]/g,'_').replace(/[. ]+$/g,'').trim()||'unknown'; }
function deriveSeasonFromDate(v){ const d=String(v??'').trim(); if(!d) return null; const m=d.match(/^(\d{4})/); return m?m[1]:null; }
function createTeamStats(){ return { matches:0,wins:0,draws:0,losses:0,goals_for:0,goals_against:0 }; }
function createH2HStats(){ return { matches:0,team_a_wins:0,team_b_wins:0,draws:0 }; }
function createPlayerStats(){ return { appearances:0,goals:0,assists:0,yellow_cards:0,red_cards:0 }; }
function compareStats(exp,act,fields){ const diffs=[]; for(const f of fields){ const ev=Number(exp?.[f]??0); const av=Number(act?.[f]??0); if(ev!==av) diffs.push({field:f,expected:ev,actual:av}); } return diffs; }
function getCanonicalTeamId(row, side, teamNameToIds, teamNameToIdMap){
    const idCandidates = side==='home' ? [row.home_team_id, row.home_canonical_team_id, row.homeTeamId] : [row.away_team_id, row.away_canonical_team_id, row.awayTeamId];
    for(const cand of idCandidates){ const id=normalizeId(cand); if(id) return {id, source:'canonical_id'}; }
    const name = side==='home' ? normalizeId(row.home_team) : normalizeId(row.away_team);
    if(!name) return {id:null, source:'missing'};
    const key = compact(name);
    if(teamNameToIdMap.has(key)){
        return {id: teamNameToIdMap.get(key), source:'name'};
    }
    const ids = teamNameToIds.get(key) || [];
    if(ids.length>1){
        const keep = ids[0];
        return {id: keep, source:'ambiguous_keep_first', name};
    }
    return {id:null, source:'unknown_name', name};
}
async function run(){
    console.log('============================================================');
    console.log(' ZOKASCORE V2 — STEP 10: HISTORICAL INTEGRITY AUDIT (KEEP-FIRST FIXED)');
    console.log('============================================================\n');
    ensureDir(AUDIT_DIR);
    const failures=[]; const warnings=[];
    const forensic={ orphan_team_ids:new Set(), orphan_team_names:new Set(), ambiguous_team_names:new Set(), missing_team_intelligence:new Set(), extra_team_intelligence:new Set(), missing_h2h_intelligence:new Set(), extra_h2h_intelligence:new Set(), missing_player_intelligence:new Set(), extra_player_intelligence:new Set(), missing_season_files:new Set(), missing_season_competitions:new Set(), unknown_appearance_match_ids:new Set(), missing_appearance_player_ids:new Set(), duplicate_master_match_ids:new Set(), missing_master_match_ids:0, missing_dates:0, unresolved_team_name_rows:0, invalid_score_rows:0, self_match_rows:0 };
    console.log('[1/6] Loading canonical indexes and intelligence artifacts...');
    const teamsIndex = readJson(TEAMS_INDEX_FILE);
    const crosswalk = readJson(CROSSWALK_FILE);
    const teamIntel = readJson(TEAM_INTEL_FILE);
    const h2hIntel = readJson(H2H_INTEL_FILE);
    const playerIntel = readJson(PLAYER_INTEL_FILE);
    let aliasToKeep=new Map();
    if(fs.existsSync(FIX_PROPOSAL_PATH)){ try{ const fp=JSON.parse(fs.readFileSync(FIX_PROPOSAL_PATH,'utf8')); for(const g of fp.duplicate_match_ids||[]){ for(const id of g.ids){ if(id!==g.keep) aliasToKeep.set(id,g.keep); } } console.log(`[INTEL-10] Loaded ${fp.duplicate_match_ids?.length||0} duplicate groups - aliasMap size ${aliasToKeep.size}`); }catch(e){} }
    console.log(`   ↳ Canonical teams indexed: ${Object.keys(teamsIndex).length.toLocaleString()}`);
    console.log(`   ↳ Crosswalk mappings: ${Object.keys(crosswalk).length.toLocaleString()}`);
    console.log(`   ↳ Team intelligence records: ${Object.keys(teamIntel).length.toLocaleString()}`);
    console.log(`   ↳ H2H intelligence records: ${Object.keys(h2hIntel).length.toLocaleString()}`);
    console.log(`   ↳ Player intelligence records: ${Object.keys(playerIntel).length.toLocaleString()}\n`);
    const canonicalTeamIds = new Set();
    const teamNameToIds = new Map();
    for(const [id, profile] of Object.entries(teamsIndex)){
        const canonicalId = normalizeId(profile?.canonical_id || profile?.team_id || id);
        if(!canonicalId) continue;
        canonicalTeamIds.add(canonicalId);
        const name = profile?.name || profile?.team_name || '';
        const nameKey = compact(name);
        if(!nameKey) continue;
        if(!teamNameToIds.has(nameKey)) teamNameToIds.set(nameKey, []);
        const ids = teamNameToIds.get(nameKey);
        if(!ids.includes(canonicalId)) ids.push(canonicalId);
    }
    const teamNameToIdMap = new Map();
    let ambiguousCount=0;
    for(const [key, ids] of teamNameToIds.entries()){
        if(ids.length===1){ teamNameToIdMap.set(key, ids[0]); }
        else { ambiguousCount++; const keep=ids[0]; teamNameToIdMap.set(key, keep); console.log(`[AUDIT-10] KEEP-FIRST: ${keep} for "${key}" duplicates: ${ids.join(',')}`); }
    }
    console.log(`   ↳ Unique name mappings: ${teamNameToIdMap.size.toLocaleString()} | Ambiguous keep-first: ${ambiguousCount}\n`);
    const crosswalkMap = new Map();
    for(const [sourceId, targetId] of Object.entries(crosswalk)){ const s=normalizeId(sourceId); const t=normalizeId(targetId); if(!s||!t) continue; crosswalkMap.set(s,t); }
    const masterMatchIds = new Set();
    const localTeamStats = new Map();
    const localH2HStats = new Map();
    const localSeasonalStats = new Map();
    const localPlayerStats = new Map();
    let masterRows=0, masterRowsUsed=0, masterRowsSkipped=0;
    let appearanceRows=0, appearanceRowsUsed=0, appearanceRowsSkipped=0;
    console.log('[2/6] Reconstructing canonical Team, H2H, and Seasonal statistics from MASTER...');
    await new Promise((resolve,reject)=>{
        if(!fs.existsSync(MASTER_FILE)){ reject(new Error(`MASTER file not found: ${MASTER_FILE}`)); return; }
        fs.createReadStream(MASTER_FILE).pipe(csv()).on('data', row=>{
            masterRows++;
            const matchId = normalizeId(row.zokascore_match_id);
            if(!matchId){ forensic.missing_master_match_ids++; failures.push(`MASTER row ${masterRows} has no match_id`); return; }
            if(aliasToKeep.has(matchId)){ masterRowsSkipped++; return; }
            if(masterMatchIds.has(matchId)){ forensic.duplicate_master_match_ids.add(matchId); failures.push(`Duplicate MASTER match_id: ${matchId}`); return; }
            masterMatchIds.add(matchId);
            const date = normalizeId(row.date);
            if(!date){ forensic.missing_dates++; failures.push(`MASTER row ${masterRows} missing date for match ${matchId}`); return; }
            const home = getCanonicalTeamId(row,'home',teamNameToIds, teamNameToIdMap);
            const away = getCanonicalTeamId(row,'away',teamNameToIds, teamNameToIdMap);
            if(!home.id || !away.id){
                forensic.unresolved_team_name_rows++;
                if(home.source==='unknown_name') forensic.orphan_team_names.add(home.name);
                if(away.source==='unknown_name') forensic.orphan_team_names.add(away.name);
                if(home.source.includes('ambiguous')) forensic.ambiguous_team_names.add(home.name);
                if(away.source.includes('ambiguous')) forensic.ambiguous_team_names.add(away.name);
                return;
            }
            if(!canonicalTeamIds.has(home.id)) forensic.orphan_team_ids.add(home.id);
            if(!canonicalTeamIds.has(away.id)) forensic.orphan_team_ids.add(away.id);
            const homeScore = safeNumber(row.home_score);
            const awayScore = safeNumber(row.away_score);
            if(homeScore===null || awayScore===null || homeScore<0 || awayScore<0){ forensic.invalid_score_rows++; return; }
            if(home.id===away.id){ forensic.self_match_rows++; return; }
            let season = normalizeId(row.season);
            if(!season) season = deriveSeasonFromDate(date);
            if(!season) return;
            masterRowsUsed++;
            if(!localTeamStats.has(home.id)) localTeamStats.set(home.id, createTeamStats());
            if(!localTeamStats.has(away.id)) localTeamStats.set(away.id, createTeamStats());
            const homeStats = localTeamStats.get(home.id);
            const awayStats = localTeamStats.get(away.id);
            homeStats.matches++; homeStats.goals_for+=homeScore; homeStats.goals_against+=awayScore;
            awayStats.matches++; awayStats.goals_for+=awayScore; awayStats.goals_against+=homeScore;
            if(homeScore>awayScore){ homeStats.wins++; awayStats.losses++; } else if(homeScore<awayScore){ awayStats.wins++; homeStats.losses++; } else { homeStats.draws++; awayStats.draws++; }
            const [teamA, teamB] = [home.id, away.id].sort();
            const h2hKey = `${teamA}_vs_${teamB}`;
            if(!localH2HStats.has(h2hKey)) localH2HStats.set(h2hKey, createH2HStats());
            const h2h = localH2HStats.get(h2hKey);
            h2h.matches++;
            if(homeScore>awayScore){ if(home.id===teamA) h2h.team_a_wins++; else h2h.team_b_wins++; } else if(awayScore>homeScore){ if(away.id===teamA) h2h.team_a_wins++; else h2h.team_b_wins++; } else { h2h.draws++; }
            const competition = normalizeId(row.competition || row.competition_name || row.league) || 'UNKNOWN_COMPETITION';
            if(!localSeasonalStats.has(season)) localSeasonalStats.set(season, new Map());
            const seasonMap = localSeasonalStats.get(season);
            if(!seasonMap.has(competition)) seasonMap.set(competition, new Map());
            const competitionMap = seasonMap.get(competition);
            if(!competitionMap.has(home.id)) competitionMap.set(home.id, createTeamStats());
            if(!competitionMap.has(away.id)) competitionMap.set(away.id, createTeamStats());
            const homeSeason = competitionMap.get(home.id);
            const awaySeason = competitionMap.get(away.id);
            homeSeason.matches++; homeSeason.goals_for+=homeScore; homeSeason.goals_against+=awayScore;
            awaySeason.matches++; awaySeason.goals_for+=awayScore; awaySeason.goals_against+=homeScore;
            if(homeScore>awayScore){ homeSeason.wins++; awaySeason.losses++; } else if(homeScore<awayScore){ awaySeason.wins++; homeSeason.losses++; } else { homeSeason.draws++; awaySeason.draws++; }
        }).on('end',resolve).on('error',reject);
    });
    masterRowsSkipped = masterRows - masterRowsUsed;
    console.log(`   ↳ MASTER rows: ${masterRows.toLocaleString()}`);
    console.log(`   ↳ Unique MASTER Match IDs: ${masterMatchIds.size.toLocaleString()}`);
    console.log(`   ↳ Rows used for reconstruction: ${masterRowsUsed.toLocaleString()}`);
    console.log(`   ↳ Rows excluded (alias dup + invalid): ${masterRowsSkipped.toLocaleString()}\n`);
    console.log('[3/6] Reconstructing Player statistics from APPEARANCES...');
    await new Promise((resolve,reject)=>{
        if(!fs.existsSync(APPEARANCES_FILE)){ reject(new Error(`APPEARANCES file not found: ${APPEARANCES_FILE}`)); return; }
        fs.createReadStream(APPEARANCES_FILE).pipe(csv()).on('data', row=>{
            appearanceRows++;
            const sourceMatchId = normalizeId(row.zokascore_match_id);
            if(!sourceMatchId){ appearanceRowsSkipped++; return; }
            const canonicalMatchId = crosswalkMap.get(sourceMatchId) || sourceMatchId;
            if(aliasToKeep.has(canonicalMatchId)) return;
            if(!masterMatchIds.has(canonicalMatchId)){ forensic.unknown_appearance_match_ids.add(sourceMatchId); appearanceRowsSkipped++; return; }
            const playerId = normalizeId(row.zokascore_player_id || row.player_id);
            if(!playerId){ forensic.missing_appearance_player_ids.add(sourceMatchId); appearanceRowsSkipped++; return; }
            if(!localPlayerStats.has(playerId)) localPlayerStats.set(playerId, createPlayerStats());
            const player = localPlayerStats.get(playerId);
            player.appearances++;
            player.goals += safeNumber(row.goals) ?? 0;
            player.assists += safeNumber(row.assists) ?? 0;
            player.yellow_cards += safeNumber(row.yellow_cards) ?? 0;
            player.red_cards += safeNumber(row.red_cards) ?? 0;
            appearanceRowsUsed++;
        }).on('end',resolve).on('error',reject);
    });
    console.log(`   ↳ APPEARANCES rows: ${appearanceRows.toLocaleString()}`);
    console.log(`   ↳ Rows used: ${appearanceRowsUsed.toLocaleString()}`);
    console.log(`   ↳ Rows excluded: ${appearanceRowsSkipped.toLocaleString()}\n`);
    console.log('[4/6] Comparing independent reconstruction against intelligence artifacts...');
    let mismatchCount=0; const mismatchSamples=[];
    function recordMismatch(msg, details=null){ mismatchCount++; if(mismatchSamples.length<100) mismatchSamples.push({message:msg, details}); }
    console.log('   ↳ Validating Team Intelligence...');
    for(const [teamId, local] of localTeamStats.entries()){
        const generated = teamIntel[teamId];
        if(!generated){ forensic.missing_team_intelligence.add(teamId); recordMismatch(`Team ${teamId} missing from team intelligence`); continue; }
        const diffs = compareStats(local, generated, ['matches','wins','draws','losses','goals_for','goals_against']);
        if(diffs.length) recordMismatch(`Team ${teamId} statistics mismatch`, diffs);
    }
    for(const teamId of Object.keys(teamIntel)){
        if(!localTeamStats.has(teamId)){ forensic.extra_team_intelligence.add(teamId); recordMismatch(`Team intelligence ${teamId} has no reconstructed MASTER statistics`); }
    }
    console.log('   ↳ Validating H2H Intelligence...');
    for(const [key, local] of localH2HStats.entries()){
        const generated = h2hIntel[key];
        if(!generated){ forensic.missing_h2h_intelligence.add(key); recordMismatch(`H2H ${key} missing from intelligence`); continue; }
        const diffs = compareStats(local, generated, ['matches','team_a_wins','team_b_wins','draws']);
        if(diffs.length) recordMismatch(`H2H ${key} statistics mismatch`, diffs);
    }
    for(const key of Object.keys(h2hIntel)){
        if(!localH2HStats.has(key)){ forensic.extra_h2h_intelligence.add(key); recordMismatch(`H2H intelligence ${key} has no reconstructed MASTER statistics`); }
    }
    console.log('   ↳ Validating Player Intelligence...');
    for(const [playerId, local] of localPlayerStats.entries()){
        const generated = playerIntel[playerId];
        if(!generated){ forensic.missing_player_intelligence.add(playerId); recordMismatch(`Player ${playerId} missing from player intelligence`); continue; }
        const diffs = compareStats(local, generated, ['appearances','goals','assists','yellow_cards','red_cards']);
        if(diffs.length) recordMismatch(`Player ${playerId} statistics mismatch`, diffs);
    }
    console.log('   ↳ Validating Seasonal Intelligence...');
    let seasonalCompetitionsVerified=0; let seasonalTeamsVerified=0;
    for(const [season, competitionMap] of localSeasonalStats.entries()){
        const seasonFile = path.join(SEASONAL_DIR, `${safeFilename(season)}.json`);
        if(!fs.existsSync(seasonFile)){ forensic.missing_season_files.add(season); recordMismatch(`Season ${season} intelligence file missing`); continue; }
        let generatedSeason;
        try{ generatedSeason = JSON.parse(fs.readFileSync(seasonFile,'utf8')); }catch(e){ recordMismatch(`Season ${season} intelligence JSON invalid`, e.message); continue; }
        const generatedCompetitions = generatedSeason?.competitions;
        if(!generatedCompetitions || typeof generatedCompetitions!=='object'){ recordMismatch(`Season ${season} has invalid competitions structure`); continue; }
        for(const [competition, teamMap] of competitionMap.entries()){
            seasonalCompetitionsVerified++;
            const generatedCompetition = generatedCompetitions[competition];
            if(!generatedCompetition){ forensic.missing_season_competitions.add(`${season}/${competition}`); recordMismatch(`Competition ${competition} missing from season ${season}`); continue; }
            const generatedTeams = generatedCompetition.teams;
            if(!generatedTeams || typeof generatedTeams!=='object'){ recordMismatch(`Season ${season}/${competition} has invalid teams structure`); continue; }
            for(const [teamId, localStats] of teamMap.entries()){
                seasonalTeamsVerified++;
                const generatedStats = generatedTeams[teamId];
                if(!generatedStats){ recordMismatch(`Seasonal team ${season}/${competition}/${teamId} missing`); continue; }
                const diffs = compareStats(localStats, generatedStats, ['matches','wins','draws','losses','goals_for','goals_against']);
                if(diffs.length) recordMismatch(`Seasonal ${season}/${competition}/${teamId} mismatch`, diffs);
            }
        }
    }
    console.log('[5/6] Performing canonical historical integrity assessment...');
    const canonicalIntegrityFailures = forensic.duplicate_master_match_ids.size + forensic.missing_master_match_ids + forensic.missing_dates;
    const fatalIntegrityFailures = canonicalIntegrityFailures + mismatchCount;
    const status = fatalIntegrityFailures===0 ? 'PASS' : 'FAIL';
    console.log('[6/6] Generating historical integrity report...');
    const report = {
        generated_at:new Date().toISOString(),
        step:'10-historical-integrity-audit',
        status,
        processing:{master_rows:masterRows, master_unique_match_ids:masterMatchIds.size, master_rows_used:masterRowsUsed, master_rows_skipped:masterRowsSkipped, appearance_rows:appearanceRows, appearance_rows_used:appearanceRowsUsed, appearance_rows_skipped:appearanceRowsSkipped},
        validation:{teams_reconstructed:localTeamStats.size, h2h_reconstructed:localH2HStats.size, players_reconstructed:localPlayerStats.size, seasonal_competitions_verified:seasonalCompetitionsVerified, seasonal_team_records_verified:seasonalTeamsVerified, duplicate_master_match_ids:forensic.duplicate_master_match_ids.size, missing_master_match_ids:forensic.missing_master_match_ids, missing_dates:forensic.missing_dates, unresolved_team_name_rows:forensic.unresolved_team_name_rows, invalid_score_rows:forensic.invalid_score_rows, self_match_rows:forensic.self_match_rows, canonical_integrity_failures:canonicalIntegrityFailures, statistical_mismatches:mismatchCount, fatal_failures:fatalIntegrityFailures},
        forensic_findings:{orphan_team_ids:Array.from(forensic.orphan_team_ids).sort(), orphan_team_names:Array.from(forensic.orphan_team_names).sort(), ambiguous_team_names:Array.from(forensic.ambiguous_team_names).sort(), missing_team_intelligence:Array.from(forensic.missing_team_intelligence).sort(), extra_team_intelligence:Array.from(forensic.extra_team_intelligence).sort(), missing_h2h_intelligence:Array.from(forensic.missing_h2h_intelligence).sort(), extra_h2h_intelligence:Array.from(forensic.extra_h2h_intelligence).sort(), missing_player_intelligence:Array.from(forensic.missing_player_intelligence).sort(), extra_player_intelligence:Array.from(forensic.extra_player_intelligence).sort(), missing_season_files:Array.from(forensic.missing_season_files).sort(), missing_season_competitions:Array.from(forensic.missing_season_competitions).sort(), unknown_appearance_match_ids:Array.from(forensic.unknown_appearance_match_ids).sort(), missing_appearance_player_ids:Array.from(forensic.missing_appearance_player_ids).sort()},
        diagnostics:{failures:failures.slice(0,500), warnings:warnings.slice(0,500), mismatch_samples:mismatchSamples},
        source_files_modified:false
    };
    const reportPath = path.join(AUDIT_DIR,'historical-integrity-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report,null,2),'utf8');
    console.log('\n============================================================');
    console.log(` STEP 10 HISTORICAL INTEGRITY COMPLETE: ${status}`);
    console.log('============================================================');
    console.log(`MASTER rows                    : ${masterRows.toLocaleString()}`);
    console.log(`Unique MASTER Match IDs        : ${masterMatchIds.size.toLocaleString()}`);
    console.log(`Rows used                      : ${masterRowsUsed.toLocaleString()} (should be 436,433)`);
    console.log(`Teams reconstructed            : ${localTeamStats.size.toLocaleString()} (should be 9,715)`);
    console.log(`H2H reconstructed              : ${localH2HStats.size.toLocaleString()}`);
    console.log(`Players reconstructed          : ${localPlayerStats.size.toLocaleString()}`);
    console.log(`Statistical mismatches         : ${mismatchCount.toLocaleString()} ${mismatchCount===0?'✅':''}`);
    console.log(`Unresolved team name rows      : ${forensic.unresolved_team_name_rows.toLocaleString()} ${forensic.unresolved_team_name_rows===0?'✅':''}`);
    console.log(`\n📁 Audit report: ${reportPath}`);
    if(mismatchCount===0) console.log('\n✅ Independent statistical reconstruction matches generated artifacts.');
    console.log('\n🔒 Canonical source files were NOT modified.');
    console.log('============================================================\n');
    if(status==='FAIL') process.exitCode=1;
}
run().catch(e=>{ console.error('\n❌ STEP 10 FAILED'); console.error(e); process.exit(1); });