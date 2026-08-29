import React, { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue, memo } from 'react';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, CheckCircle2, TrendingUp, Target, Star, Save, Trophy, Lock, LogIn, ChevronDown, ChevronRight, ChevronUp, ChevronLeft, Minus, X, ArrowRight, ArrowLeft, Plus, CircleX, ThumbsUp, ThumbsDown, Pencil, Share2, Zap, RefreshCw, Dice5, Sparkles, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useActivePredictions, useUserPredictions, useDailyLeaderboard, useZokaPicks, useZokaVotes, useUserPoints, usePublishedPickGroups } from '../hooks/useUserData';
import { useFixtures } from '../hooks/useFixtures';
import { todayStr, getLocalDateStr } from '../utils/dates';
import { calcPoints, SPORT, isLiveStatus, isFinishedStatus } from '../utils/constants';
import { savePrediction as savePredictionAction, saveZokaVote, removeZokaVote } from '../services/predictions';
import { db } from '../utils/firebase';
import { doc, setDoc, serverTimestamp, getDocs, collection, query, where } from 'firebase/firestore';
import { PATHS } from '../utils/constants';
import SEO from '../components/SEO';
import { useToast } from '../core/ToastManager';
import { mergeLiveIntoPredictions, calculateUserStats } from '../engine/predictionEngine';
import { buildMatchRoute } from '../utils/routes';
import EmptyState from '../components/EmptyState';
import PickGroupsView from '../components/PickGroupsView';
import GroupInsights from '../components/GroupInsights';
import GroupFeedback from '../components/GroupFeedback';
import { SITE } from '../utils/seoBuilder';

const FUTURE_DAYS = 3;
const LOCK_BEFORE = 60;
const ZOKA_VISIBLE = 5;
const ZOKA_JOKES = ["Why did the coach go to bank? To get his quarterback! 🏦","Stadiums never hot — too many fans! 🥶","Prediction is difficult, especially about future. 🔮"];
const QUICK_PICKS = [{h:1,a:0},{h:2,a:1},{h:0,a:0},{h:1,a:1},{h:2,a:0},{h:0,a:1},{h:3,a:1},{h:1,a:2}];
const dateOffset = (o=0) => getLocalDateStr(o);
const dateLabel = (d) => {
  if (!d) return '';
  const t=todayStr(), tm=getLocalDateStr(1), ys=getLocalDateStr(-1);
  if (d===t) return 'Today'; if (d===tm) return 'Tomorrow'; if (d===ys) return 'Yesterday';
  try{ const dt=new Date(d+'T12:00:00'); return isNaN(dt.getTime())?d:dt.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});}catch{return d;}
};
const getJoke = () => ZOKA_JOKES[Math.floor(Math.random()*ZOKA_JOKES.length)];
const parseKickoff = (k) => {
  if (!k) return '--:--';
  if (typeof k==='string' && /^\d{2}:\d{2}$/.test(k)) return k;
  try{ const d=new Date(k); return isNaN(d.getTime())?'--:--':d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});}catch{return '--:--';}
};
function isMatchLocked(pred, now){
  if (isFinishedStatus(pred.status, SPORT.FOOTBALL)) return {locked:true,reason:'finished'};
  if (isLiveStatus(pred.status, SPORT.FOOTBALL) || pred.isLive) return {locked:true,reason:'live'};
  const ks=pred.kickoffUtc||pred.utcDate||pred.date;
  if (ks){ const kt=new Date(ks); if(!isNaN(kt.getTime())){ const diff=(kt.getTime()-(now||Date.now()))/60000; if(diff<=LOCK_BEFORE) return {locked:true,reason:diff<=0?'started':'closing',minutesLeft:Math.floor(diff)}; return {locked:false,minutesLeft:Math.floor(diff)}; } }
  return {locked:false};
}
const formatMins = (m)=>{ if(m>=60){const h=Math.floor(m/60),mm=m%60; return mm>0?`${h}h ${mm}m`:`${h}h`;} return `${m}m`; };

