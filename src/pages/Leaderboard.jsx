import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue, startTransition, memo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, Trophy, TrendingUp, Target, X, Crown, Flame, Users, Calendar, Award, ChevronDown, RotateCcw, ChevronRight, ArrowLeft, ArrowUp, ArrowDown, Swords, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDailyLeaderboard, useWeeklyLeaderboard, useMonthlyLeaderboard, useGoatLeaderboard } from '../hooks/useUserData';
import { PERIOD } from '../utils/constants';
import { todayStr } from '../utils/dates';
import SEO from '../components/SEO';
import EmptyState from '../components/EmptyState';

const AVATAR_COLORS = ['var(--danger)','var(--gold)','var(--bronze)','var(--primary)','var(--accent)'];
const PODIUM_CFG = [
  { h:130, border:'var(--gold)', bg:'linear-gradient(180deg,rgba(var(--gold-rgb),.15) 0%,rgba(var(--gold-rgb),.02) 100%)', text:'var(--gold)', avatar:72, font:'1.25rem', shadow:'0 0 24px rgba(var(--gold-rgb),.2)', order:2, medal:'🥇' },
  { h:95, border:'var(--text-muted)', bg:'linear-gradient(180deg,rgba(108,117,125,.1) 0%,rgba(108,117,125,.01) 100%)', text:'var(--text-muted)', avatar:58, font:'1rem', shadow:'0 0 16px rgba(108,117,125,.1)', order:1, medal:'🥈' },
  { h:75, border:'var(--bronze)', bg:'linear-gradient(180deg,rgba(217,119,6,.1) 0%,rgba(217,119,6,.01) 100%)', text:'var(--bronze)', avatar:50, font:'.85rem', shadow:'0 0 12px rgba(217,119,6,.1)', order:3, medal:'🥉' },
];
const TABS = [{key:PERIOD.DAILY,label:'Today',Icon:Calendar},{key:PERIOD.WEEKLY,label:'Week',Icon:TrendingUp},{key:PERIOD.MONTHLY,label:'Month',Icon:Target},{key:PERIOD.GOAT,label:'G.O.A.T',Icon:Crown,isGoat:true}];

const getBadges = (u) => {
  const b=[]; if((u.exact||0)>=5) b.push({text:'🎯 Sniper',cls:'sniper'}); if((u.streak||0)>=3) b.push({text:`🔥 ${u.streak}`,cls:'streak'}); if((u.points||0)>=500) b.push({text:'⭐ Veteran',cls:'vet'}); return b;
};

const AccuracyRing = memo(function AccuracyRing({value, size=32, stroke=3, color='var(--primary)'}){
  const r=(size-stroke)/2; const circ=2*Math.PI*r; const pct=Math.min(100,Math.max(0,value))/100;
  return <div className="accuracy-ring" style={{width:size,height:size}}><svg width={size} height={size}><circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth={stroke}/><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={circ*(1-pct)} strokeLinecap="round"/></svg><span>{value}%</span></div>;
});

const StatCard = memo(function StatCard({icon,label,value,color,bg,delay}){
  return <div className="lb-stat anim-fade-up" style={{animationDelay:`${delay||0}ms`}}><div className="lb-stat-icon" style={{background:bg,color}}>{icon}</div><div><div className="lb-stat-val">{value}</div><div className="lb-stat-lbl">{label}</div></div></div>;
});

const PodiumUser = memo(function PodiumUser({user,position,delay}){
  const c=PODIUM_CFG[position]; if(!c) return null; const name=user.displayName||'Player';
  return <div className="lb-pod-u" style={{order:c.order, animationDelay:`${(delay||0)+150}ms`}}><div className="lb-pod-top">{position===0&&<Crown size={24} className="gold lb-crown"/>}<div className="lb-pod-avatar" style={{width:c.avatar,height:c.avatar,background:`linear-gradient(135deg,${c.border}25,${c.border}08)`,border:`3px solid ${c.border}`,fontSize:c.font,color:c.text,boxShadow:c.shadow}}>{name.slice(0,2).toUpperCase()}</div><div className="lb-pod-medal">{c.medal}</div><div className="lb-pod-name">{name}</div><div className="lb-pod-sub">{user.points||0} pts · {user.accuracy||0}% {user.streak>0&&`· 🔥 ${user.streak}`}</div></div><div className="lb-pod-bar" style={{height:c.h,background:c.bg}}><div className="lb-pod-num" style={{color:c.text}}>#{position+1}</div></div></div>;
});

