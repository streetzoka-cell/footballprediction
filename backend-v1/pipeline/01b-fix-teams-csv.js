'use strict';
/**
 * ZOKASCORE V2 — FIX TEAMS.CSV v2 (EXACT HEADER MATCH)
 * Header: zokascore_team_id,canonical_name,country,stadium
 * Safe: backup + deterministic IDs + CSV escaping
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'source', 'ZOKASCORE_FINAL');
const MASTER_FILE = path.join(DATA_DIR, 'ZOKASCORE_PUBLIC_MASTER.csv');
const TEAMS_FILE = path.join(DATA_DIR, 'ZOKASCORE_TEAMS.csv');

function clean(v){ return String(v??'').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ').replace(/[.\'’‘`"]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim(); }
function compact(v){ return clean(v).replace(/\s+/g,''); }
function genTeamId(name){
  const h = crypto.createHash('md5').update(compact(name)).digest('hex').slice(0,8);
  return `ZK_TEAM_${h}`;
}
function escapeCsvField(s){
  s = String(s??'');
  if(s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g,'""')}"`;
  return s;
}

async function readMasterDistinctTeams(){
  console.log('[1/4] Reading MASTER distinct teams...');
  const distinct = new Map(); // compact -> original name
  let rows=0;
  await new Promise((res,rej)=>{
    fs.createReadStream(MASTER_FILE).pipe(csv()).on('data', r=>{
      rows++;
      for(const k of ['home_team','away_team']){
        const name = String(r[k]??'').trim();
        if(!name) continue;
        const c = compact(name);
        if(!c) continue;
        if(!distinct.has(c)) distinct.set(c, name);
      }
    }).on('end',res).on('error',rej);
  });
  console.log(`   ↳ MASTER rows: ${rows.toLocaleString()}`);
  console.log(`   ↳ Distinct team names in MASTER: ${distinct.size.toLocaleString()}`);
  return distinct;
}

async function readTeamsCsv(){
  console.log('\n[2/4] Reading TEAMS.csv (zokascore_team_id,canonical_name,country,stadium)...');
  if(!fs.existsSync(TEAMS_FILE)) throw new Error('TEAMS.csv not found: '+TEAMS_FILE);
  const existingByCompact = new Map();
  const existingIds = new Set();
  const existingNamesLower = new Set();
  let count=0;
  let header='';
  await new Promise((res,rej)=>{
    let isFirst=true;
    fs.createReadStream(TEAMS_FILE).pipe(csv()).on('headers', h=>{ header = h; }).on('data', r=>{
      count++;
      const id = String(r.zokascore_team_id||r.team_id||'').trim();
      const name = String(r.canonical_name||r.team_name||r.name||'').trim();
      if(!name) return;
      const c = compact(name);
      if(c) existingByCompact.set(c, {id, name});
      if(id) existingIds.add(id);
      if(name) existingNamesLower.add(name.toLowerCase());
    }).on('end',res).on('error',rej);
  });
  console.log(`   ↳ Existing teams: ${count.toLocaleString()}`);
  console.log(`   ↳ Header: ${header.join(',')}`);
  return {existingByCompact, existingIds, count, header};
}

async function run(){
  console.log('============================================================');
  console.log(' ZOKASCORE V2 — FIX TEAMS.CSV (SAFE APPEND - EXACT FORMAT)');
  console.log('============================================================\n');

  const masterDistinct = await readMasterDistinctTeams();
  const {existingByCompact, existingIds, count} = await readTeamsCsv();

  console.log('\n[3/4] Finding missing teams...');
  const missing = [];
  for(const [c, originalName] of masterDistinct.entries()){
    if(!existingByCompact.has(c)){
      let newId = genTeamId(originalName);
      let suffix=0;
      while(existingIds.has(newId) || missing.some(m=>m.id===newId)){
        suffix++;
        const h = crypto.createHash('md5').update(compact(originalName)+String(suffix)).digest('hex').slice(0,8);
        newId = `ZK_TEAM_${h}`;
        if(suffix>200) throw new Error('Collision loop for '+originalName);
      }
      missing.push({id:newId, canonical_name:originalName, country:'', stadium:''});
      existingIds.add(newId);
    }
  }
  console.log(`   ↳ Missing teams to add: ${missing.length.toLocaleString()}`);
  if(missing.length===0){ console.log('   ✅ TEAMS.csv already complete!'); return; }
  console.log(`   ↳ Sample: ${missing.slice(0,10).map(m=>m.canonical_name).join(' | ')}`);

  console.log('\n[4/4] Writing safely (backup + atomic append)...');
  const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  const backupPath = TEAMS_FILE.replace('.csv', `.backup-${ts}.csv`);
  fs.copyFileSync(TEAMS_FILE, backupPath);
  console.log(`   ↳ Backup: ${backupPath}`);

  // Read original file as text to preserve exactly
  const origText = fs.readFileSync(TEAMS_FILE,'utf8').trimEnd();
  
  // Build new lines in exact format: zokascore_team_id,canonical_name,country,stadium
  const newLines = missing.map(m=>{
    // canonical_name may contain comma or quotes -> escape
    const nameEsc = escapeCsvField(m.canonical_name);
    return `${m.id},${nameEsc},${m.country},${m.stadium}`;
  });

  const finalContent = origText + '\n' + newLines.join('\n') + '\n';

  const tmpPath = TEAMS_FILE + `.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, finalContent, 'utf8');
  // verify new file parses
  const verifyCount = finalContent.split('\n').length -1; // minus header
  console.log(`   ↳ Verifying: new line count ${verifyCount.toLocaleString()} (old ${count.toLocaleString()} + new ${missing.length.toLocaleString()})`);
  
  fs.renameSync(tmpPath, TEAMS_FILE);

  console.log(`   ↳ ✅ Added ${missing.length.toLocaleString()} teams`);
  console.log(`   ↳ New total: ${(count + missing.length).toLocaleString()}`);

  const reportPath = path.join(ROOT, 'data_audit','canonical_gate',`missing-teams-added-${Date.now()}.json`);
  if(!fs.existsSync(path.dirname(reportPath))) fs.mkdirSync(path.dirname(reportPath),{recursive:true});
  fs.writeFileSync(reportPath, JSON.stringify({added: missing.length, backup: backupPath, addedTeams: missing.slice(0,100), timestamp: new Date().toISOString()}, null, 2));
  console.log(`   ↳ Report: ${reportPath}`);

  console.log('\n============================================================');
  console.log(' FIX COMPLETE - NOW REBUILD INDEXES');
  console.log('============================================================');
  console.log('Run:');
  console.log('  node pipeline\\01-build-indexes.js');
  console.log('  node pipeline\\06-build-intelligence-indexes.js');
  console.log('  node pipeline\\07-seasonal-intelligence.js');
}

run().catch(e=>{console.error(e); process.exit(1);});
