import React, { useEffect, useState, useMemo } from "react";

function useNow(interval=10000){ 
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{ const id=setInterval(()=>setNow(Date.now()),interval); return ()=>clearInterval(id); },[interval]);
  return now;
}
function StatCard({ label, value, sub }){
  return <div className="mg-stat-card"><span className="label">{label}</span><b className="value">{value}</b>{sub && <small>{sub}</small>}</div>;
}
function MatchSection({ title, matches, countLabel }){
  if(!matches.length) return null;
  return (
    <div className="mg-section">
      <div className="mg-section-head"><h3>{title}</h3>{countLabel && <span>{countLabel}</span>}</div>
      <div className="mg-grid">{matches.map(m=><MasterMatchCard key={m.id} match={m} />)}</div>
    </div>
  );
}
function MasterMatchCard({ match }){
  const ratingVal = Math.round(match.rating||0);
  const status = match.status;
  const statusLabel = status==='LIVE' ? 'live' : status==='HT' ? 'ht' : status==='FT' ? 'ft' : status==='PST' || status==='POSTP' ? 'postponed' : status==='CANC' ? 'canceled' : status==='SUSP' ? 'suspended' : 'scheduled';
  const isPostponed = status==='PST' || status==='POSTP';
  const isCanceled = status==='CANC' || status==='ABD';
  const isSuspended = status==='SUSP' || status==='INT';
  
  return (
    <div className={`mg-match-card ${statusLabel} ${match.isElite?'elite':''}`}>
      <div className="mg-card-top">
        <a href={`/league/${match.leagueId}`} className="mg-league-link"><img src={match.leagueLogo} alt={match.league} className="mg-league-logo" /><span>{match.league}</span></a>
        <span className={`mg-status-badge ${statusLabel}`}>{isPostponed?'postponed':isCanceled?'canceled':isSuspended?'suspended':statusLabel}</span>
        {status==='LIVE' && <span className="mg-live-dot" />}
        <span className="mg-rating-badge" style={{background: ratingVal>=80? '#10b981' : ratingVal>=60? '#f59e0b' : '#6b7280'}}>{ratingVal}</span>
      </div>
      <div className="mg-card-teams">
        <div className="mg-team-col"><img src={match.homeLogo} alt={match.home} /><span>{match.home}</span></div>
        <div className={`mg-score-box ${status === 'LIVE' || status === 'FT' ? 'active' : ''}`}><span>{match.homeScore ?? '-'}</span><small>{match.minute? `${match.minute}'` : 'vs'}</small><span>{match.awayScore ?? '-'}</span></div>
        <div className="mg-team-col"><img src={match.awayLogo} alt={match.away} /><span>{match.away}</span></div>
      </div>
      <div className="mg-card-footer"><span>📅 {match.dateStr} {match.timeStr}</span><span>{match.confidence}</span></div>
    </div>
  );
}

function useFixtures(){
  const todayStr=new Date().toISOString().split('T')[0];
  const fixtures=[
    { id:'1', home:'Liverpool', away:'Arsenal', homeLogo:'', awayLogo:'', homeScore:1, awayScore:1, status:'LIVE', minute:54, league:'Premier League', leagueId:'pl', leagueLogo:'', dateStr:todayStr, timeStr:'20:45', rating:92, confidence:'HIGH', category:'ELITE', isElite:true },
    { id:'2', home:'PSG', away:'Marseille', homeLogo:'', awayLogo:'', homeScore:0, awayScore:0, status:'HT', minute:45, league:'Ligue 1', leagueId:'l1', leagueLogo:'', dateStr:todayStr, timeStr:'21:00', rating:78, confidence:'MEDIUM', category:'FEATURED', isElite:false },
    { id:'3', home:'Bayern', away:'Dortmund', homeLogo:'', awayLogo:'', homeScore:2, awayScore:0, status:'FT', minute:90, league:'Bundesliga', leagueId:'bl', leagueLogo:'', dateStr:todayStr, timeStr:'18:30', rating:84, confidence:'HIGH', category:'ELITE', isElite:true },
    { id:'4', home:'Inter', away:'Milan', homeLogo:'', awayLogo:'', homeScore:null, awayScore:null, status:'PST', minute:null, league:'Serie A', leagueId:'sa', leagueLogo:'', dateStr:todayStr, timeStr:'POSTP', rating:88, confidence:'HIGH', category:'ELITE', isElite:true },
  ];
  return { todayFx:fixtures, tomFx:fixtures.slice(0,2).map(f=>({...f,id:f.id+'-t',status:'SCHEDULED'})), yestFx:fixtures.slice(0,1).map(f=>({...f,id:f.id+'-y',status:'FT'})), todayStr };
}