const TabBar = memo(function TabBar({tabs,active,onChange}){
  const barRef=useRef(null); const [ind,setInd]=useState({left:0,width:0}); const isGoat=active===PERIOD.GOAT;
  useEffect(()=>{ const bar=barRef.current; if(!bar) return; const btn=bar.querySelector(`[data-tab="${active}"]`); if(!btn) return; const br=bar.getBoundingClientRect(), btnR=btn.getBoundingClientRect(); setInd({left:btnR.left-br.left+btnR.width*0.18,width:btnR.width*0.64}); },[active]);
  return <div className="lb-tabs" ref={barRef}>{tabs.map(t=><button key={t.key} data-tab={t.key} className={`lb-tab${active===t.key?' on':''}${t.isGoat?' goat':''}`} onClick={()=>startTransition(()=>onChange(t.key))}><t.Icon size={12}/><span>{t.label}</span></button>)}<div className="lb-tab-ind" style={{left:ind.left,width:ind.width,background:isGoat?'rgba(0,0,0,.15)':'var(--gold)'}}/></div>;
});

const LeaderboardRow = memo(function LeaderboardRow({user,rank,isMe,delay,prevRank}){
  const avColor=AVATAR_COLORS[(rank-1)%AVATAR_COLORS.length]; const trend=prevRank?prevRank-rank:0; const name=user.displayName||'Anonymous'; const badges=getBadges(user);
  return <div className={`lb-row${isMe?' me':''}`} style={{animationDelay:`${delay}ms`}}><div className="lb-row-rank">#{rank}{trend>0&&<span className="trend-up"><ArrowUp size={10}/>{trend}</span>}{trend<0&&<span className="trend-down"><ArrowDown size={10}/>{Math.abs(trend)}</span>}</div><div className="lb-row-user"><div className="lb-row-avatar" style={{background:avColor}}>{name.slice(0,2).toUpperCase()}</div><div className="lb-row-info"><div className="lb-row-name">{name}{isMe&&<span className="lb-you-badge">YOU</span>}</div><div className="lb-row-badges">{badges.map((b,i)=><span key={i} className={`lb-badge ${b.cls}`}>{b.text}</span>)}<span className="lb-row-preds">{user.predictions||0} preds</span></div></div></div><div className="lb-row-acc"><AccuracyRing value={user.accuracy||0} size={32} stroke={3} color={(user.accuracy||0)>=70?'var(--primary)':(user.accuracy||0)>=40?'var(--gold)':'var(--danger)'}/></div><div className="lb-row-pts"><span className="val">{user.points||0}</span><span className="lbl">Points</span></div></div>;
});