const AnimNum = memo(function AnimNum({value, duration=400, delay=0}){
  const [d,setD]=useState(0); const raf=useRef(null);
  useEffect(()=>{ const t=typeof value==='number'?value:0; if(t===0){setD(0);return;} const start=performance.now()+delay; const run=(now)=>{ if(now<start){raf.current=requestAnimationFrame(run);return;} const p=Math.min((now-start)/duration,1); setD(Math.round((1-Math.pow(1-p,3))*t)); if(p<1) raf.current=requestAnimationFrame(run);}; raf.current=requestAnimationFrame(run); return()=>{ if(raf.current) cancelAnimationFrame(raf.current);};},[value,duration,delay]);
  return <>{d}</>;
});
const Skeleton = memo(()=> <div className="skeleton pred-skeleton" style={{height: 100, marginBottom: 8, borderRadius: 12}} />);
const ResultBadge = memo(function ResultBadge({result, isCalculating}){
  if(isCalculating) return <span className="v21-bdg pn"><Clock size={8}/> Calc...</span>;
  if(!result||result.resultType==='pending') return <span className="v21-bdg pn"><Clock size={8}/> Pending</span>;
  if(result.resultType==='exact') return <span className="v21-bdg ex"><CheckCircle2 size={8}/> Hit +{result.points||10}</span>;
  if(result.resultType==='result') return <span className="v21-bdg rs"><TrendingUp size={8}/> Won +{result.points||3}</span>;
  return <span className="v21-bdg ms"><CircleX size={8}/> Missed</span>;
});
const LoginModal = memo(function LoginModal({onClose, nav}){
  return <div onClick={onClose} className="v21-overlay"><div onClick={e=>e.stopPropagation()} className="v21-overlay-box" style={{maxHeight: 'auto', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', textAlign: 'center'}}><div className="v21-modal-icon"><LogIn size={22}/></div><div className="v21-modal-title">Login Required</div><div className="v21-modal-desc">Sign in to make predictions and compete.</div><div className="flex gap-8 w-full"><button onClick={onClose} className="btn btn-ghost flex-1">Cancel</button><button onClick={()=>{onClose(); nav('/login');}} className="btn btn-primary flex-1">Log In</button></div></div></div>;
});
const DateStrip = memo(function DateStrip({date, onChange, dates}){
  const stripRef=useRef(null); const today=todayStr(); const [expanded,setExpanded]=useState(false);
  const visible=useMemo(()=>{ if(expanded) return dates; const idx=dates.indexOf(today); const s=Math.max(0,idx-1); return dates.slice(s,s+8);},[dates,expanded,today]);
  useEffect(()=>{ const strip=stripRef.current; if(!strip) return; requestAnimationFrame(()=>{ const el=strip.querySelector(`[data-date="${date}"]`); if(el){ const sr=strip.getBoundingClientRect(), er=el.getBoundingClientRect(); strip.scrollBy({left:er.left-sr.left-sr.width/2+er.width/2, behavior:'smooth'});} });},[date]);
  return <div className="v21-ds" ref={stripRef}>{visible.map(d=>{ const isToday=d===today, isActive=d===date, isPast=d<today; return <button key={d} data-date={d} className={`v21-dc${isActive?' on':''}${isToday?' today':''}${isPast&&!isActive?' past':''}`} onClick={()=>onChange(d)}><span className="dn">{['S','M','T','W','T','F','S'][new Date(d+'T12:00:00').getDay()]}</span><span className="dd">{d.slice(8)}</span><span className="dm">{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(d.slice(5,7))-1]}</span></button>;})}
  {!expanded && dates.length>8 && <button className="v21-dmore" onClick={()=>setExpanded(true)}><ChevronRight size={10}/> More</button>}
  {expanded && <button className="v21-dmore" onClick={()=>setExpanded(false)}><ChevronLeft size={10}/> Less</button>}
  </div>;
});
const ScoreStepper = memo(function ScoreStepper({value,onChange}){
  const num=value===''||value==null?null:parseInt(value,10);
  return <div className="v21-stepper"><button className="v21-step" onClick={()=>onChange(String(Math.max(0,(num||0)-1)))}><Minus size={12}/></button><input className="v21-si" value={num!=null&&!isNaN(num)?num:''} onChange={e=>onChange(e.target.value.replace(/[^0-9]/g,'').slice(0,2))} placeholder="?" maxLength={2}/><button className="v21-step" onClick={()=>onChange(String(Math.min(99,(num||0)+1)))}><Plus size={12}/></button></div>;
});

const ZokaPickCard = memo(function ZokaPickCard({pick, index, voteStats, userVote, onVote, votingId, onShare}){
  const isFin=isFinishedStatus(pick.status,SPORT.FOOTBALL)||pick.isFinished; const isLive=isLiveStatus(pick.status,SPORT.FOOTBALL)||pick.isLive; const mid=String(pick.matchId);
  const res=useMemo(()=>{ if(pick.adminPick&&isFin&&pick.homeScore!=null){ const r=calcPoints(pick.adminPick.home,pick.adminPick.away,pick.homeScore,pick.awayScore); return {...r,resultType:r.type};} return null;},[pick.adminPick,isFin,pick.homeScore,pick.awayScore]);
  const vs=voteStats?.[mid]||{agree:0,disagree:0,total:0}; const myV=userVote?.[mid]; const isVoting=votingId===mid;
  const homeLogo=pick.homeLogo||pick.homeTeam?.logo; const awayLogo=pick.awayLogo||pick.awayTeam?.logo;
  const kickoff=parseKickoff(pick.kickoff||pick.date);
  const homeName=typeof pick.homeTeam==='object'?pick.homeTeam?.shortName||pick.homeTeam?.name||'Home':pick.homeTeam||'Home';
  const awayName=typeof pick.awayTeam==='object'?pick.awayTeam?.shortName||pick.awayTeam?.name||'Away':pick.awayTeam||'Away';
  const leagueName=pick.league?.name||'Zoka Pick'; const matchLink=buildMatchRoute(mid,homeName,awayName);
  let left='rgba(var(--gold-rgb),.12)'; if(res?.resultType==='exact') left='var(--primary)'; else if(res?.resultType==='result') left='var(--gold)'; else if(res?.resultType==='miss') left='var(--danger)';
  return <div className={`v21-mc zoka${isLive?' live':''}${isFin?' finished':''}`} style={{borderLeft:`3px solid ${left}`, animationDelay:`${index*30}ms`}}>
    <Link to={matchLink} className="v21-link-area"><div className="v21-mh"><div className="v21-ml">{pick.league?.emblem&&<img src={pick.league.emblem} alt="" width="14" height="14"/>}<span>{leagueName}</span></div><span className="v21-st" style={{color:isFin?'var(--primary)':isLive?'var(--danger)':'var(--text-muted)', background: isFin?'rgba(var(--primary-rgb),.1)':isLive?'rgba(var(--danger-rgb),.1)':'var(--bg-elevated)'}}>{isFin?'FT':isLive?(pick.minute||'LIVE'):kickoff}</span></div>
    <div className="v21-tm"><div className="v21-te">{homeLogo&&<img src={homeLogo} alt="" width="24" height="24"/>}<span>{homeName}</span></div>
      {isFin&&pick.homeScore!=null?<div className="v21-sb ft"><span className="v21-sn primary">{pick.homeScore}</span><span className="v21-sp">–</span><span className="v21-sn primary">{pick.awayScore}</span></div>:isLive&&pick.homeScore!=null?<div className="v21-sb live"><span className="v21-sn danger">{pick.homeScore}</span><span className="v21-sp">–</span><span className="v21-sn danger">{pick.awayScore}</span></div>:<div className="v21-sb"><span className="v21-sn gold">{pick.adminPick?.home??'?'}</span><span className="v21-sp">–</span><span className="v21-sn gold">{pick.adminPick?.away??'?'}</span></div>}
      <div className="v21-te aw">{awayLogo&&<img src={awayLogo} alt="" width="24" height="24"/>}<span>{awayName}</span></div></div></Link>
    <div className="v21-ma"><div className="flex-center gap-6">{isFin&&res&&<ResultBadge result={res}/>}
    {!isFin&&!isLive&&vs.total>0&&<><button className={`v21-vote${myV==='agree'?' agree-on':''}`} onClick={()=>onVote(mid,'agree')} disabled={isVoting}><ThumbsUp size={11}/> {vs.agree||0}</button><div className="v21-vote-bar"><div className="v21-vote-fill" style={{width:`${vs.total>0?Math.round((vs.agree/vs.total)*100):0}%`}}/></div><button className={`v21-vote${myV==='disagree'?' disagree-on':''}`} onClick={()=>onVote(mid,'disagree')} disabled={isVoting}><ThumbsDown size={11}/> {vs.disagree||0}</button></>}</div><button className="btn btn-ghost btn-sm" onClick={()=>onShare(pick,true)}><Share2 size={10}/> Share</button></div>
  </div>;
});

const PredCard = memo(function PredCard({pred,index,userPred,result,isEditing,editH,editA,onEdit,onSave,onCancel,onQuickPick,onEditH,onEditA,loggedIn,onLogin,saving,now,onShare,zokaPick=null,communityStats={}}){
  const mid=String(pred.matchId);
  const isFin=isFinishedStatus(pred.status,SPORT.FOOTBALL)||pred.isFinished; const isLive=isLiveStatus(pred.status,SPORT.FOOTBALL)||pred.isLive;
  const hasPred=!!userPred;
  const localResult=useMemo(()=>{ if(isFin&&hasPred&&pred.homeScore!=null){ const r=calcPoints(userPred.homeScore,userPred.awayScore,pred.homeScore,pred.awayScore); return {...r,resultType:r.type};} return null;},[isFin,hasPred,pred.homeScore,pred.awayScore,userPred]);
  const effective=result||localResult; const isResolved=!!effective&&effective.resultType!=='pending';
  const lockInfo=isMatchLocked(pred,now); const isLocked=lockInfo.locked;
  const homeLogo=pred.homeLogo||pred.homeTeam?.logo; const awayLogo=pred.awayLogo||pred.awayTeam?.logo;
  const homeName=typeof pred.homeTeam==='object'?pred.homeTeam?.shortName||pred.homeTeam?.name||'Home':pred.homeTeam||'Home';
  const awayName=typeof pred.awayTeam==='object'?pred.awayTeam?.shortName||pred.awayTeam?.name||'Away':pred.awayTeam||'Away';
  const kickoff=parseKickoff(pred.kickoff||pred.date); const leagueName=pred.league?.name||'Match'; const matchLink=buildMatchRoute(mid,homeName,awayName);
  const zokaHome=zokaPick?.adminPick?.home; const zokaAway=zokaPick?.adminPick?.away;
  const beatZoka=isFin&&hasPred&&zokaHome!=null?(calcPoints(userPred.homeScore,userPred.awayScore,pred.homeScore,pred.awayScore).points>calcPoints(zokaHome,zokaAway,pred.homeScore,pred.awayScore).points):false;
  const totalVotes=(communityStats?.home||0)+(communityStats?.draw||0)+(communityStats?.away||0);
  const homePct=totalVotes>0?Math.round(((communityStats?.home||0)/totalVotes)*100):0;
  const drawPct=totalVotes>0?Math.round(((communityStats?.draw||0)/totalVotes)*100):0;
  const awayPct=totalVotes>0?Math.round(((communityStats?.away||0)/totalVotes)*100):0;
  let left='var(--border)'; if(isResolved&&effective?.resultType==='exact') left='var(--primary)'; else if(isResolved&&effective?.resultType==='result') left='var(--gold)'; else if(isResolved&&effective?.resultType==='miss') left='var(--danger)'; else if(isFin) left='rgba(var(--primary-rgb),.2)'; else if(isLive) left='rgba(var(--danger-rgb),.3)'; else if(hasPred) left='var(--accent)';
  let cardCls='v21-mc'; if(isEditing) cardCls+=' editing'; else if(isLive) cardCls+=' live'; else if(isFin) cardCls+=' finished'; else if(isLocked&&!hasPred) cardCls+=' locked'
  let statusLabel=kickoff, statusColor='var(--text-muted)', statusBg='var(--bg-elevated)'; if(isEditing){statusLabel='EDITING'; statusColor='var(--primary)'; statusBg='rgba(var(--primary-rgb),.08)';} else if(isLive){statusLabel=pred.minute!=null?`${pred.minute}'`:'LIVE'; statusColor='var(--danger)'; statusBg='rgba(var(--danger-rgb),.1)';} else if(isFin){statusLabel='FT'; statusColor='var(--primary)'; statusBg='rgba(var(--primary-rgb),.08)';}
  return <div className={cardCls} style={{borderLeft:`3px solid ${left}`, animationDelay:`${index*20}ms`}}>
    <Link to={matchLink} className="v21-link-area"><div className="v21-mh"><div className="v21-ml">{pred.league?.emblem&&<img src={pred.league.emblem} alt="" width="14" height="14"/>}<span>{leagueName}</span></div><span className="v21-st" style={{color:statusColor,background:statusBg}}>{statusLabel}</span></div>
    <div className="v21-tm"><div className="v21-te">{homeLogo&&<img src={homeLogo} alt="" width="24" height="24"/>}<span>{homeName}</span></div>
    {isEditing?<div className="flex-center gap-4" onClick={e=>e.preventDefault()}><ScoreStepper value={editH} onChange={onEditH}/><span className="v21-sep">–</span><ScoreStepper value={editA} onChange={onEditA}/></div>:hasPred?<div className="v21-sb ft" style={!isFin?{borderColor:'rgba(var(--accent-rgb),.2)',background:'rgba(var(--accent-rgb),.05)'}:{}}><span className="v21-sn" style={{color:isFin?'var(--primary)':'var(--accent)'}}>{userPred.homeScore}</span><span className="v21-sp">–</span><span className="v21-sn" style={{color:isFin?'var(--primary)':'var(--accent)'}}>{userPred.awayScore}</span></div>:isFin&&pred.homeScore!=null?<div className="v21-sb ft"><span className="v21-sn primary">{pred.homeScore}</span><span className="v21-sp">–</span><span className="v21-sn primary">{pred.awayScore}</span></div>:<div className="v21-sb"><span className="v21-vs">VS</span></div>}
    <div className="v21-te aw">{awayLogo&&<img src={awayLogo} alt="" width="24" height="24"/>}<span>{awayName}</span></div></div>
    {!isEditing&&totalVotes>0&&<div className="v21-benchmark"><div className="benchmark-main"><div className="benchmark-title">Community ({totalVotes})</div><div className="benchmark-bar"><div className="bar-home" style={{width:`${homePct}%`}}/><div className="bar-draw" style={{width:`${drawPct}%`}}/><div className="bar-away" style={{width:`${awayPct}%`}}/></div><div className="benchmark-labels"><span className="primary">{homePct}% Home</span><span>{drawPct}% Draw</span><span className="danger">{awayPct}% Away</span></div></div>{zokaPick&&<div className="benchmark-zoka"><div className="benchmark-zoka-title"><Star size={10} className="gold"/> ZokaPick</div><div className="flex-center gap-6"><span className={`benchmark-score${beatZoka?' beat':''}`}>{zokaHome} - {zokaAway}</span>{beatZoka&&<span className="beat-badge">BEAT!</span>}</div></div>}</div>}
    </Link>
    <div className="v21-ma">
      {isEditing&&<div className="v21-qp">{QUICK_PICKS.map((qp,qi)=><button key={qi} className={`v21-qp-btn${editH===String(qp.h)&&editA===String(qp.a)?' sel':''}`} onClick={()=>onQuickPick(qp.h,qp.a)}>{qp.h}–{qp.a}</button>)}<button className="v21-qp-btn surprise" onClick={()=>onQuickPick(Math.floor(Math.random()*4),Math.floor(Math.random()*4))}><Dice5 size={12}/> Surprise</button></div>}
      <div className="v21-ma-actions">
        {isEditing?<><button className="btn btn-primary btn-sm" onClick={()=>onSave(pred)} disabled={saving||!editH||!editA}><Save size={10}/> Save</button><button className="btn btn-ghost btn-sm" onClick={onCancel}><X size={10}/> Cancel</button></>:isResolved?<><ResultBadge result={effective}/><button className="btn btn-ghost btn-sm" onClick={()=>onShare(pred,false)}><Share2 size={10}/> Share</button></>:isFin&&!hasPred?<span className="v21-bdg ms"><CircleX size={8}/> Missed</span>:isLocked&&!isFin?<span className="v21-bdg pn"><Lock size={8}/> {lockInfo.reason==='live'?'Live':lockInfo.reason==='closing'?`${formatMins(lockInfo.minutesLeft)} left`:'Started'}</span>:hasPred?<><span className="v21-bdg bl"><CheckCircle2 size={8}/> Saved</span>{!isLocked&&<button className="btn btn-ghost btn-sm" onClick={()=>onEdit(pred)}><Pencil size={9}/> Edit</button>}<button className="btn btn-ghost btn-sm" onClick={()=>onShare(pred,false)}><Share2 size={10}/> Share</button></>:lockInfo.minutesLeft!=null&&lockInfo.minutesLeft<=90?<span className="v21-lock-timer"><Clock size={9}/> {formatMins(lockInfo.minutesLeft)}</span>:loggedIn?<button className="btn btn-primary btn-sm" onClick={()=>onEdit(pred)}><Target size={10}/> Predict</button>:<button className="btn btn-ghost btn-sm" onClick={onLogin}><LogIn size={10}/> Login</button>}
      </div>
    </div>
  </div>;
});

const ResultsOverlay = memo(function ResultsOverlay({date,preds=[],userPredsObj,results,onClose,nav}){
  const overlayBoxRef=useRef(null); useEffect(()=>{ if(overlayBoxRef.current) overlayBoxRef.current.scrollTop=0; },[]);
  const upMap=useMemo(()=>{ const m=new Map(); Object.values(userPredsObj||{}).forEach(p=>{ if(p.predId) m.set(p.predId,p); if(p.matchId) m.set(String(p.matchId),p); }); return m;},[userPredsObj]);
  const resMap=useMemo(()=>{ const m=new Map(); (results||[]).forEach(r=>m.set(String(r.matchId),r)); return m;},[results]);
  const stats=useMemo(()=>{ let totalPts=0,exact=0,result=0,miss=0,pending=0,predicted=0; (preds||[]).forEach(p=>{ const up=upMap.get(String(p.matchId)); if(!up) return; predicted++; let res=resMap.get(String(p.matchId)); if((!res||res.resultType==='pending')&&(isFinishedStatus(p.status,SPORT.FOOTBALL)||p.isFinished)&&p.homeScore!=null){ const r=calcPoints(up.homeScore,up.awayScore,p.homeScore,p.awayScore); res={...r,resultType:r.type}; } if(!res||res.resultType==='pending'){pending++;return;} if(res.resultType==='exact'){exact++; totalPts+=res.points||10;} else if(res.resultType==='result'){result++; totalPts+=res.points||3;} else miss++; }); return {totalPts,exact,result,miss,pending,predicted,allResolved:predicted>0&&pending===0,accuracy:predicted>0?Math.round(((exact+result)/predicted)*100):0};},[preds,upMap,resMap]);
  return <div className="v21-overlay" onClick={onClose}><div className="v21-overlay-box" ref={overlayBoxRef} onClick={e=>e.stopPropagation()}><div className="v21-overlay-handle"/><div className="overlay-content"><div className="flex-between mb-12"><div><div className="font-extrabold">My Results</div><div className="text-xs muted">{dateLabel(date)}</div></div><button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14}/></button></div>
  <div className="v21-stats"><div className="v21-stat"><div className="n accent"><AnimNum value={stats.totalPts}/></div><div className="l">Points</div></div><div className="v21-stat"><div className="n primary"><AnimNum value={stats.exact}/></div><div className="l">Exact</div></div><div className="v21-stat"><div className="n gold"><AnimNum value={stats.result}/></div><div className="l">Results</div></div></div>
  {stats.predicted>0&&<div className="v21-progress"><div className="v21-progress-bar"><div className="v21-progress-fill" style={{width:`${((stats.predicted-stats.pending)/stats.predicted)*100}%`}}/></div><div className="v21-progress-labels"><span>{stats.predicted} predicted</span><span>{stats.allResolved?'✓ Complete':`${stats.pending} pending`}</span></div></div>}
  {(preds||[]).map((p,i)=>{ const up=upMap.get(String(p.matchId)); if(!up) return null; let res=resMap.get(String(p.matchId)); if((!res||res.resultType==='pending')&&(isFinishedStatus(p.status,SPORT.FOOTBALL)||p.isFinished)&&p.homeScore!=null){ const r=calcPoints(up.homeScore,up.awayScore,p.homeScore,p.awayScore); res={...r,resultType:r.type}; } const rType=res?.resultType; const matchLink=buildMatchRoute(p.matchId,p.homeTeam?.name||'Home',p.awayTeam?.name||'Away'); return <Link to={matchLink} key={p.id||i} className="v21-res-row" style={{borderLeft:rType==='exact'?'3px solid var(--primary)':rType==='result'?'3px solid var(--gold)':rType==='miss'?'3px solid var(--danger)':'3px solid var(--border)'}}><div className="flex-1 truncate font-bold text-xs">{typeof p.homeTeam==='object'?p.homeTeam?.shortName||p.homeTeam?.name:p.homeTeam} vs {typeof p.awayTeam==='object'?p.awayTeam?.shortName||p.awayTeam?.name:p.awayTeam}</div><div className="flex-center gap-4"><span className="v21-pred-chip">{up.homeScore}-{up.awayScore}</span>{rType&&rType!=='pending'&&<span className={`v21-bdg ${rType==='exact'?'ex':rType==='result'?'rs':'ms'}`}>+{res.points||0}</span>}</div></Link>;})}
  {stats.predicted===0&&<EmptyState icon={Target} title="No predictions for this day"/>}
  {stats.allResolved&&<div className="rank-complete"><Trophy size={22} className="primary"/><div className="font-extrabold">All Results In!</div><div className="text-sm muted">You scored <strong className="accent">{stats.totalPts} pts</strong> · {stats.accuracy}% accuracy</div><button className="btn btn-primary" onClick={()=>{onClose(); nav('/leaderboard');}}>View Leaderboard <ArrowRight size={13}/></button></div>}
  </div></div></div>;
});
export default function Predictions(){
  const {currentUser,userProfile}=useAuth(); const nav=useNavigate(); const location=useLocation(); const queryClient=useQueryClient(); const toast=useToast();
  const uid=currentUser?.uid; const loggedIn=!!uid; const displayName=currentUser?.displayName||currentUser?.email?.split('@')[0]||'Anonymous';

  /* ★ TAB SWITCHER — URL-backed, 'groups' is the default first surface */
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'mine' ? 'mine' : 'groups';
  const switchTab = useCallback((t) => { setSearchParams(t === 'mine' ? { tab: 'mine' } : {}, { replace: true }); }, [setSearchParams]);

  const [selDate,setSelDate]=useState(todayStr()); const [now,setNow]=useState(Date.now());
  const [filter,setFilter]=useState('all'); const [showLogin,setShowLogin]=useState(false); const [showResults,setShowResults]=useState(false);
  const [zokaExpanded,setZokaExpanded]=useState(false); const [editingId,setEditingId]=useState(null); const [editH,setEditH]=useState(''); const [editA,setEditA]=useState(''); // ★ was broken: setEditA=''
  const [saving,setSaving]=useState(false); const [votingId,setVotingId]=useState(null); const [currentUserVotes,setCurrentUserVotes]=useState({}); const [joke,setJoke]=useState(getJoke());

  const {data:activePredictions=[],isLoading:loadingActive}=useActivePredictions(selDate);
  const {data:userPredictions,isLoading:loadingPreds}=useUserPredictions(uid,selDate);
  const {data:dailyLB=null}=useDailyLeaderboard(selDate);
  const {data:zokaPicksData=null}=useZokaPicks(selDate);
  const {data:zokaVotesData={stats:{}}}=useZokaVotes(selDate);
  const {data:userPoints=null}=useUserPoints(uid);
  const {data:dateFixtures=[]}=useFixtures(selDate);
  const {data:publishedGroups=null}=usePublishedPickGroups(selDate);
  const {data:officialResults=[]}=useQuery({queryKey:['userResults',uid,selDate],queryFn:async()=>{ if(!uid||!db||!selDate) return []; const q=query(collection(db,PATHS.PREDICTION_RESULTS),where('userId','==',uid),where('matchDate','==',selDate)); const snap=await getDocs(q); return snap.docs.map(d=>d.data());},enabled:!!uid&&!!selDate,staleTime:60*1000});

  const featuredPreds=activePredictions||[]; const zokaPicks=zokaPicksData; const zokaVoteStats=zokaVotesData?.stats||{}; const ctxUserPreds=userPredictions||{}; const dailyEntries=dailyLB?.entries||[]; const userStats=userPoints||{};
  const fixtureMap=useMemo(()=>{ const m=new Map(); (dateFixtures||[]).forEach(f=>m.set(String(f.id),f)); return m;},[dateFixtures]);
  useEffect(()=>{ try{ setCurrentUserVotes(JSON.parse(localStorage.getItem(`zoka_votes_${selDate}`)||'{}')); }catch{ setCurrentUserVotes({}); }},[selDate]);
  const mergedFeatured=useMemo(()=>mergeLiveIntoPredictions(featuredPreds,fixtureMap),[featuredPreds,fixtureMap]);
  const mergedZoka=useMemo(()=>mergeLiveIntoPredictions(zokaPicks?.matches||[],fixtureMap),[zokaPicks,fixtureMap]);
  const userPredMap=useMemo(()=>{ const m=new Map(); Object.values(ctxUserPreds||{}).forEach(p=>{ if(p.predId) m.set(p.predId,p); if(p.matchId) m.set(String(p.matchId),p); }); return m;},[ctxUserPreds]);
  const resultMap=useMemo(()=>{ const m=new Map(); (officialResults||[]).forEach(r=>m.set(String(r.matchId),r)); return m;},[officialResults]);
  const myDayStats=useMemo(()=>calculateUserStats(Object.values(ctxUserPreds),mergedFeatured,officialResults||[])||{pts:0,ex:0,rs:0,pred:0,pn:0,allResolved:false,accuracy:0},[ctxUserPreds,mergedFeatured,officialResults]);
  const performanceMsg=useMemo(()=>{ if(!loggedIn) return null; if(myDayStats.allResolved){ if(myDayStats.accuracy>=70) return {text:"🎯 Prediction Master! True football oracle.",color:'var(--primary)'}; if(myDayStats.accuracy>=40) return {text:"👍 Good job! Keep studying form.",color:'var(--accent)'}; return {text:"😅 Tough day? Tomorrow is another matchday!",color:'var(--gold)'}; } if(myDayStats.ex>=3) return {text:"🔥 On Fire! Three exact hits!",color:'var(--danger)'}; if(myDayStats.pred>0) return {text:"⚽ Matches in play. May odds be ever in your favor!",color:'var(--accent)'}; return null;},[loggedIn,myDayStats]);
  const openLogin=useCallback(()=>setShowLogin(true),[]);
  const handleShare=useCallback(async(pred,isZoka=false)=>{ if(!uid){openLogin();return;} const baseUrl=window.location.origin; const matchId=pred.matchId||pred.id; const shareUrl=`${baseUrl}/u/${uid}/picks/${matchId}`; let homeName=typeof pred.homeTeam==='object'?pred.homeTeam?.shortName||pred.homeTeam?.name||'Home':pred.homeTeam||'Home'; let awayName=typeof pred.awayTeam==='object'?pred.awayTeam?.shortName||pred.awayTeam?.name||'Away':pred.awayTeam||'Away'; let shareText=isZoka?`ZOKA went with ${pred.adminPick?.home}-${pred.adminPick?.away}. Do you agree? Join: `: `Think you know football? I predicted ${homeName} vs ${awayName} on ZOKASCORE. Beat me! Join: `; if(navigator.share){ try{ await navigator.share({title:'ZOKASCORE League',text:shareText,url:shareUrl}); toast.success('Shared! Earn points when friends visit.'); }catch{} } else { try{ await navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`); toast.success('Copied!'); }catch{ toast.error(`Copy manually: ${shareUrl}`);} }},[uid,openLogin,toast]);
  const handleBannerShare=useCallback(async()=>{ if(!uid){openLogin();return;} const total=userStats?.predicted||myDayStats.pred||0; const correct=(userStats?.exact||myDayStats.ex||0)+(userStats?.result||myDayStats.rs||0); const points=userStats?.points||myDayStats.pts||0; const shareUrl=`${window.location.origin}/predictions?ref=${encodeURIComponent(uid)}`; let shareText=total>0?`🔥 I predicted ${correct}/${total} and scored ${points} pts! Beat me? Join: ${shareUrl}`:`I'm predicting live on ZOKASCORE! Join: ${shareUrl}`; if(navigator.share){ try{ await navigator.share({title:'ZOKASCORE',text:shareText,url:shareUrl}); }catch{} } else { try{ await navigator.clipboard.writeText(shareText); toast.success('Copied!'); }catch{ toast.error(`Copy manually: ${shareText}`);} }},[uid,userStats,myDayStats,openLogin,toast]);
  const startEdit=useCallback((pred)=>{ const mid=String(pred.matchId); const existing=userPredMap.get(mid); setEditingId(mid); setEditH(existing?String(existing.homeScore):''); setEditA(existing?String(existing.awayScore):''); },[userPredMap]);
  const cancelEdit=useCallback(()=>{ setEditingId(null); setEditH(''); setEditA(''); },[]);
  const quickPick=useCallback((h,a)=>{ setEditH(String(h)); setEditA(String(a)); },[]);
  const savePrediction=useCallback(async(pred)=>{ if(!uid||!editingId) return; const h=parseInt(editH,10), a=parseInt(editA,10); if(isNaN(h)||isNaN(a)){toast.error('Enter valid scores');return;} setSaving(true); try{ const matchId=String(pred.matchId||editingId), matchDate=pred.matchDate||selDate; await savePredictionAction(uid,displayName,{...pred,id:editingId,matchId,matchDate},h,a); setEditingId(null); setEditH(''); setEditA(''); toast.success(`${h}-${a} saved`); queryClient.invalidateQueries(['userPredictions',uid,selDate]); }catch(e){ toast.error('Save failed'); } setSaving(false); },[uid,editingId,editH,editA,selDate,displayName,queryClient,toast]);
  const handleVote=useCallback(async(matchId,vote)=>{ if(!uid){openLogin();return;} const midStr=String(matchId||''); setVotingId(midStr); try{ const oldVote=currentUserVotes[midStr]; if(oldVote===vote){ await removeZokaVote(uid,midStr,null); setCurrentUserVotes(prev=>{ const n={...prev}; delete n[midStr]; try{localStorage.setItem(`zoka_votes_${selDate}`,JSON.stringify(n));}catch{} return n; }); } else { await saveZokaVote(uid,midStr,vote); setCurrentUserVotes(prev=>{ const n={...prev,[midStr]:vote}; try{localStorage.setItem(`zoka_votes_${selDate}`,JSON.stringify(n));}catch{} return n; }); } queryClient.invalidateQueries(['zokaVotes',selDate]); }catch{} setVotingId(null); },[uid,openLogin,currentUserVotes,selDate,queryClient]);
  const handleDateChange=useCallback((d)=>{ setSelDate(d); setFilter('all'); setZokaExpanded(false); cancelEdit(); },[cancelEdit]);
  useEffect(()=>{ const params=new URLSearchParams(location.search); const referrer=params.get('ref'); if(referrer){ let deviceId=localStorage.getItem('zk_device_id'); if(!deviceId){ deviceId='dev_'+Math.random().toString(36).substring(2,12)+Date.now().toString(36); localStorage.setItem('zk_device_id',deviceId);} const visitKey=`zk_ref_${referrer}_${deviceId}`; if(!localStorage.getItem(visitKey)){ localStorage.setItem(visitKey,'1'); if(db){ setDoc(doc(db,'referral_visits',visitKey),{referrerUid:referrer,visitorDeviceId:deviceId,visitorUid:uid||null,visitedAt:serverTimestamp(),status:'pending'}).catch(()=>{});} } } },[location.search,uid]);
  useEffect(()=>{ const id=setInterval(()=>setNow(Date.now()),30000); return()=>clearInterval(id); },[]);
  const dateList=useMemo(()=>{ const arr=[]; for(let i=-14;i<=FUTURE_DAYS;i++) arr.push(dateOffset(i)); return arr; },[]);
  const visibleZoka=useMemo(()=>{ if(mergedZoka.length<=ZOKA_VISIBLE) return mergedZoka; return zokaExpanded?mergedZoka:mergedZoka.slice(0,ZOKA_VISIBLE); },[mergedZoka,zokaExpanded]);
  const hiddenZokaCount=mergedZoka.length-ZOKA_VISIBLE;
  const deferredFilter=useDeferredValue(filter);
  const filteredPreds=useMemo(()=>{ if(deferredFilter==='predicted') return mergedFeatured.filter(p=>userPredMap.get(String(p.matchId))); if(deferredFilter==='unpredicted') return mergedFeatured.filter(p=>!userPredMap.get(String(p.matchId))&&!isFinishedStatus(p.status,SPORT.FOOTBALL)); if(deferredFilter==='finished') return mergedFeatured.filter(p=>isFinishedStatus(p.status,SPORT.FOOTBALL)||p.isFinished); return mergedFeatured; },[mergedFeatured,userPredMap,deferredFilter]);
  const filterCounts=useMemo(()=>({all:mergedFeatured.length,predicted:mergedFeatured.filter(p=>userPredMap.get(String(p.matchId))).length,unpredicted:mergedFeatured.filter(p=>!userPredMap.get(String(p.matchId))&&!isFinishedStatus(p.status,SPORT.FOOTBALL)).length,finished:mergedFeatured.filter(p=>isFinishedStatus(p.status,SPORT.FOOTBALL)||p.isFinished).length}),[mergedFeatured,userPredMap]);
  const myRank=useMemo(()=>{ if(!uid||!dailyEntries) return null; return dailyEntries.find(u=>u.uid===uid)||null; },[dailyEntries,uid]);
  const getCommunityStats=useCallback((matchId)=>{ let home=0,draw=0,away=0; Object.values(ctxUserPreds).forEach(p=>{ if(String(p.matchId)===String(matchId)){ if(p.homeScore>p.awayScore) home++; else if(p.homeScore===p.awayScore) draw++; else away++; } }); return {home,draw,away,total:home+draw+away}; },[ctxUserPreds]);
  const itemListSchema=useMemo(()=>({ "@context":"https://schema.org","@type":"ItemList","name":"Daily Football Predictions & Expert Tips","itemListElement":filteredPreds.slice(0,20).map((p,i)=>({"@type":"ListItem","position":i+1,"name":`${p.homeTeam?.name||'Home'} vs ${p.awayTeam?.name||'Away'}`,"url":`${SITE.url}${buildMatchRoute(p.matchId,p.homeTeam?.name,p.awayTeam?.name)}`}))}),[filteredPreds]);

  /* ★ Zoka Picks — bottom of the groups tab */
  const zokaSection = mergedZoka.length>0 ? (
    <div className="v21-zoka" style={{ marginTop: 20 }}>
      <div className="v21-zoka-hd"><div className="v21-zoka-icon"><Star size={14} className="gold"/></div><div><div className="font-extrabold">Zoka Picks</div><div className="text-xs muted">{mergedZoka.length} picks · Not for competition</div></div></div>
      {visibleZoka.map((pick,i)=><ZokaPickCard key={pick.matchId||i} pick={pick} index={i} voteStats={zokaVoteStats} userVote={currentUserVotes} onVote={handleVote} votingId={votingId} onShare={handleShare}/>)}
      {hiddenZokaCount>0&&!zokaExpanded&&<button className="v21-zoka-more" onClick={()=>setZokaExpanded(true)}><ChevronDown size={14}/> Show {hiddenZokaCount} More</button>}
      {zokaExpanded&&hiddenZokaCount>0&&<button className="v21-zoka-more" onClick={()=>setZokaExpanded(false)}><ChevronUp size={14}/> Show Less</button>}
    </div>
  ) : null;

  return <div className="pred-page">
    <SEO title="Predict Football Matches, Win Points & Climb Leaderboards | ZOKASCORE" description="Predict exact football scores, compete, climb global leaderboard. Zoka AI expert picks + community voting." keywords="football predictions, exact score, ZOKASCORE leaderboard" path="/predictions" structuredData={itemListSchema}/>
    <div className="pred-hdr"><button className="btn btn-ghost btn-sm" onClick={()=>nav('/')}><ArrowLeft size={12}/> Home</button><div className="pred-hdr-title"><h1><span> MATCH</span><span className="primary">PREDICT</span></h1><div className="sub">Predict · Compete · Win</div></div>{tab==='mine'&&<button className="btn btn-ghost btn-sm" onClick={()=>setShowResults(true)}>Results</button>}</div>
    <div className="pred-date-wrap"><DateStrip date={selDate} onChange={handleDateChange} dates={dateList}/></div>

    <div className="pred-wrap">
      {/* ★ TAB SWITCHER */}
      <div className="v21-tabs">
        <button className={`v21-tab${tab==='groups'?' on':''}`} onClick={()=>switchTab('groups')}><Sparkles size={14}/> Expert Groups</button>
        <button className={`v21-tab${tab==='mine'?' on':''}`} onClick={()=>switchTab('mine')}><Users size={14}/> My Predictions</button>
      </div>

      {/* ══════ TAB 1 — EXPERT GROUPS (default) ══════ */}
      {tab==='groups'&&<div className="v21-groups-tab">
        {publishedGroups ? (
          <>
            <PickGroupsView data={publishedGroups} date={selDate} />
            <GroupInsights />
            <GroupFeedback date={selDate} familyOrder={publishedGroups?.familyOrder || []} />
          </>
        ) : (
          <>
            <GroupInsights />
            <div className="glass-card p-20 mb-16 text-center">
              <Sparkles size={22} className="gold" style={{ margin: '0 auto 8px', display: 'block' }} />
              <div className="font-extrabold">Expert groups are being prepared</div>
              <p className="text-muted text-sm" style={{ margin: '6px 0 0' }}>
                Curated ML picks for {dateLabel(selDate)} drop here once published.{selDate===todayStr()?' Check back shortly.':''}
              </p>
            </div>
          </>
        )}
        {zokaSection}
      </div>}

      {/* ══════ TAB 2 — MY PREDICTIONS ══════ */}
      {tab==='mine'&&<div className="v21-mine-tab">
        <div className="glass-card editorial-card"><h2>Master the Art of Football Prediction</h2><p>Welcome to ZOKASCORE Prediction Hub. Analyze form, H2H, Zoka AI picks to lock exact scores. Earn 10 pts exact, 3 pts outcome. Climb leaderboards.</p></div>
        <div className="v21-joke-box"><Zap size={14} className="gold"/><span>{joke}</span><button onClick={()=>setJoke(getJoke())} className="btn-icon-sm"><RefreshCw size={12}/></button></div>
        {performanceMsg&&<div className="v21-perf-banner" style={{borderColor:`${performanceMsg.color}33`,color:performanceMsg.color,background:`${performanceMsg.color}11`}}>{performanceMsg.text}</div>}
        {loggedIn&&<div className="my-stats-block"><div className="v21-stats"><div className="v21-stat"><div className="n gold"><AnimNum value={myDayStats.pts}/></div><div className="l">Points</div></div><div className="v21-stat"><div className="n primary"><AnimNum value={myDayStats.ex}/></div><div className="l">Exact</div></div><div className="v21-stat"><div className="n gold"><AnimNum value={myDayStats.rs}/></div><div className="l">Results</div></div><div className="v21-stat"><div className="n accent">{myRank?`#${myRank.rank}`:'—'}</div><div className="l">Rank</div></div></div>
        {myDayStats.pred>0&&<div className="v21-progress"><div className="v21-progress-bar"><div className="v21-progress-fill" style={{width:`${((myDayStats.pred-myDayStats.pn)/myDayStats.pred)*100}%`}}/></div><div className="v21-progress-labels"><span>{myDayStats.pred} predicted · {myDayStats.accuracy}% accuracy</span><span>{myDayStats.allResolved?'✓ Complete':`${myDayStats.pn} pending`}</span></div></div>}
        </div>}
        {loggedIn&&myDayStats.pred>0&&<div className="glass-card v21-banner"><Trophy size={18} className="gold"/><span className="v21-banner-text">You've predicted {myDayStats.pred} matches today! Challenge friends.</span><button className="v21-banner-btn" onClick={handleBannerShare}><Share2 size={14}/> Share & Challenge</button></div>}
        {!loggedIn&&<div className="glass-card v21-banner"><Lock size={18} className="accent"/><span className="v21-banner-text">Sign in to lock predictions and climb leaderboard.</span><Link to="/login" className="v21-banner-btn"><Zap size={14}/> Sign In to Predict</Link></div>}
        <div className="v21-filter">{[{key:'all',label:'All',count:filterCounts.all},{key:'predicted',label:'Predicted',count:filterCounts.predicted},{key:'unpredicted',label:'Open',count:filterCounts.unpredicted},{key:'finished',label:'Finished',count:filterCounts.finished}].map(f=><button key={f.key} className={`v21-fbtn${filter===f.key?' on':''}`} onClick={()=>setFilter(f.key)}>{f.label} ({f.count})</button>)}</div>
        <div className="v21-featured-section"><div className="v21-sec"><div className="v21-sec-icon"><Target size={13}/></div><div className="font-extrabold text-sm">Featured — Compete</div><span className="v21-sec-badge">{filteredPreds.length}</span></div>
          {loadingActive?Array.from({length:3}).map((_,i)=><Skeleton key={i}/>):filteredPreds.length>0?filteredPreds.map((pred,i)=>{ const predId=String(pred.matchId); return <React.Fragment key={predId}><PredCard pred={pred} index={i} userPred={userPredMap.get(predId)} result={resultMap.get(predId)} isEditing={editingId===predId} editH={editH} editA={editA} onEdit={startEdit} onSave={savePrediction} onCancel={cancelEdit} onQuickPick={quickPick} onEditH={setEditH} onEditA={setEditA} loggedIn={loggedIn} onLogin={openLogin} saving={saving} now={now} onShare={handleShare} zokaPick={mergedZoka.find(z=>String(z.matchId)===predId)} communityStats={getCommunityStats(predId)}/></React.Fragment>; }):<EmptyState icon={Target} title={filter==='predicted'?'No predictions yet':filter==='finished'?'No finished matches':filter==='unpredicted'?'All predicted!':'No featured matches'} hint="Check back later"/>}
        </div>
        {myDayStats.allResolved&&myDayStats.pred>0&&<div className="rank-complete"><Trophy size={24} className="primary"/><div className="font-extrabold">All Results In!</div><div className="text-sm muted">You scored <strong className="accent">{myDayStats.pts} pts</strong> · {myDayStats.accuracy}% accuracy</div><button className="btn btn-primary" onClick={()=>nav('/leaderboard')}>View Leaderboard <ArrowRight size={13}/></button></div>}
      </div>}
    </div>
    {showLogin&&<LoginModal onClose={()=>setShowLogin(false)} nav={nav}/>}
    {showResults&&<ResultsOverlay date={selDate} preds={mergedFeatured} userPredsObj={ctxUserPreds} results={officialResults} onClose={()=>setShowResults(false)} nav={nav}/>}
  </div>;
}