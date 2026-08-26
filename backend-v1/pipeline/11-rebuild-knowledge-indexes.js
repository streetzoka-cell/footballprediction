
'use strict';
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'source', 'ZOKASCORE_FINAL');
const INDEX_DIR = path.join(ROOT, 'data', 'indexes');
const INTEL_DIR = path.join(ROOT, 'data', 'intelligence');
const OUT_DIR = path.join(INTEL_DIR, 'indexes');
const TEMP_DIR = path.join(INTEL_DIR, '.indexes_step11_tmp');
const MASTER_FILE = path.join(DATA_DIR, 'ZOKASCORE_PUBLIC_MASTER.csv');
const TEAMS_INDEX_FILE = path.join(INDEX_DIR, 'teams-index.json');
const PLAYERS_INDEX_FILE = path.join(INDEX_DIR, 'players-index.json');
const PLAYER_INTEL_FILE = path.join(INTEL_DIR, 'player-intelligence-index.json');
const FIX_PROPOSAL_PATH = path.join(ROOT, 'data_audit','canonical_gate','fix-proposals.json');
function ensureDir(dir){ if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true}); }
function removeDir(dir){ if(!fs.existsSync(dir)) return; fs.rmSync(dir,{recursive:true,force:true}); }
function readJson(fp){ if(!fs.existsSync(fp)) throw new Error(`Required file not found: ${fp}`); return JSON.parse(fs.readFileSync(fp,'utf8')); }
function clean(v){ return String(v??'').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ').replace(/[.\'’‘`"]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim(); }
function compact(v){ return clean(v).replace(/\s+/g,''); }
function safeNumber(v){ if(v===undefined||v===null||String(v).trim()==='') return null; const n=Number(v); return Number.isFinite(n)?n:null; }
function deriveSeasonFromDate(v){ const d=String(v??'').trim(); if(!d) return null; const m=d.match(/^(\d{4})/); return m?m[1]:null; }
function atomicWriteJson(dir, filename, data){ fs.writeFileSync(path.join(dir, filename), JSON.stringify(data), 'utf8'); }
async function run(){
    console.log('============================================================');
    console.log(' ZOKASCORE V2 — STEP 11: CANONICAL INDEX BUILDING (KEEP-FIRST FIXED)');
    console.log('============================================================\n');
    console.log('[1/4] Loading canonical team index...');
    const teamsIndex = readJson(TEAMS_INDEX_FILE);
    const teamNameToIds = new Map();
    for(const [teamId, profile] of Object.entries(teamsIndex)){
        const name = profile?.name; if(!name) continue;
        const normalized = compact(name); if(!normalized) continue;
        if(!teamNameToIds.has(normalized)) teamNameToIds.set(normalized, []);
        teamNameToIds.get(normalized).push(teamId);
    }
    const teamNameToIdMap = new Map();
    let ambiguousTeamNames=0;
    for(const [name, ids] of teamNameToIds.entries()){
        if(ids.length===1){ teamNameToIdMap.set(name, ids[0]); }
        else { ambiguousTeamNames++; const keep=ids[0]; teamNameToIdMap.set(name, keep); console.log(`[INDEX-11] KEEP-FIRST: ${keep} for "${name}" duplicates: ${ids.join(',')}`); }
    }
    console.log(`   ↳ Canonical teams: ${Object.keys(teamsIndex).length.toLocaleString()}`);
    console.log(`   ↳ Unambiguous names: ${teamNameToIdMap.size.toLocaleString()} | Ambiguous keep-first: ${ambiguousTeamNames.toLocaleString()}\n`);
    console.log('[2/4] Building canonical match indexes from MASTER...');
    let aliasToKeep=new Map();
    if(fs.existsSync(FIX_PROPOSAL_PATH)){ try{ const fp=JSON.parse(fs.readFileSync(FIX_PROPOSAL_PATH,'utf8')); for(const g of fp.duplicate_match_ids||[]){ for(const id of g.ids){ if(id!==g.keep) aliasToKeep.set(id,g.keep); } } console.log(`[INDEX-11] Loaded ${fp.duplicate_match_ids?.length||0} duplicate groups - skipping ${aliasToKeep.size} alias IDs`); }catch(e){} }
    const matchIndex={}; const teamMatchIndex={}; const h2hIndex={}; const competitionIndex={}; const seasonIndex={};
    let masterRows=0, indexedMatches=0, duplicateIds=0, skippedUnresolved=0, skippedSelfMatch=0, skippedInvalidScore=0, skippedMissingId=0, aliasSkipped=0;
    await new Promise((resolve,reject)=>{
        fs.createReadStream(MASTER_FILE).pipe(csv()).on('data', row=>{
            masterRows++;
            const matchId = String(row.zokascore_match_id ?? '').trim();
            if(!matchId){ skippedMissingId++; return; }
            if(aliasToKeep.has(matchId)){ aliasSkipped++; return; }
            if(Object.prototype.hasOwnProperty.call(matchIndex, matchId)){ duplicateIds++; return; }
            const date = String(row.date ?? '').trim();
            const homeName = String(row.home_team ?? '').trim();
            const awayName = String(row.away_team ?? '').trim();
            const competition = String(row.competition ?? 'UNKNOWN_COMPETITION').trim() || 'UNKNOWN_COMPETITION';
            let season = String(row.season ?? '').trim();
            if(!season) season = deriveSeasonFromDate(date);
            if(!season) season = 'UNKNOWN_SEASON';
            const homeId = teamNameToIdMap.get(compact(homeName));
            const awayId = teamNameToIdMap.get(compact(awayName));
            if(!homeId || !awayId){ skippedUnresolved++; return; }
            if(homeId===awayId){ skippedSelfMatch++; return; }
            const homeScore = safeNumber(row.home_score);
            const awayScore = safeNumber(row.away_score);
            if(homeScore===null || awayScore===null){ skippedInvalidScore++; return; }
            matchIndex[matchId] = { date, home_team_id:homeId, away_team_id:awayId, home_score:homeScore, away_score:awayScore, competition, season };
            if(!teamMatchIndex[homeId]) teamMatchIndex[homeId]=[]; teamMatchIndex[homeId].push(matchId);
            if(!teamMatchIndex[awayId]) teamMatchIndex[awayId]=[]; teamMatchIndex[awayId].push(matchId);
            const sortedTeams=[homeId,awayId].sort(); const h2hKey=`${sortedTeams[0]}_vs_${sortedTeams[1]}`;
            if(!h2hIndex[h2hKey]) h2hIndex[h2hKey]=[]; h2hIndex[h2hKey].push(matchId);
            if(!competitionIndex[competition]) competitionIndex[competition]=[]; competitionIndex[competition].push(matchId);
            if(!seasonIndex[season]) seasonIndex[season]=[]; seasonIndex[season].push(matchId);
            indexedMatches++;
        }).on('end',resolve).on('error',reject);
    });
    console.log(`   ↳ MASTER rows scanned: ${masterRows.toLocaleString()}`);
    console.log(`   ↳ Matches indexed: ${indexedMatches.toLocaleString()} (should be 436,433)`);
    console.log(`   ↳ Skipped alias dup: ${aliasSkipped} | Missing ID: ${skippedMissingId} | Unresolved: ${skippedUnresolved} ${skippedUnresolved===0?'✅':''} | Self: ${skippedSelfMatch} | Invalid: ${skippedInvalidScore}\n`);
    if(duplicateIds>0) throw new Error(`STEP 11 duplicate IDs: ${duplicateIds}`);
    const reconstructedTotal = indexedMatches + skippedUnresolved + skippedSelfMatch + skippedInvalidScore + skippedMissingId + aliasSkipped;
    if(reconstructedTotal !== masterRows) throw new Error(`Accounting failure: ${reconstructedTotal} != ${masterRows}`);
    console.log(`   ✅ Match population verified: ${indexedMatches.toLocaleString()} matches.\n`);
    console.log('[3/4] Building player and canonical team indexes...');
    const playersIndex = readJson(PLAYERS_INDEX_FILE);
    const playerIntel = readJson(PLAYER_INTEL_FILE);
    const playersManifest=[];
    for(const [playerId, profile] of Object.entries(playersIndex)){
        const intel = playerIntel[playerId] || {};
        playersManifest.push({ player_id:playerId, name:profile.name||'Unknown', total_goals:Number(intel.goals||0), total_appearances:Number(intel.appearances||0) });
    }
    playersManifest.sort((a,b)=>b.total_goals-a.total_goals);
    const playerIndexOutput={ total_players:playersManifest.length, players:playersManifest };
    const canonicalTeamIndex={};
    for(const [teamId, profile] of Object.entries(teamsIndex)){
        canonicalTeamIndex[teamId]={ name:profile.name||'Unknown', country:profile.country??null, stadium:profile.stadium??null };
    }
    console.log(`   ↳ Players: ${playersManifest.length.toLocaleString()} | Teams: ${Object.keys(canonicalTeamIndex).length.toLocaleString()}\n`);
    console.log('[4/4] Writing indexes atomically...');
    removeDir(TEMP_DIR); ensureDir(TEMP_DIR);
    atomicWriteJson(TEMP_DIR,'match_index.json',matchIndex);
    atomicWriteJson(TEMP_DIR,'team_match_index.json',teamMatchIndex);
    atomicWriteJson(TEMP_DIR,'h2h_index.json',h2hIndex);
    atomicWriteJson(TEMP_DIR,'competition_index.json',competitionIndex);
    atomicWriteJson(TEMP_DIR,'season_index.json',seasonIndex);
    atomicWriteJson(TEMP_DIR,'players_index.json',playerIndexOutput);
    atomicWriteJson(TEMP_DIR,'canonical_team_index.json',canonicalTeamIndex);
    removeDir(OUT_DIR); fs.renameSync(TEMP_DIR, OUT_DIR);
    console.log('\n============================================================');
    console.log(' STEP 11 COMPLETE: PASS');
    console.log('============================================================');
    console.log(`Matches Indexed: ${Object.keys(matchIndex).length.toLocaleString()} ✅`);
    console.log(`Teams Indexed: ${Object.keys(teamMatchIndex).length.toLocaleString()} ✅`);
    console.log(`H2H Pairs: ${Object.keys(h2hIndex).length.toLocaleString()} ✅`);
    console.log('============================================================\n');
}
run().catch(err=>{ console.error('\n❌ STEP 11 FAILED'); console.error(err.message); removeDir(TEMP_DIR); process.exit(1); });
