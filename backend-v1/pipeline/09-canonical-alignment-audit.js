
'use strict';
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'source', 'ZOKASCORE_FINAL');
const INDEX_DIR = path.join(ROOT, 'data', 'indexes');
const AUDIT_DIR = path.join(ROOT, 'data_audit');
const MASTER_FILE = path.join(DATA_DIR, 'ZOKASCORE_PUBLIC_MASTER.csv');
const APPEARANCES_FILE = path.join(DATA_DIR, 'ZOKASCORE_APPEARANCES.csv');
const EVENTS_FILE = path.join(DATA_DIR, 'ZOKASCORE_EVENTS.csv');
const TEAMS_INDEX_FILE = path.join(INDEX_DIR, 'teams-index.json');
const PLAYERS_INDEX_FILE = path.join(INDEX_DIR, 'players-index.json');
const CROSSWALK_FILE = path.join(INDEX_DIR, 'match-id-crosswalk.json');
const REPORT_FILE = path.join(AUDIT_DIR, 'canonical_alignment_report.json');
function ensureDir(dir){ if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true}); }
function clean(value){ return String(value ?? '').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ').replace(/[.\'’‘`"]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim(); }
function compact(value){ return clean(value).replace(/\s+/g,''); }
function stringValue(value){ return String(value ?? '').trim(); }
function sortedObjectFromMap(map){ return Object.fromEntries([...map.entries()].sort((a,b)=>{ if(b[1]!==a[1]) return b[1]-a[1]; return String(a[0]).localeCompare(String(b[0])); })); }
function sortedArray(values){ return [...values].sort((a,b)=> String(a).localeCompare(String(b))); }
function incrementMap(map,key){ map.set(key,(map.get(key)||0)+1); }
function loadJson(file,label){ if(!fs.existsSync(file)) throw new Error(`${label} not found: ${file}`); try{ return JSON.parse(fs.readFileSync(file,'utf8')); }catch(err){ throw new Error(`Failed to parse ${label}: ${err.message}`); } }
function buildTeamIndex(teamsIndex){
  const teamIdSet = new Set(Object.keys(teamsIndex));
  const candidateMap = new Map();
  for(const [teamId, profile] of Object.entries(teamsIndex)){
    if(!profile||!profile.name) continue;
    const normalizedName = compact(profile.name);
    if(!normalizedName) continue;
    if(!candidateMap.has(normalizedName)) candidateMap.set(normalizedName, new Set());
    candidateMap.get(normalizedName).add(teamId);
  }
  const teamNameToIdMap = new Map();
  const ambiguousNames = new Map();
  for(const [normalizedName, ids] of candidateMap.entries()){
    if(ids.size===1){
      teamNameToIdMap.set(normalizedName, [...ids][0]);
    } else {
      const sortedIds = sortedArray(ids);
      const keep = sortedIds[0];
      teamNameToIdMap.set(normalizedName, keep);
      ambiguousNames.set(normalizedName, sortedIds);
      console.log(`[AUDIT-09] Team alias KEEP-FIRST: ${keep} for "${normalizedName}" duplicates: ${sortedIds.join(', ')}`);
    }
  }
  return { teamIdSet, teamNameToIdMap, ambiguousNames };
}
async function auditMaster(teamIndex){
  console.log('[2/4] Auditing MASTER alignment...');
  const masterMatchIdSet = new Set();
  const masterMatchIdCounts = new Map();
  const unresolvedHomeNames = new Map();
  const unresolvedAwayNames = new Map();
  const ambiguousHomeNames = new Map();
  const ambiguousAwayNames = new Map();
  const missingMatchIdRows = new Map();
  let rows=0, duplicateMatchIdRows=0;
  await new Promise((resolve,reject)=>{
    fs.createReadStream(MASTER_FILE).pipe(csv()).on('data', row=>{
      rows++;
      const matchId = stringValue(row.zokascore_match_id);
      if(!matchId){ incrementMap(missingMatchIdRows,'MISSING_MATCH_ID'); } else {
        const prev = masterMatchIdCounts.get(matchId)||0;
        masterMatchIdCounts.set(matchId, prev+1);
        if(prev>0) duplicateMatchIdRows++;
        masterMatchIdSet.add(matchId);
      }
      const homeName = stringValue(row.home_team);
      if(homeName){
        const normalized = compact(homeName);
        if(teamIndex.ambiguousNames.has(normalized)){
          // Now KEEP-FIRST, so not unresolved, but log as ambiguous keep-first (warning only)
          incrementMap(ambiguousHomeNames, homeName);
        } else if(!teamIndex.teamNameToIdMap.has(normalized)){
          incrementMap(unresolvedHomeNames, homeName);
        }
      }
      const awayName = stringValue(row.away_team);
      if(awayName){
        const normalized = compact(awayName);
        if(teamIndex.ambiguousNames.has(normalized)){
          incrementMap(ambiguousAwayNames, awayName);
        } else if(!teamIndex.teamNameToIdMap.has(normalized)){
          incrementMap(unresolvedAwayNames, awayName);
        }
      }
    }).on('end',resolve).on('error',reject);
  });
  const duplicateMatchIds = [...masterMatchIdCounts.entries()].filter(([,count])=>count>1).sort((a,b)=>b[1]-a[1]).map(([matchId,count])=>({match_id:matchId, occurrences:count}));
  const uniqueUnresolvedTeamNames = new Set([...unresolvedHomeNames.keys(), ...unresolvedAwayNames.keys()]);
  const uniqueAmbiguousTeamNames = new Set([...ambiguousHomeNames.keys(), ...ambiguousAwayNames.keys()]);
  console.log(`   ↳ MASTER rows: ${rows.toLocaleString()}`);
  console.log(`   ↳ Unique Master Match IDs: ${masterMatchIdSet.size.toLocaleString()}`);
  console.log(`   ↳ Missing Match IDs: ${missingMatchIdRows.size.toLocaleString()}`);
  console.log(`   ↳ Duplicate Match ID rows: ${duplicateMatchIdRows.toLocaleString()}`);
  console.log(`   ↳ Unresolved Team Names: ${uniqueUnresolvedTeamNames.size.toLocaleString()} ${uniqueUnresolvedTeamNames.size===0?'✅':''}`);
  console.log(`   ↳ Ambiguous Team Names (keep-first): ${uniqueAmbiguousTeamNames.size.toLocaleString()}\n`);
  return { rows, masterMatchIdSet, masterMatchIdCounts, duplicateMatchIds, duplicateMatchIdRows, missingMatchIdRows, unresolvedHomeNames, unresolvedAwayNames, ambiguousHomeNames, ambiguousAwayNames, uniqueUnresolvedTeamNames, uniqueAmbiguousTeamNames };
}
function auditCrosswalk(crosswalk, masterMatchIdSet){
  console.log('[3/4] Auditing match-ID crosswalk...');
  const entries = Object.entries(crosswalk);
  const sourceIdSet = new Set();
  const targetIdSet = new Set();
  const invalidTargetIds = new Map();
  const identityMappings = new Set();
  for(const [sourceId, targetIdRaw] of entries){
    const source = stringValue(sourceId);
    const target = stringValue(targetIdRaw);
    if(!source) continue;
    sourceIdSet.add(source);
    if(!target){ incrementMap(invalidTargetIds, source); continue; }
    targetIdSet.add(target);
    if(source===target) identityMappings.add(source);
    if(!masterMatchIdSet.has(target)) incrementMap(invalidTargetIds, target);
  }
  const validTargetCount = [...targetIdSet].filter(id=>masterMatchIdSet.has(id)).length;
  const invalidTargetCount = targetIdSet.size - validTargetCount;
  console.log(`   ↳ Crosswalk mappings: ${entries.length.toLocaleString()}`);
  console.log(`   ↳ Unique source IDs: ${sourceIdSet.size.toLocaleString()}`);
  console.log(`   ↳ Unique target IDs: ${targetIdSet.size.toLocaleString()}`);
  console.log(`   ↳ Targets present in MASTER: ${validTargetCount.toLocaleString()}`);
  console.log(`   ↳ Targets absent from MASTER: ${invalidTargetCount.toLocaleString()}`);
  console.log(`   ↳ Identity mappings: ${identityMappings.size.toLocaleString()}\n`);
  return { totalMappings:entries.length, sourceIdSet, targetIdSet, validTargetCount, invalidTargetCount, invalidTargetIds, identityMappings };
}
async function auditSecondaryDataset({file,label,masterMatchIdSet,crosswalk,playerIdSet,teamIdSet}){
  console.log(`Auditing ${label} alignment...`);
  const stats={rows:0,missingMatchIds:0,unknownMatchIds:0,missingPlayerIds:0,unknownPlayerIds:0,missingTeamIds:0,unknownTeamIds:0,resolvedViaCrosswalk:0,directCanonicalMatchIds:0};
  const unknownMatchIdRefs=new Map(); const unknownPlayerIdRefs=new Map(); const unknownTeamIdRefs=new Map();
  await new Promise((resolve,reject)=>{
    fs.createReadStream(file).pipe(csv()).on('data', row=>{
      stats.rows++;
      const secondaryMatchId = stringValue(row.zokascore_match_id);
      if(!secondaryMatchId){ stats.missingMatchIds++; } else {
        const mappedMatchId = stringValue(crosswalk[secondaryMatchId]);
        let canonicalMatchId;
        if(mappedMatchId){ canonicalMatchId=mappedMatchId; stats.resolvedViaCrosswalk++; } else { canonicalMatchId=secondaryMatchId; stats.directCanonicalMatchIds++; }
        if(!masterMatchIdSet.has(canonicalMatchId)){ stats.unknownMatchIds++; incrementMap(unknownMatchIdRefs, secondaryMatchId); }
      }
      const playerId = stringValue(row.zokascore_player_id);
      if(!playerId){ stats.missingPlayerIds++; } else if(!playerIdSet.has(playerId)){ stats.unknownPlayerIds++; incrementMap(unknownPlayerIdRefs, playerId); }
      const teamId = stringValue(row.zokascore_team_id);
      if(!teamId){ stats.missingTeamIds++; } else if(!teamIdSet.has(teamId)){ stats.unknownTeamIds++; incrementMap(unknownTeamIdRefs, teamId); }
    }).on('end',resolve).on('error',reject);
  });
  console.log(`   ↳ ${label} rows: ${stats.rows.toLocaleString()}`);
  console.log(`   ↳ Missing Match IDs: ${stats.missingMatchIds.toLocaleString()}`);
  console.log(`   ↳ Unknown Match references: ${stats.unknownMatchIds.toLocaleString()}`);
  console.log(`   ↳ Missing Player IDs: ${stats.missingPlayerIds.toLocaleString()}`);
  console.log(`   ↳ Unknown Player references: ${stats.unknownPlayerIds.toLocaleString()}`);
  console.log(`   ↳ Missing Team IDs: ${stats.missingTeamIds.toLocaleString()}`);
  console.log(`   ↳ Unknown Team references: ${stats.unknownTeamIds.toLocaleString()}`);
  console.log(`   ↳ Resolved via crosswalk: ${stats.resolvedViaCrosswalk.toLocaleString()}`);
  console.log(`   ↳ Direct canonical Match IDs: ${stats.directCanonicalMatchIds.toLocaleString()}\n`);
  return { stats, unknownMatchIdRefs, unknownPlayerIdRefs, unknownTeamIdRefs };
}
function calculateStatus({master,crosswalkAudit,appearances,events}){
  const failures=[]; const warnings=[];
  if(master.duplicateMatchIds.length>0) failures.push('MASTER contains duplicate Match IDs');
  if(master.missingMatchIdRows.size>0) failures.push('MASTER contains rows with missing Match IDs');
  if(crosswalkAudit.invalidTargetCount>0) failures.push('Crosswalk contains targets absent from MASTER');
  if(appearances.stats.unknownPlayerIds>0) failures.push('APPEARANCES contains unknown Player references');
  if(appearances.stats.unknownTeamIds>0) failures.push('APPEARANCES contains unknown Team references');
  if(events.stats.unknownPlayerIds>0) failures.push('EVENTS contains unknown Player references');
  if(events.stats.unknownTeamIds>0) failures.push('EVENTS contains unknown Team references');
  if(master.uniqueUnresolvedTeamNames.size>0) warnings.push(`MASTER contains ${master.uniqueUnresolvedTeamNames.size.toLocaleString()} unresolved team names.`);
  if(master.uniqueAmbiguousTeamNames.size>0) warnings.push(`MASTER contains ${master.uniqueAmbiguousTeamNames.size.toLocaleString()} ambiguous team names (keep-first applied).`);
  if(appearances.stats.unknownMatchIds>0) warnings.push(`APPEARANCES contains ${appearances.stats.unknownMatchIds.toLocaleString()} unknown Match references.`);
  if(events.stats.unknownMatchIds>0) warnings.push(`EVENTS contains ${events.stats.unknownMatchIds.toLocaleString()} unknown Match references.`);
  if(appearances.stats.missingTeamIds>0) warnings.push(`APPEARANCES contains ${appearances.stats.missingTeamIds.toLocaleString()} blank Team IDs.`);
  if(events.stats.missingTeamIds>0) warnings.push(`EVENTS contains ${events.stats.missingTeamIds.toLocaleString()} blank Team IDs.`);
  if(events.stats.missingPlayerIds>0) warnings.push(`EVENTS contains ${events.stats.missingPlayerIds.toLocaleString()} missing Player IDs.`);
  return { status: failures.length===0?'PASS':'FAIL', failures, warnings };
}
function buildReport({master,crosswalkAudit,appearances,events,teamIndex,playersIndex,statusResult}){
  return {
    generated_at:new Date().toISOString(),
    status:statusResult.status,
    failures:statusResult.failures,
    warnings:statusResult.warnings,
    canonical_indexes:{teams:teamIndex.teamIdSet.size, players:Object.keys(playersIndex).length, ambiguous_team_names:teamIndex.ambiguousNames.size},
    master:{rows:master.rows, unique_match_ids:master.masterMatchIdSet.size, missing_match_id_rows:master.missingMatchIdRows.size, duplicate_match_ids:master.duplicateMatchIds, unresolved_home_team_names:sortedObjectFromMap(master.unresolvedHomeNames), unresolved_away_team_names:sortedObjectFromMap(master.unresolvedAwayNames), ambiguous_home_team_names:sortedObjectFromMap(master.ambiguousHomeNames), ambiguous_away_team_names:sortedObjectFromMap(master.ambiguousAwayNames), unique_unresolved_team_names:master.uniqueUnresolvedTeamNames.size, unique_ambiguous_team_names:master.uniqueAmbiguousTeamNames.size},
    crosswalk:{total_mappings:crosswalkAudit.totalMappings, unique_source_ids:crosswalkAudit.sourceIdSet.size, unique_target_ids:crosswalkAudit.targetIdSet.size, targets_present_in_master:crosswalkAudit.validTargetCount, targets_absent_from_master:crosswalkAudit.invalidTargetCount, identity_mappings:crosswalkAudit.identityMappings.size, invalid_target_references:sortedObjectFromMap(crosswalkAudit.invalidTargetIds)},
    appearances:{rows:appearances.stats.rows, missing_match_ids:appearances.stats.missingMatchIds, unknown_match_references:appearances.stats.unknownMatchIds, missing_player_ids:appearances.stats.missingPlayerIds, unknown_player_references:appearances.stats.unknownPlayerIds, missing_team_ids:appearances.stats.missingTeamIds, unknown_team_references:appearances.stats.unknownTeamIds, resolved_via_crosswalk:appearances.stats.resolvedViaCrosswalk, direct_canonical_match_ids:appearances.stats.directCanonicalMatchIds, unknown_match_ids:sortedObjectFromMap(appearances.unknownMatchIdRefs), unknown_player_ids:sortedObjectFromMap(appearances.unknownPlayerIdRefs), unknown_team_ids:sortedObjectFromMap(appearances.unknownTeamIdRefs)},
    events:{rows:events.stats.rows, missing_match_ids:events.stats.missingMatchIds, unknown_match_references:events.stats.unknownMatchIds, missing_player_ids:events.stats.missingPlayerIds, unknown_player_references:events.stats.unknownPlayerIds, missing_team_ids:events.stats.missingTeamIds, unknown_team_references:events.stats.unknownTeamIds, resolved_via_crosswalk:events.stats.resolvedViaCrosswalk, direct_canonical_match_ids:events.stats.directCanonicalMatchIds, unknown_match_ids:sortedObjectFromMap(events.unknownMatchIdRefs), unknown_player_ids:sortedObjectFromMap(events.unknownPlayerIdRefs), unknown_team_ids:sortedObjectFromMap(events.unknownTeamIdRefs)},
  };
}
async function run(){
  console.log('============================================================');
  console.log(' ZOKASCORE V2 — STEP 9: CANONICAL ALIGNMENT AUDIT (KEEP-FIRST FIXED)');
  console.log('============================================================\n');
  ensureDir(AUDIT_DIR);
  console.log('[1/4] Loading canonical indexes...');
  const teamsIndex = loadJson(TEAMS_INDEX_FILE,'Teams index');
  const playersIndex = loadJson(PLAYERS_INDEX_FILE,'Players index');
  const crosswalk = loadJson(CROSSWALK_FILE,'Match-ID crosswalk');
  const teamIndex = buildTeamIndex(teamsIndex);
  const playerIdSet = new Set(Object.keys(playersIndex));
  console.log(`   ↳ Canonical teams indexed: ${teamIndex.teamIdSet.size.toLocaleString()}`);
  console.log(`   ↳ Canonical players indexed: ${playerIdSet.size.toLocaleString()}`);
  console.log(`   ↳ Ambiguous canonical team names (keep-first): ${teamIndex.ambiguousNames.size.toLocaleString()}`);
  console.log(`   ↳ Match crosswalk mappings: ${Object.keys(crosswalk).length.toLocaleString()}\n`);
  const master = await auditMaster(teamIndex);
  const crosswalkAudit = auditCrosswalk(crosswalk, master.masterMatchIdSet);
  const appearances = await auditSecondaryDataset({file:APPEARANCES_FILE,label:'APPEARANCES',masterMatchIdSet:master.masterMatchIdSet,crosswalk,playerIdSet,teamIdSet:teamIndex.teamIdSet});
  const events = await auditSecondaryDataset({file:EVENTS_FILE,label:'EVENTS',masterMatchIdSet:master.masterMatchIdSet,crosswalk,playerIdSet,teamIdSet:teamIndex.teamIdSet});
  console.log('[4/4] Performing canonical alignment assessment...');
  const statusResult = calculateStatus({master,crosswalkAudit,appearances,events});
  const report = buildReport({master,crosswalkAudit,appearances,events,teamIndex,playersIndex,statusResult});
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report,null,2),'utf8');
  console.log('\n============================================================');
  console.log(` STEP 9 CANONICAL ALIGNMENT COMPLETE: ${report.status}`);
  console.log('============================================================');
  console.log(`MASTER rows              : ${master.rows.toLocaleString()}`);
  console.log(`MASTER unique Match IDs  : ${master.masterMatchIdSet.size.toLocaleString()}`);
  console.log(`MASTER duplicate IDs     : ${master.duplicateMatchIds.length.toLocaleString()}`);
  console.log(`Unresolved team names    : ${master.uniqueUnresolvedTeamNames.size.toLocaleString()} ${master.uniqueUnresolvedTeamNames.size===0?'✅':''}`);
  console.log(`Ambiguous team names     : ${master.uniqueAmbiguousTeamNames.size.toLocaleString()} (keep-first)`);
  console.log(`Crosswalk mappings       : ${crosswalkAudit.totalMappings.toLocaleString()}`);
  console.log(`APPEARANCES rows         : ${appearances.stats.rows.toLocaleString()}`);
  console.log(`EVENTS rows              : ${events.stats.rows.toLocaleString()}`);
  console.log(`Failures                 : ${statusResult.failures.length.toLocaleString()}`);
  console.log(`Warnings                 : ${statusResult.warnings.length.toLocaleString()}`);
  console.log(`📁 Audit report: ${REPORT_FILE}`);
  if(statusResult.warnings.length>0){ console.log('\n🟡 FORENSIC WARNINGS:'); for(const w of statusResult.warnings) console.log(`   ⚠ ${w}`); }
  if(statusResult.status==='PASS'){ console.log('\n============================================================'); console.log('✅ CANONICAL RELATIONAL ALIGNMENT VERIFIED'); console.log('============================================================\n'); } else { console.log('\n❌ Canonical alignment requires investigation.'); for(const f of statusResult.failures) console.log(`   ❌ ${f}`); process.exit(1); }
}
run().catch(err=>{ console.error('\n============================================================'); console.error('❌ STEP 9 FAILED'); console.error('============================================================'); console.error(err); process.exit(1); });
