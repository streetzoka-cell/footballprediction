import React, { useState, useMemo, useEffect, useRef } from "react";

export const COUNTRIES = [
  { code:'GB', name:'UK', flag:'🇬🇧' }, { code:'US', name:'USA', flag:'🇺🇸' }, { code:'ES', name:'Spain', flag:'🇪🇸' }, { code:'DE', name:'Germany', flag:'🇩🇪' }, { code:'FR', name:'France', flag:'🇫🇷' },
];
export const streamingServices = [
  { id:'sky', name:'Sky Sports', description:'UK leading sports broadcaster with Premier League rights', competitions:['Premier League','EFL','Bundesliga'], category:'broadcaster', color:'#0a1630', url:'https://www.skysports.com', tier:'PREMIUM', quality:'4K', countries:['GB','IE'] },
  { id:'dazn', name:'DAZN', description:'Global sports streaming for boxing and football', competitions:['LaLiga','Serie A','Champions League'], category:'governing', color:'#0a0a0a', url:'https://www.dazn.com', tier:'PREMIUM', quality:'1080p', countries:['GB','ES','DE'] },
  { id:'prime', name:'Prime Video', description:'Exclusive EPL midweek fixtures and US Open', competitions:['Premier League','ATP'], category:'broadcaster', color:'#00a8e1', url:'https://primevideo.com', tier:'PREMIUM', quality:'4K', countries:['GB','US','DE','FR'] },
  { id:'bbc', name:'BBC iPlayer', description:'Free live FA Cup and Wimbledon coverage', competitions:['FA Cup','Wimbledon','Olympics'], category:'free', color:'#000000', url:'https://bbc.co.uk/iplayer', tier:'FREE', quality:'1080p', countries:['GB'] },
  { id:'espn', name:'ESPN+', description:'US home for LaLiga, Bundesliga and Copa del Rey', competitions:['LaLiga','Bundesliga','MLS'], category:'broadcaster', color:'#c8102e', url:'https://espn.com/espn/plus', tier:'PREMIUM', quality:'4K', countries:['US'] },
  { id:'fubo', name:'fuboTV', description:'Cord-cutting service with 150+ channels', competitions:['Premier League','Ligue 1','Serie A'], category:'broadcaster', color:'#ff6b00', url:'https://fubo.tv', tier:'PREMIUM', quality:'4K', countries:['US','ES'] },
  { id:'bein', name:'beIN Sports', description:'MENA and France football specialist', competitions:['Ligue 1','LaLiga','Champions League'], category:'broadcaster', color:'#6a00f4', url:'https://bein.com', tier:'PREMIUM', quality:'1080p', countries:['FR','US'] },
  { id:'itv', name:'ITVX', description:'Free UK football and rugby internationals', competitions:['EFL','Six Nations','World Cup'], category:'free', color:'#000000', url:'https://itv.com', tier:'FREE', quality:'1080p', countries:['GB'] },
  { id:'canal', name:'Canal+', description:'French premium with Premier League and Top 14', competitions:['Premier League','Top 14','F1'], category:'broadcaster', color:'#000', url:'https://canalplus.com', tier:'PREMIUM', quality:'4K', countries:['FR'] },
  { id:'paramount', name:'Paramount+', description:'US streaming for UCL and Serie A', competitions:['Champions League','Europa League','Serie A'], category:'broadcaster', color:'#0064ff', url:'https://paramountplus.com', tier:'PREMIUM', quality:'1080p', countries:['US'] },
];
export const categories = [
  { id:'all', label:'All Services' }, { id:'governing', label:'Governing' }, { id:'broadcaster', label:'Broadcasters' }, { id:'free', label:'Free to Air' },
];