export default function Leaderboard(){
  const auth=useAuth()||{}; const currentUser=auth.currentUser||auth.user; const uid=currentUser?.uid; const nav=useNavigate(); const searchRef=useRef(null);
  const {data:dailyLB=null,isLoading:loadingDaily}=useDailyLeaderboard(todayStr());
  const {data:weeklyLB=null,isLoading:loadingWeekly}=useWeeklyLeaderboard();
  const {data:monthlyLB=null,isLoading:loadingMonthly}=useMonthlyLeaderboard();
  const {data:goatLB=null,isLoading:loadingGoat}=useGoatLeaderboard();
  const [tab,setTab]=useState(PERIOD.DAILY); const [search,setSearch]=useState(''); const [searchFocused,setSearchFocused]=useState(false); const [showCount,setShowCount]=useState(15);
  const deferredSearch=useDeferredValue(search);
  
  const activeLB=useMemo(()=>{ if(tab===PERIOD.WEEKLY) return weeklyLB; if(tab===PERIOD.MONTHLY) return monthlyLB; if(tab===PERIOD.GOAT) return goatLB; return dailyLB; },[tab,weeklyLB,monthlyLB,goatLB,dailyLB]);
  const entries=useMemo(()=>activeLB?.entries||[],[activeLB]); 
  const stats=useMemo(()=>activeLB?.stats||{avg:'0.0',preds:0,exact:0,players:0},[activeLB]);
  const loading=useMemo(()=>{ if(tab===PERIOD.WEEKLY) return loadingWeekly; if(tab===PERIOD.MONTHLY) return loadingMonthly; if(tab===PERIOD.GOAT) return loadingGoat; return loadingDaily; },[tab,loadingWeekly,loadingMonthly,loadingGoat,loadingDaily]);
  
  const myEntry=useMemo(()=>{ if(!uid) return null; return entries.find(u=>u.uid===uid)||null; },[entries,uid]);
  const rivalEntry=useMemo(()=>{ if(!myEntry||myEntry.rank===1) return null; return entries.find(u=>u.rank===myEntry.rank-1)||null; },[entries,myEntry]);
  const pointsBehind=rivalEntry?(rivalEntry.points-myEntry.points):0;
  
  const filtered=useMemo(()=>{ if(!deferredSearch.trim()) return entries; const q=deferredSearch.toLowerCase(); return entries.filter(u=>(u.displayName||'').toLowerCase().includes(q)); },[entries,deferredSearch]);
  const filteredTop3=useMemo(()=>filtered.slice(0,3),[filtered]); 
  const filteredRest=useMemo(()=>filtered.slice(3),[filtered]); 
  const visibleRest=useMemo(()=>filteredRest.slice(0,showCount-3),[filteredRest,showCount]); 
  const hasMore=filteredRest.length>showCount-3;
  
  const handleClear=useCallback(()=>{ setSearch(''); searchRef.current?.focus(); },[]);
  const handleTabChange=useCallback((t)=>{ startTransition(()=>{ setTab(t); setShowCount(15); setSearch(''); }); },[]);
  const tabDesc=useMemo(()=>({daily:"Today's top predictors",weekly:'Monday – Sunday rankings',monthly:"This month's top predictors",goat:'Greatest of All Time'}[tab]||''),[tab]);

  const webPageSchema={"@context":"https://schema.org","@type":"WebPage","name":"ZOKASCORE Prediction Leaderboard & Player Rankings","description":"Track top prediction rankings, compare performance, compete worldwide.","url":"https://zokascore.xyz/leaderboard"};

  return <div className="lb-page">
    <SEO title="Prediction Leaderboard & Player Rankings | ZOKASCORE" description="Track top prediction rankings, compare performance, climb leaderboard, compete worldwide." keywords="prediction leaderboard, football leaderboard, rankings, top predictors" structuredData={webPageSchema} breadcrumbs={[{name:"Home",path:"/"},{name:"Leaderboard",path:"/leaderboard"}]}/>
    <div className="lb-hdr"><div className="lb-wrap"><div className="lb-hdr-inner"><button className="btn btn-ghost btn-sm" onClick={()=>nav('/predictions')}><ArrowLeft size={12}/> Predictions</button><div className="lb-hdr-title"><Trophy size={14}/> Leaderboard{!loading&&entries.length>0&&<span className="lb-live"/>}</div></div></div></div>
    <div className="lb-wrap">
      <div className="lb-title"><div className="lb-title-icon"><Trophy size={24} className="gold"/></div><div><h1>Leaderboard</h1><p>{tabDesc}</p></div></div>
      
      {myEntry&&!loading&&<div className="lb-personal-card">
        <div className="lb-pc-main">
          <div className="lb-pc-rank"><span className="lbl">Your Rank</span><span className="val">#{myEntry.rank}</span></div>
          <div className="lb-pc-stats">
            <div className="lb-pc-stat"><span className="val">{myEntry.points||0}</span><span className="lbl">Points</span></div>
            <div className="lb-pc-stat"><span className="val">{myEntry.exact||0}</span><span className="lbl">Exact</span></div>
            <div className="lb-pc-stat"><AccuracyRing value={myEntry.accuracy||0} size={36} stroke={3}/></div>
          </div>
        </div>
        {rivalEntry&&<div className="lb-pc-rival"><Swords size={14} className="danger"/><span className="text"><strong>{pointsBehind} pts</strong> behind <strong>{rivalEntry.displayName}</strong> (#{rivalEntry.rank})</span><span className="cta">Catch up →</span></div>}
        {myEntry.rank===1&&<div className="lb-pc-rival champion"><Crown size={14} className="gold"/><span className="text">You are the Champion! 👑</span></div>}
      </div>}
      
      <TabBar tabs={TABS} active={tab} onChange={handleTabChange}/>
      
      <div className="lb-stats">
        <StatCard icon={<Flame size={16}/>} label="Top Score" value={entries[0]?`${entries[0].points} pts`:'–'} color="var(--gold)" bg="rgba(var(--gold-rgb),.05)" delay={0}/>
        <StatCard icon={<Users size={16}/>} label="Players" value={stats.players||0} color="var(--accent)" bg="rgba(var(--accent-rgb),.05)" delay={50}/>
        <StatCard icon={<Target size={16}/>} label="Avg Accuracy" value={`${stats.avg||'0.0'}%`} color="var(--primary)" bg="rgba(var(--primary-rgb),.04)" delay={100}/>
        <StatCard icon={<Award size={16}/>} label="Exact Scores" value={stats.exact||0} color="var(--gold)" bg="rgba(var(--gold-rgb),.05)" delay={150}/>
      </div>
      
      {loading?(
        <div className="lb-podium-skeleton flex-center gap-12">
          <div className="skeleton" style={{width:120,height:180,borderRadius:12}}/>
          <div className="skeleton" style={{width:120,height:180,borderRadius:12}}/>
          <div className="skeleton" style={{width:120,height:180,borderRadius:12}}/>
        </div>
      ):filteredTop3.length>=1?(
        <div className="lb-podium">{filteredTop3.slice(0,3).map((u,i)=><PodiumUser key={u.uid} user={u} position={i} delay={i*80}/>)}</div>
      ):<EmptyState icon={Trophy} title="No predictions yet — be the first!"/>}
      
      <div className="lb-search-wrap">
        <Search size={15} className="lb-search-icon" style={{color:searchFocused?'var(--primary)':'var(--text-muted)'}}/>
        <input ref={searchRef} type="text" placeholder="Search players..." value={search} onChange={e=>setSearch(e.target.value)} onFocus={()=>setSearchFocused(true)} onBlur={()=>setSearchFocused(false)} className="lb-search"/>
        {search&&<button className="lb-search-clear" onClick={handleClear}><X size={11}/></button>}
      </div>
      
      {search.trim()&&<div className="lb-search-count">{filtered.length} result{filtered.length!==1?'s':''}</div>}
      
      <div className="lb-list">
        {loading?(
          Array.from({length:6}).map((_,i)=><div key={i} className="skeleton lb-row-skeleton" style={{height: 60, borderRadius: 12, marginBottom: 8}}/>)
        ):visibleRest.length===0&&!search.trim()&&filteredTop3.length===0?(
          <div className="lb-empty">{entries.length===0?'No predictions yet — be the first!':'Top players shown above.'}</div>
        ):visibleRest.length===0&&search.trim()?(
          <div className="lb-empty">No players found matching "{deferredSearch}"</div>
        ):visibleRest.map((user,i)=>{ 
          const rank=user.rank||(entries.findIndex(e=>e.uid===user.uid)+1); 
          const isMe=uid===user.uid; 
          const delay=Math.min(i*25,250); 
          const prevRank=user.prevRank||0; 
          return <LeaderboardRow key={user.uid} user={user} rank={rank} isMe={isMe} delay={delay} prevRank={prevRank}/>; 
        })}
      </div>
      
      {hasMore&&!loading&&<button className="btn btn-ghost w-full mt-12" onClick={()=>setShowCount(p=>Math.min(p+15,200))}><ChevronDown size={12}/> Show more ({filteredRest.length-visibleRest.length} remaining)</button>}
      
      {entries.length>0&&<div className="text-center mt-20"><button className="btn btn-primary" onClick={()=>nav('/predictions')}><Target size={14}/> Make Predictions <ChevronRight size={13}/></button></div>}
      
      <section className="glass-card editorial-card mt-32">
        <h2><Info size={18}/> How ZOKASCORE Scoring Works</h2>
        <div className="editorial-grid">
          <div><h3>Exact Score (10 points)</h3><p>Predict precise scoreline (e.g., 2-1) to earn max 10 pts and 🎯 Sniper badge.</p></div>
          <div><h3>Correct Outcome (3 points)</h3><p>Predict correct result (Home/Draw/Away) but miss exact to earn 3 pts.</p></div>
          <div><h3>Daily Streaks 🔥</h3><p>Make at least one correct prediction daily to build streak. Unlocks badges and rewards.</p></div>
        </div>
      </section>
    </div>
  </div>;
}