export default function MasterGames(){
  const now=useNow(10000);
  const { todayFx, tomFx, yestFx, todayStr } = useFixtures();

  const applySmartMinute = (m)=>({...m, smartMinute: m.status==='LIVE' ? `${Math.floor((now - new Date(m.dateStr).getTime())/60000)%90}'` : m.minute});

  const all = useMemo(()=>[...todayFx, ...tomFx, ...yestFx].map(applySmartMinute),[todayFx,tomFx,yestFx,now]);
  const enriched = useMemo(()=>all.map(applySmartMinute),[all]);

  const todayMatches = useMemo(()=>enriched.filter((m)=>m.dateStr===todayStr),[enriched,todayStr]);

  const elitePicks = useMemo(()=>todayMatches.filter((m)=>m.category==='ELITE' && m.confidence==='HIGH' && m.rating>=80),[todayMatches]);
  const featuredMatches = useMemo(()=>todayMatches.filter((m)=>m.category==='FEATURED' && m.rating>=60 && m.rating<80),[todayMatches]);
  const moreMatches = useMemo(()=>todayMatches.filter((m)=>!elitePicks.includes(m) && !featuredMatches.includes(m)),[todayMatches,elitePicks,featuredMatches]);

  const smartMatchesCount = todayMatches.length;
  const elitePicksCount = elitePicks.length;
  const featuredCount = featuredMatches.length;
  const avgRating = useMemo(()=>Math.round(todayMatches.reduce((s,m)=>s+(m.rating||0),0)/(todayMatches.length||1)),[todayMatches]);

  const isEmpty = todayMatches.length===0;

  const itemListSchema = {
    "@context":"https://schema.org","@type":"ItemList",
    itemListElement: todayMatches.map((m,i)=>({"@type":"ListItem",position:i+1,name:`${m.home} vs ${m.away}`,url:`/match/${m.id}`}))
  };

  const breadcrumbs = { "@context":"https://schema.org","@type":"BreadcrumbList", itemListElement:[{ "@type":"ListItem", position:1, name:"Home", item:"/" }, { "@type":"ListItem", position:2, name:"Master Games", item:"/master-games" }] };

  return (
    <div className="mg-page">
      <div className="mg-container">
        <button className="btn btn-ghost btn-sm mb-16" onClick={()=>history.back()}>← Back</button>
        <div className="mg-hero">
          <div className="mg-glow-1" /><div className="mg-glow-2" />
          <span className="mg-kicker">ZOKA ELITE • UPDATED {new Date(now).toLocaleTimeString()}</span>
          <h1 className="mg-title">Master Games</h1>
          <p className="mg-subtitle">Hand-picked high-stake fixtures analyzed across 5 pillars of dominance</p>
        </div>

        <div className="mg-stats-grid">
          <StatCard label="Today" value={smartMatchesCount} sub={todayStr} />
          <StatCard label="Elite Picks" value={elitePicksCount} sub="rating ≥80" />
          <StatCard label="Featured" value={featuredCount} sub="60-79" />
          <StatCard label="Avg Rating" value={avgRating} sub="confidence weighted" />
        </div>

        <div className="mg-info-card">
          <h4>How we rate</h4>
          <ul>
            <li><b>League Importance</b> — Title race, relegation, cup weight</li>
            <li><b>Team Momentum</b> — Last 5 form, xG trend</li>
            <li><b>Derby Factor</b> — Rivalry intensity & crowd</li>
            <li><b>Statistical Variance</b> — Upset potential, goals volatility</li>
            <li><b>Global Interest</b> — Viewership, betting volume, social</li>
          </ul>
        </div>

        {isEmpty ? (
          <div className="zk-empty-state glass-card"><p>No elite fixtures today — check tomorrow</p></div>
        ) : (
          <>
            <MatchSection title="🔥 Elite Picks" matches={elitePicks} countLabel={`${elitePicksCount} matches`} />
            <MatchSection title="⭐ Featured" matches={featuredMatches} countLabel={`${featuredCount} matches`} />
            <MatchSection title="More Today" matches={moreMatches} countLabel={`${moreMatches.length} matches`} />
          </>
        )}

        <div className="glass-card flex-col items-center gap-12 p-20 mt-24 text-center"><p className="text-muted text-sm">Want live alerts for elite games?</p><button className="btn btn-primary btn-sm">Enable Notifications</button></div>

        <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(itemListSchema)}} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(breadcrumbs)}} />
      </div>
    </div>
  );
}