export function useCountdown(targetIso){
  const [left,setLeft]=useState(()=>Math.max(0, new Date(targetIso).getTime()-Date.now()));
  useEffect(()=>{ const i=setInterval(()=>setLeft(Math.max(0,new Date(targetIso).getTime()-Date.now())),1000); return ()=>clearInterval(i); },[targetIso]);
  const h=Math.floor(left/3600000); const m=Math.floor((left%3600000)/60000); const s=Math.floor((left%60000)/1000);
  return { h,m,s, expired:left===0 };
}

function LiveMatchHero({ match }){
  const isLive = match.status==='LIVE'; const isFinished = match.status==='FT';
  return (
    <div className="ls-live-hero">
      <div className="ls-hero-top">
        {match.leagueLogo && <img src={match.leagueLogo} alt={match.league} className="ls-league-logo" />}
        <span>{match.league} {isLive && <><span className="zk-live-pulse-dot" /> {match.minute}'</>}</span>
        <span className="badge badge-primary ml-auto">{isLive?'LIVE':isFinished?'FT':'UPCOMING'}</span>
      </div>
      <div className="ls-hero-teams">
        <div className="ls-team">{match.homeLogo && <img src={match.homeLogo} alt={match.home} />}<b>{match.home}</b></div>
        <div className="ls-score">{isLive||isFinished? `${match.homeScore} - ${match.awayScore}` : 'VS'}</div>
        <div className="ls-team">{match.awayLogo && <img src={match.awayLogo} alt={match.away} />}<b>{match.away}</b></div>
      </div>
      {isLive && match.stats && (
        <div className="ls-stats-bar">
          <div className="ls-stat"><span>{match.stats.possessionHome}%</span><div className="ls-possession-bar"><div className="ls-possession-fill" style={{width:`${match.stats.possessionHome}%`}} /></div><span>{match.stats.possessionAway}%</span></div>
        </div>
      )}
      <div className="ls-available-on">
        <span>Available On:</span> {match.availableOn?.map(s=><span key={s} className="badge badge-muted">{s}</span>)}
      </div>
      <a href={`/match/${match.id}`} className="btn btn-primary btn-sm w-full mt-8">View Match Center →</a>
    </div>
  );
}

function UpcomingMatchCard({ match, onNotify }){
  const {h,m,s,expired}=useCountdown(match.kickoff);
  return (
    <div className="ls-upcoming-card">
      <div className="ls-league-row">{match.leagueLogo && <img src={match.leagueLogo} alt={match.league} className="ls-league-logo" />}<span>{match.league}</span></div>
      <div className="ls-teams-mini">{match.home} vs {match.away}</div>
      <div className="ls-countdown">{expired?'KICKOFF':`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}</div>
      <button onClick={onNotify} className="btn btn-secondary btn-sm w-full">🔔 Notify Me</button>
    </div>
  );
}

function ServiceCard({ service }){
  return (
    <div className="ls-service-card" style={{borderTopColor:service.color}}>
      <div className="ls-service-logo" style={{background:`linear-gradient(135deg,${service.color},#111)`}}>{service.name[0]}</div>
      <div className="ls-service-head"><h4>{service.name}</h4><span className={`ls-tier ${service.tier}`}>{service.tier}</span><span className="ls-quality">{service.quality}</span></div>
      <p>{service.description}</p>
      <div className="ls-competitions">{service.competitions.map(c=><span key={c} className="badge badge-primary">{c}</span>)}</div>
      <a href={service.url} target="_blank" rel="noopener" className="ls-visit-link">Visit →</a>
    </div>
  );
}

function useFixtures(){ 
  const todayStr=new Date().toISOString().split('T')[0];
  const fixtures=[
    { id:'1', home:'Arsenal', away:'Man City', homeLogo:'https://a.com', awayLogo:'https://b.com', homeScore:2, awayScore:1, status:'LIVE', minute:67, league:'Premier League', leagueLogo:'https://l.com', kickoff:new Date(Date.now()+3600000).toISOString(), availableOn:['Sky Sports','Prime'], stats:{possessionHome:54,possessionAway:46} },
    { id:'2', home:'Barcelona', away:'Real Madrid', homeLogo:'', awayLogo:'', homeScore:0, awayScore:0, status:'UPCOMING', minute:0, league:'LaLiga', leagueLogo:'', kickoff:new Date(Date.now()+7200000).toISOString(), availableOn:['DAZN'] },
  ];
  return { todayStr, fixtures };
}

export default function LiveStream(){
  const [search,setSearch]=useState('');
  const [activeCategory,setActiveCategory]=useState('all');
  const [selectedCountry,setSelectedCountry]=useState('all');
  const { todayStr, fixtures } = useFixtures();

  const liveMatches = fixtures.filter(f=>f.status==='LIVE');
  const upcomingMatches = fixtures.filter(f=>f.status==='UPCOMING');
  const featuredMatch = liveMatches[0] || upcomingMatches[0];

  const filteredServices = useMemo(()=>{
    return streamingServices.filter(s=>{
      const matchesSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.competitions.join(' ').toLowerCase().includes(search.toLowerCase());
      const matchesCat = activeCategory==='all' || s.category===activeCategory;
      const matchesCountry = selectedCountry==='all' || s.countries.includes(selectedCountry);
      return matchesSearch && matchesCat && matchesCountry;
    });
  },[search,activeCategory,selectedCountry]);

  const clearAll = ()=>{ setSearch(''); setActiveCategory('all'); setSelectedCountry('all'); };

  const itemListSchema = { "@context":"https://schema.org","@type":"ItemList", itemListElement: filteredServices.map((s,i)=>({ "@type":"ListItem", position:i+1, url:s.url, name:s.name })) };

  return (
    <div className="ls-page">
      <div className="ls-hero"><h1>Live Streaming Hub</h1><p>Find where to watch {todayStr} fixtures worldwide</p></div>
      {featuredMatch && <LiveMatchHero match={featuredMatch} />}
      
      <div className="glass-card p-20 mb-16"><h3 className="font-bold text-primary mb-8">How to choose a stream</h3><p className="text-muted text-sm">Check regional availability and quality tiers before kickoff.</p></div>

      <div className="ls-search-bar">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search service or competition..." />
        {search && <button onClick={()=>setSearch('')}>×</button>}
      </div>

      <div className="ls-filter-row">
        {categories.map(c=><button key={c.id} className={activeCategory===c.id?'active':''} onClick={()=>setActiveCategory(c.id)}>{c.label}</button>)}
      </div>

      <div className="ls-country-bar">
        <button className={selectedCountry==='all'?'active':''} onClick={()=>setSelectedCountry('all')}>🌍 All</button>
        {COUNTRIES.map(ct=><button key={ct.code} className={selectedCountry===ct.code?'active':''} onClick={()=>setSelectedCountry(ct.code)}>{ct.flag} {ct.name}</button>)}
      </div>

      <div className="ls-showing-count">Showing {filteredServices.length} services {selectedCountry!=='all' && `in ${selectedCountry}`} <button onClick={clearAll}>Clear all</button></div>

      <div className="ls-section mb-24">
        <h2 className="text-primary font-bold text-lg mb-12">Today's Upcoming Matches</h2>
        <div className="grid gap-12">{upcomingMatches.map(m=><UpcomingMatchCard key={m.id} match={m} onNotify={()=>alert('Notify set')} />)}</div>
      </div>

      <div className="ad-slot mb-16">Streaming Partner Ad</div>

      {filteredServices.length===0 ? (
        <div className="zk-empty-state glass-card"><p>No services for selected filters</p><button onClick={clearAll} className="btn btn-primary btn-sm mt-8">Reset</button></div>
      ) : (
        <div className="ls-service-grid">{filteredServices.map(s=><ServiceCard key={s.id} service={s} />)}</div>
      )}

      <div className="text-center text-muted text-xs mt-24">Regional availability varies by rights deal. Always check local listings.</div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(itemListSchema)}} />
    </div>
  );
}