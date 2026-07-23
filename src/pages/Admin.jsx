// ═════════════════════════════════════════════════════════════════════════════════
// FILE: src/pages/Admin.jsx
// v15.4 Pro UI — Smart Match Locking, Memoized Tabs, Zero-Jank Admin Panel
// ★ CLEANED: Robust data normalization, true local time, seamless split-merge fix.
// ═════════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert, Trash2, CheckCircle2, XCircle, Zap, Trophy,
  CalendarDays, BarChart3, Crown, Pencil, Check, Radio,
  AlertTriangle, Loader2, Plus, ChevronDown, Send,
  Clock, TrendingUp, Star, Sparkles, X,
  Save, Timer, Users, UserCog, Search,
  LayoutDashboard, Copy, History,
  ChevronUp, RotateCcw, Activity, Megaphone,
  Ban, ArrowLeft
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useFootballData } from '../context/FootballDataContext'; 
import { db } from '../utils/firebase';
import { dataLayer } from '../utils/dataLayer';
import { todayStr, getLocalDateStr, getLocalDateFromUtc, formatTime, formatDateShort } from '../utils/dates';
import { eventBus, EVENT } from '../utils/eventBus';
import { isLiveStatus, isFinishedStatus, PATHS, CACHE_KEY, SPORT } from '../utils/constants';
import { fetchFixtures } from '../utils/api';
import {
  resolveMatchForAllUsers, rebuildDailySummary, rebuildGoatLeaderboard,
  rebuildPeriodLeaderboard, rebuildAllLeaderboards
} from '../hooks/useMatchData';

import {
  collection, query, where, onSnapshot, doc, setDoc, deleteDoc,
  serverTimestamp, getDoc, getDocs, limit as limitQ, startAfter, addDoc
} from 'firebase/firestore';

import SEO from '../components/SEO';

/* ═════════════════════════════════════════════════════════════════════════════════
   CONSTANTS & HELPERS
   ═════════════════════════════════════════════════════════════════════════════════ */
const MAX_FEATURED = 10;
const MAX_ZOKA = 10;
const SHOW_INIT = 8;

const dateOffset = (o = 0) => getLocalDateStr(o); 
const dateLabel = (d) => {
  const t = todayStr(), tm = getLocalDateStr(1), ys = getLocalDateStr(-1);
  if (d === t) return 'Today'; if (d === tm) return 'Tomorrow'; if (d === ys) return 'Yesterday';
  const dt = new Date(d + 'T12:00:00'), days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return `${days[dt.getDay()]} ${d.slice(5)}`;
};

function extractMatchDate(m) {
  if (!m) return '';
  if (m.utcDate) return getLocalDateFromUtc(m.utcDate);
  if (m.date && m.date.includes('T')) return m.date.split('T')[0];
  if (m.date) return m.date;
  return '';
}
const extractDate = m => extractMatchDate(m);

// ★ UPGRADED: Handles both Primary (flat) and Backup (nested) data structures perfectly
function normalizeMatch(raw, isPrimary = true) {
  if (!raw) return null;
  const id = String(raw.id || raw.matchId);
  const status = raw.status || '';
  
  const homeTeam = raw.homeTeam || { name: raw.homeTeamName, shortName: raw.homeTeamName, crest: raw.homeLogo };
  const awayTeam = raw.awayTeam || { name: raw.awayTeamName, shortName: raw.awayTeamName, crest: raw.awayLogo };
  const league = raw.league || raw.competition || { name: raw.leagueName, emblem: raw.leagueLogo };

  const live = isLiveStatus(status, 'football') || !!raw.isLive;
  const finished = isFinishedStatus(status, 'football') || !!raw.isFinished;
  
  const homeScore = raw.homeScore != null ? raw.homeScore : (raw.score?.fullTime?.home ?? raw.score?.halfTime?.home ?? null);
  const awayScore = raw.awayScore != null ? raw.awayScore : (raw.score?.fullTime?.away ?? raw.score?.halfTime?.away ?? null);

  return {
    id, status, isLive: live, isFinished: finished,
    homeTeam: { 
      name: homeTeam.name || 'TBD', 
      shortName: homeTeam.shortName || homeTeam.name || 'TBD', 
      crest: homeTeam.crest 
    },
    awayTeam: { 
      name: awayTeam.name || 'TBD', 
      shortName: awayTeam.shortName || awayTeam.name || 'TBD', 
      crest: awayTeam.crest 
    },
    homeScore, awayScore,
    league: { name: league.name || 'Other', emblem: league.emblem || league.logo },
    competition: league,
    utcDate: raw.utcDate || raw.date || raw.kickoff,
    minute: raw.minute || raw.elapsed || null
  };
}

const ST_MAP = {
  SCHEDULED:{c:'var(--text-muted)',b:'rgba(255,255,255,.04)',l:'Upcoming'},
  TIMED:{c:'var(--text-muted)',b:'rgba(255,255,255,.04)',l:'Upcoming'},
  NS:{c:'var(--text-muted)',b:'rgba(255,255,255,.04)',l:'Upcoming'},
  TBD:{c:'var(--text-muted)',b:'rgba(255,255,255,.04)',l:'TBD'},
  IN_PLAY:{c:'#ef4444',b:'rgba(239,68,68,.1)',l:'Live'},
  PAUSED:{c:'#f97316',b:'rgba(249,115,22,.1)',l:'HT'},
  '1H':{c:'#ef4444',b:'rgba(239,68,68,.1)',l:'Live'},
  '2H':{c:'#ef4444',b:'rgba(239,68,68,.1)',l:'Live'},
  HT:{c:'#f97316',b:'rgba(249,115,22,.1)',l:'HT'},
  BT:{c:'#f97316',b:'rgba(249,115,22,.1)',l:'BT'},
  ET:{c:'#ef4444',b:'rgba(239,68,68,.1)',l:'ET'},
  P:{c:'#ef4444',b:'rgba(239,68,68,.1)',l:'Pens'},
  FT:{c:'var(--accent)',b:'rgba(16,185,129,.08)',l:'FT'},
  FINISHED:{c:'var(--accent)',b:'rgba(16,185,129,.08)',l:'FT'},
  AET:{c:'var(--accent)',b:'rgba(16,185,129,.08)',l:'FT'},
  PEN:{c:'var(--accent)',b:'rgba(16,185,129,.08)',l:'FT'},
  PST:{c:'#f59e0b',b:'rgba(245,158,11,.1)',l:'PST'},
};
const gst = s => ST_MAP[s] || ST_MAP.SCHEDULED;

const isLive = m => isLiveStatus(m?.status, m?.sport || 'football') || m?.isLive;
const isFin = m => isFinishedStatus(m?.status, m?.sport || 'football') || m?.isFinished;
const getScore = m => m?.score?.fullTime ? {h:m.score.fullTime.home,a:m.score.fullTime.away} : m?.homeScore!=null ? {h:m.homeScore,a:m.awayScore} : {h:null,a:null};

// ★ SMART MATCH LOCKING
const hasMatchStarted = (m) => {
  if (!m) return false;
  if (isLive(m) || isFin(m)) return true;
  const kickoffStr = m?.utcDate || m?.date || m?.kickoff;
  if (kickoffStr) {
    const kickoffTime = new Date(kickoffStr).getTime();
    if (!isNaN(kickoffTime) && kickoffTime <= Date.now()) {
      return true; 
    }
  }
  return false;
};

const fmtTimeAgo = dt => {
  if (!dt) return 'Never';
  let ts;
  if (typeof dt==='number') ts = dt<1e12?dt*1000:dt;
  else if (typeof dt==='string') { ts=Date.parse(dt); if(isNaN(ts)) return 'Unknown'; }
  else if (dt.seconds!=null) ts=dt.seconds*1000;
  else if (dt?.getTime) ts=dt.getTime();
  else return 'Unknown';
  const s=Math.floor((Date.now()-ts)/1000);
  if(s<10) return 'Just now'; if(s<60) return `${s}s ago`;
  const m=Math.floor(s/60); if(m<60) return `${m}m ago`;
  const h=Math.floor(m/60); if(h<24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
};

const TABS = [
  {key:'dashboard',label:'Dashboard',icon:LayoutDashboard},
  {key:'zoka',label:'Zoka Picks',icon:Star},
  {key:'featured',label:'Featured',icon:Radio},
  {key:'results',label:'Results',icon:Trophy},
  {key:'broadcast',label:'Broadcast',icon:Megaphone},
  {key:'staff',label:'Staff',icon:UserCog},
  {key:'users',label:'Users',icon:Users},
];

/* ═════════════════════════════════════════════════════════════════════════════════
   HOOKS & MEMOIZED SMALL COMPONENTS
   ═════════════════════════════════════════════════════════════════════════════════ */
function useMounted() { const r = useRef(true); useEffect(() => () => { r.current = false; }, []); return r; }

const Toast = memo(function Toast({ message, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  const Ic = type === 'ok' ? CheckCircle2 : type === 'er' ? XCircle : AlertTriangle;
  return <div className={`atst ${type}`}><Ic size={15} /> {message}</div>;
});

const Confirm = memo(function Confirm({ title, msg, onYes, onNo, yesText = 'Confirm', danger = false }) {
  return (
    <div className="aov" onClick={onNo}>
      <div className="abox" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3><p>{msg}</p>
        <div className="abbtns">
          <button className="ab ab-gh" onClick={onNo}>Cancel</button>
          <button className={`ab ${danger ? 'ab-dg' : 'ab-p'}`} onClick={onYes}>{yesText}</button>
        </div>
      </div>
    </div>
  );
});

const Skel = memo(function Skel({ n = 3 }) {
  return <div>{Array.from({ length: n }).map((_, i) => <div key={i} className="askel" style={{ animationDelay: `${i * 80}ms` }} />)}</div>;
});

const Empty = memo(function Empty({ icon: Ic, title, hint }) {
  return (
    <div className="aem">
      {Ic && <Ic size={26} style={{ color: 'var(--text-muted)', display: 'block', margin: '0 auto 6px' }} />}
      <p>{title}</p>{hint && <p className="h">{hint}</p>}
    </div>
  );
});

const ShowMore = memo(function ShowMore({ count, show, onToggle }) {
  if (count <= 0) return null;
  return (
    <button className="asm" onClick={onToggle} style={{ marginTop: 8 }}>
      {show ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      {show ? 'Show less' : `Show ${count} more`}
    </button>
  );
});

const RBadge = memo(function RBadge({ pick }) {
  if (!pick?.adminPick || pick.status !== 'finished') return null;
  const h = pick.adminPick.home, a = pick.adminPick.away, ph = pick.homeScore, pa = pick.awayScore;
  if (ph == null || pa == null) return <span className="abdg pn">PENDING</span>;
  if (h === ph && a === pa) return <span className="abdg ex"><CheckCircle2 size={9} /> EXACT +10</span>;
  if ((h > a ? 'H' : h < a ? 'A' : 'D') === (ph > pa ? 'H' : ph < pa ? 'A' : 'D')) return <span className="abdg rs"><TrendingUp size={9} /> RESULT +3</span>;
  return <span className="abdg ms"><XCircle size={9} /> MISS</span>;
});

const MatchRow = memo(function MatchRow({ m, idx, mode, sel, onToggleSel, scoreInput, onScoreInput, pubPick, extraBadge, isFeatured, isAdding, isFull, onAddClick, onRemoveClick, isRemoving }) {
  const mid = String(m.id);
  const live = isLive(m), fin = isFin(m), sc = getScore(m), st = gst(m.status);
  const comp = m.competition || m.league;
  const cls = `am card-in${sel ? ' zs' : ''}${live ? ' lg' : ''}`;
  
  return (
    <div className={cls} style={{ animationDelay: `${idx * 20}ms` }}>
      <div className="amh">
        <div className="aml">
          {comp?.emblem && <img src={comp.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{comp?.name || 'Unknown'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {live && <span className="ld" />}
          <span className="as" style={{ color: st.c, background: st.b }}>
            {live && m.minute != null ? `${m.minute}'` : st.l}
          </span>
        </div>
      </div>
      <div className="atm">
        <div className="ate">
          {m.homeTeam?.crest && <img src={m.homeTeam.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{m.homeTeam?.shortName || m.homeTeam?.name || 'TBD'}</span>
        </div>
        <div className={`asb${live ? ' lv' : ''}${fin ? ' ft' : ''}`}>
          {(live || fin) ? (
            <><span className={`asn${live ? ' r' : ' g'}`}>{sc.h ?? 0}</span><span className="asep">–</span><span className={`asn${live ? ' r' : ' g'}`}>{sc.a ?? 0}</span></>
          ) : <span className="avs">VS</span>}
        </div>
        <div className="ate aw">
          {m.awayTeam?.crest && <img src={m.awayTeam.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{m.awayTeam?.shortName || m.awayTeam?.name || 'TBD'}</span>
        </div>
      </div>
      <div className="aa">
        {mode === 'zoka' && onToggleSel && (
          <button className={`ab ab-sm ${sel ? 'ab-gd' : 'ab-ol'}`} onClick={() => onToggleSel(m)}>
            <Star size={11} fill={sel ? 'currentColor' : 'none'} />{sel ? 'Selected' : 'Zoka Pick'}
          </button>
        )}
        {mode === 'zoka' && sel && scoreInput && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input className={`api${scoreInput.h ? ' hv' : ''}`} value={scoreInput.h} onChange={e => onScoreInput(mid, 'h', e.target.value)} placeholder="H" maxLength={2} />
            <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>–</span>
            <input className={`api${scoreInput.a ? ' hv' : ''}`} value={scoreInput.a} onChange={e => onScoreInput(mid, 'a', e.target.value)} placeholder="A" maxLength={2} />
          </div>
        )}
        
        {mode === 'featured' && (
          isFeatured ? (
            <button className="ab ab-sm ab-dg" onClick={() => onRemoveClick(m)} disabled={isRemoving}>
              {isRemoving ? <Loader2 size={11} className="asp" /> : <Trash2 size={11} />} Remove
            </button>
          ) : (
            <button className="ab ab-sm ab-sc" onClick={() => onAddClick(m)} disabled={isAdding || isFull}>
              {isAdding ? <Loader2 size={11} className="asp" /> : <Plus size={11} />}
              {isFull ? 'Full' : 'Add'}
            </button>
          )
        )}
        
        {pubPick && <RBadge pick={pubPick} />}
        {extraBadge}
      </div>
    </div>
  );
});

/* ═════════════════════════════════════════════════════════════════════════════════
   MAIN ADMIN COMPONENT
   ═════════════════════════════════════════════════════════════════════════════════ */
export default function Admin() {
  const nav = useNavigate();
  const { userProfile } = useAuth();
  const mounted = useMounted();

  const [tab, setTab] = useState('dashboard');
  const [date, setDate] = useState(todayStr());
  const [showMoreDates, setShowMoreDates] = useState(false);

  const [preds, setPreds] = useState([]);
  const [pubPicks, setPubPicks] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [rebuilding, setRebuilding] = useState(null);

  const [primaryFixtures, setPrimaryFixtures] = useState([]);
  const [primaryLoading, setPrimaryLoading] = useState(true);

  const { fixtures: backupRaw } = useFootballData();

  const showToast = useCallback((message, type = 'ok') => setToast({ message, type }), []);

  const defaultDates = useMemo(() => [getLocalDateStr(-1), todayStr(), getLocalDateStr(1)], []);
  const extraDates = useMemo(() => {
    const dates = [];
    for (let i = -14; i <= 14; i++) {
      const d = getLocalDateStr(i);
      if (!defaultDates.includes(d)) dates.push(d);
    }
    return dates.sort();
  }, [defaultDates]);

  useEffect(() => {
    let mnt = true;
    setPrimaryLoading(true);
    (async () => {
      try {
        const res = await fetchFixtures(date);
        if (mnt) {
          const l = Array.isArray(res) ? res : res?.matches || [];
          setPrimaryFixtures(l.map(m => normalizeMatch(m, true)));
        }
      } catch (e) {
        if (mnt) setPrimaryFixtures([]);
      } finally {
        if (mnt) setPrimaryLoading(false);
      }
    })();
    return () => { mnt = false; };
  }, [date]);

  const allFixtures = useMemo(() => {
    if (primaryFixtures.length > 0) return primaryFixtures;
    return (backupRaw || []).filter(m => extractDate(m) === date).map(m => normalizeMatch(m, false));
  }, [primaryFixtures, backupRaw, date]);

  const dayFixtures = useMemo(() => allFixtures?.filter(m => extractDate(m) === date) || [], [allFixtures, date]);
  const liveCount = useMemo(() => dayFixtures.filter(isLive).length, [dayFixtures]);
  const finCount = useMemo(() => dayFixtures.filter(isFin).length, [dayFixtures]);

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(
      doc(db, PATHS.PREDICTION_SNAPSHOTS, date),
      (snap) => {
        if (!mounted.current) return;
        if (snap.exists()) {
          const data = snap.data();
          setPreds(Array.isArray(data.predictions) ? data.predictions : []);
        } else {
          getDocs(query(collection(db, PATHS.ACTIVE_PREDICTIONS), where('matchDate', '==', date)))
            .then(qs => {
              if (mounted.current) setPreds(qs.docs.map(d => d.data()).sort((a, b) => (b.priority || 0) - (a.priority || 0)));
            })
            .catch(() => {});
        }
      },
      () => {}
    );
    return unsub;
  }, [date, mounted]);

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(
      doc(db, PATHS.ZOKA_PICKS, date),
      (snap) => {
        if (!mounted.current) return;
        setPubPicks(snap.exists() ? snap.data() : null);
      },
      () => {}
    );
    return unsub;
  }, [date, mounted]);

  // Handlers
  const handleZokaSaveDraft = useCallback(async (data) => {
    if (!db) return;
    await setDoc(doc(db, PATHS.ZOKA_PICKS, date), { ...data, updatedAt: serverTimestamp() }, { merge: true });
    dataLayer.invalidate(CACHE_KEY.zokaPicks(date));
    eventBus.emit(EVENT.ZOKA_PICKS_UPDATED, { dateStr: date, picks: data });
  }, [date]);

  const handleZokaPublish = useCallback(async (data) => {
    if (!db) return;
    await setDoc(doc(db, PATHS.ZOKA_PICKS, date), { ...data, isDraft: false, publishedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    dataLayer.invalidate(CACHE_KEY.zokaPicks(date));
    eventBus.emit(EVENT.ZOKA_PICKS_UPDATED, { dateStr: date, picks: data });
  }, [date]);

  const handleZokaUnpublish = useCallback(async () => {
    if (!db || !pubPicks) return;
    setConfirm({
      title: 'Unpublish All Zoka Picks?',
      msg: `This will remove ${pubPicks.matches?.length || 0} published pick(s) for ${dateLabel(date)}. Users won't see them anymore.`,
      onYes: async () => {
        await deleteDoc(doc(db, PATHS.ZOKA_PICKS, date));
        setPubPicks(null);
        dataLayer.invalidate(CACHE_KEY.zokaPicks(date));
        eventBus.emit(EVENT.ZOKA_PICKS_UPDATED, { dateStr: date, picks: null });
        setConfirm(null);
      },
    });
  }, [db, pubPicks, date]);

  const handleFeaturedAdd = useCallback(async (m) => {
    if (!db) return;
    if (hasMatchStarted(m)) { showToast('Match has already started or finished!', 'er'); return; }
    
    const matchDate = date;
    const predId = `feat_${date}_${m.id}`;
    const pred = {
      id: predId, matchId: String(m.id), matchDate,
      homeTeam: m.homeTeam, awayTeam: m.awayTeam,
      homeLogo: m.homeTeam?.crest || null, awayLogo: m.awayTeam?.crest || null,
      league: m.competition || m.league, kickoff: m.utcDate || m.kickoff,
      status: m.status || 'NS', homeScore: null, awayScore: null, priority: preds.length + 1,
    };

    const updatedPreds = [...preds, pred];
    setPreds(updatedPreds);

    await setDoc(doc(db, PATHS.ACTIVE_PREDICTIONS, predId), { ...pred, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    await setDoc(doc(db, PATHS.PREDICTION_SNAPSHOTS, date), { predictions: updatedPreds, updatedAt: serverTimestamp() }, { merge: true });
    
    dataLayer.invalidate(CACHE_KEY.activePredictions(date));
    eventBus.emit(EVENT.PREDICTIONS_UPDATED, { dateStr: date, predictions: updatedPreds });
  }, [db, date, preds, showToast]);

  const handleFeaturedRemove = useCallback(async (p) => {
    if (!db) return;
    const predId = p.id || `feat_${date}_${p.matchId}`;
    const updatedPreds = preds.filter(pr => String(pr.matchId) !== String(p.matchId));
    setPreds(updatedPreds);

    await deleteDoc(doc(db, PATHS.ACTIVE_PREDICTIONS, predId));
    await setDoc(doc(db, PATHS.PREDICTION_SNAPSHOTS, date), { predictions: updatedPreds, updatedAt: serverTimestamp() }, { merge: true });

    dataLayer.invalidate(CACHE_KEY.activePredictions(date));
    eventBus.emit(EVENT.PREDICTIONS_UPDATED, { dateStr: date, predictions: updatedPreds });
  }, [db, date, preds]);

  const handleResolve = useCallback(async (pred, h, a, isAuto = false) => {
    const matchId = String(pred.matchId || pred.id);
    const predId = pred.id || `feat_${date}_${matchId}`;

    await setDoc(doc(db, PATHS.ACTIVE_PREDICTIONS, predId), { homeScore: h, awayScore: a, status: 'finished', updatedAt: serverTimestamp() }, { merge: true });

    const updated = preds.map(p => String(p.matchId) === matchId ? { ...p, homeScore: h, awayScore: a, status: 'finished', isFinished: true } : p);
    setPreds(updated);

    await setDoc(doc(db, PATHS.PREDICTION_SNAPSHOTS, date), { predictions: updated, updatedAt: serverTimestamp() }, { merge: true });
    await resolveMatchForAllUsers(matchId, h, a, date);

    dataLayer.invalidate(CACHE_KEY.activePredictions(date));
    eventBus.emit(EVENT.PREDICTIONS_UPDATED, { dateStr: date, predictions: updated });
    eventBus.emit(EVENT.MATCH_RESOLVED, { matchId, dateStr: date, actualH: h, actualA: a });

    if (!isAuto) showToast(`Resolved: ${pred.homeTeam?.shortName} ${h}-${a} ${pred.awayTeam?.shortName}`, 'ok');
  }, [preds, date, showToast]);

  const handleOverride = useCallback(async (pred, h, a) => {
    const matchId = String(pred.matchId || pred.id);
    const predId = pred.id || `feat_${date}_${matchId}`;

    await setDoc(doc(db, PATHS.ACTIVE_PREDICTIONS, predId), { homeScore: h, awayScore: a, updatedAt: serverTimestamp() }, { merge: true });

    const updated = preds.map(p => String(p.matchId) === matchId ? { ...p, homeScore: h, awayScore: a } : p);
    setPreds(updated);

    await setDoc(doc(db, PATHS.PREDICTION_SNAPSHOTS, date), { predictions: updated, updatedAt: serverTimestamp() }, { merge: true });
    await resolveMatchForAllUsers(matchId, h, a, date);

    dataLayer.invalidate(CACHE_KEY.activePredictions(date));
    eventBus.emit(EVENT.PREDICTIONS_UPDATED, { dateStr: date, predictions: updated });
    eventBus.emit(EVENT.MATCH_RESOLVED, { matchId, dateStr: date, actualH: h, actualA: a });
  }, [preds, date]);

  const handleRebuild = useCallback(async (period) => {
    setRebuilding(period);
    try {
      if (period === 'daily') await rebuildDailySummary(date);
      else if (period === 'goat') await rebuildGoatLeaderboard();
      else if (period === 'weekly') await rebuildPeriodLeaderboard('weekly');
      else if (period === 'monthly') await rebuildPeriodLeaderboard('monthly');
      else if (period === 'all') await rebuildAllLeaderboards();
      showToast('Rebuild complete!', 'ok');
    } catch (e) { 
      console.error('[Admin] Rebuild err:', e); 
      showToast('Rebuild failed', 'er');
    }
    setRebuilding(null);
  }, [date, showToast]);

  // ★ AUTO-RESOLVE LOGIC
  useEffect(() => {
    if (!preds.length || !dayFixtures.length) return;
    preds.forEach(p => {
      if (p.status === 'finished' || p.isFinished) return;
      const fx = dayFixtures.find(f => String(f.id) === String(p.matchId));
      if (fx && fx.isFinished && fx.homeScore != null && fx.awayScore != null) {
        handleResolve(p, fx.homeScore, fx.awayScore, true);
      }
    });
  }, [dayFixtures, preds, handleResolve]);

  return (
    <div className="ap">
      <SEO title="Admin Dashboard | ZOKASCORE" description="Access the ZOKASCORE admin control room to securely manage fixtures, review Zoka picks, resolve match results, and rebuild leaderboards efficiently." keywords="admin dashboard, ZOKASCORE admin, manage fixtures, resolve matches, rebuild leaderboards" path="/admin" robots="noindex,nofollow" />
      <div className="aw">
        <div className="ah">
          <button className="ab ab-gh ab-sm" onClick={() => nav('/')} style={{ position: 'absolute', left: 16, top: 20 }}>
            <ArrowLeft size={14} />
          </button>
          <h1><ShieldAlert size={14} style={{ color: 'var(--gold)', verticalAlign: 'middle', marginRight: 6 }} /> Admin Control Room</h1>
          <div className="sub">{userProfile?.displayName || 'Staff'} · {dateLabel(date)}</div>
        </div>

        <div className="at">
          {TABS.map(t => (
            <button key={t.key} className={`atb${tab === t.key ? ' on' : ''}`} onClick={() => setTab(t.key)}>
              <t.icon size={13} /><span className="lb">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="ask" style={{ top: 108 }}>
          <div className="adb">
            {defaultDates.map(d => (
              <button key={d} className={`adp${d === date ? ' on' : ''}`} onClick={() => setDate(d)}>{dateLabel(d)}</button>
            ))}
            <button className="more-dates-btn" onClick={() => setShowMoreDates(p => !p)}>
              {showMoreDates ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showMoreDates ? 'Less' : 'More dates'}
            </button>
            {showMoreDates && extraDates.map(d => (
              <button key={d} className={`adp past${d === date ? ' on' : ''}`} onClick={() => setDate(d)}>{dateLabel(d)}</button>
            ))}
          </div>
        </div>

        {tab === 'dashboard' && (
          <DashTab preds={preds} pubPicks={pubPicks} fxCount={dayFixtures.length} liveCount={liveCount} finCount={finCount} date={date} onRebuild={handleRebuild} rebuilding={rebuilding} />
        )}

        {tab === 'zoka' && (
          <ZokaTab date={date} fixtures={allFixtures} fxLoading={primaryLoading} pubPicks={pubPicks} onPublish={handleZokaPublish} onUnpublish={handleZokaUnpublish} onSaveDraft={handleZokaSaveDraft} toast={showToast} />
        )}

        {tab === 'featured' && (
          <FeaturedTab date={date} preds={preds} fixtures={allFixtures} onAdd={handleFeaturedAdd} onRemove={handleFeaturedRemove} fxLoading={primaryLoading} toast={showToast} />
        )}

        {tab === 'results' && (
          <ResultsTab date={date} preds={preds} onResolve={handleResolve} onOverride={handleOverride} toast={showToast} />
        )}

        {tab === 'broadcast' && <BroadcastTab toast={showToast} />}
        {tab === 'staff' && <StaffTab toast={showToast} />}
        {tab === 'users' && <UsersTab toast={showToast} />}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
      {confirm && <Confirm title={confirm.title} msg={confirm.msg} onYes={confirm.onYes} onNo={() => setConfirm(null)} danger={confirm.danger} />}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════════
   DASHBOARD TAB
   ═════════════════════════════════════════════════════════════════════════════════ */
const DashTab = memo(function DashTab({ preds, pubPicks, fxCount, liveCount, finCount, date, onRebuild, rebuilding }) {
  const pr = pubPicks?.matches || [];
  let zE = 0, zR = 0, zM = 0, zP = 0;
  pr.forEach(p => {
    if (p.status !== 'finished' || p.homeScore == null) { zP++; return; }
    const h = p.adminPick?.home, a = p.adminPick?.away;
    if (h === p.homeScore && a === p.awayScore) { zE++; return; }
    if ((h > a ? 'H' : h < a ? 'A' : 'D') === (p.homeScore > p.awayScore ? 'H' : p.homeScore < p.awayScore ? 'A' : 'D')) { zR++; return; }
    zM++;
  });
  const zT = pr.length, res = Math.max(zT - zP, 1);
  const zAcc = zT > 0 ? Math.round(((zE + zR) / res) * 100) : 0;

  return (
    <div className="ae">
      <div className="asec">
        <h3 className="ast"><Activity size={15} /> Overview — {dateLabel(date)}</h3>
        <div className="asg">
          <div className="astat"><span className="n bl">{fxCount}</span><span className="l">Fixtures</span></div>
          <div className="astat"><span className="n rd">{liveCount}</span><span className="l">Live</span></div>
          <div className="astat"><span className="n gn">{finCount}</span><span className="l">Finished</span></div>
          <div className="astat"><span className="n gd">{preds.length}</span><span className="l">Featured</span></div>
          <div className="astat"><span className="n gd">{zT}</span><span className="l">Zoka</span></div>
          <div className="astat"><span className="n gn">{zAcc}%</span><span className="l">Zoka Acc</span></div>
        </div>
        {zT > 0 && (
          <div className="azs">
            <span className="abdg ex"><CheckCircle2 size={9} /> {zE} Exact</span>
            <span className="abdg rs"><TrendingUp size={9} /> {zR} Result</span>
            <span className="abdg ms"><XCircle size={9} /> {zM} Miss</span>
            {zP > 0 && <span className="abdg pn">{zP} Pending</span>}
          </div>
        )}
      </div>
      <div className="asec">
        <h3 className="ast"><RotateCcw size={15} /> Rebuild Leaderboards</h3>
        <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', margin: '0 0 12px', fontWeight: 600, lineHeight: 1.4 }}>
          Run after scoring matches to update all user rankings.
          <br /><span style={{ fontSize: '.68rem', opacity: 0.7 }}>Other pages auto-update via events</span>
        </p>
        <div className="arg">
          {[['daily','Daily ('+dateLabel(date)+')',CalendarDays],['goat','GOAT',Crown],['weekly','Weekly',Timer],['monthly','Monthly',BarChart3]].map(([k,l,Ic]) => (
            <button key={k} className="arb" onClick={() => onRebuild(k)} disabled={rebuilding === k}>
              {rebuilding === k ? <Loader2 size={13} className="asp" /> : <Ic size={13} />}{l}
            </button>
          ))}
          <button className="arb" onClick={() => onRebuild('all')} disabled={rebuilding === 'all'} style={{ gridColumn: '1 / -1' }}>
            {rebuilding === 'all' ? <Loader2 size={13} className="asp" /> : <Sparkles size={13} />}Rebuild All
          </button>
        </div>
      </div>
    </div>
  );
});

/* ═════════════════════════════════════════════════════════════════════════════════
   ZOKA PICKS TAB
   ═════════════════════════════════════════════════════════════════════════════════ */
const ZokaTab = memo(function ZokaTab({ date, fixtures, fxLoading, pubPicks, onPublish, onUnpublish, onSaveDraft, toast }) {
  const mounted = useMounted();
  
  const [sel, setSel] = useState({});
  const [lg, setLg] = useState('ALL');
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [flash, setFlash] = useState(false);
  const [showHist, setShowHist] = useState(false);
  const [hist, setHist] = useState([]);
  const [histLoad, setHistLoad] = useState(false);
  const [openDay, setOpenDay] = useState(null);

  const dayFx = useMemo(() => fixtures?.filter(m => extractDate(m) === date) || [], [fixtures, date]);
  const selectableFx = useMemo(() => dayFx.filter(m => !hasMatchStarted(m)), [dayFx]);

  const leagues = useMemo(() => {
    const map = new Map();
    selectableFx.forEach(f => {
      const c = f.competition || f.league; if (!c) return;
      const id = String(c.id || c.code || 'x');
      if (!map.has(id)) map.set(id, { id, name: c.name || 'Other', emblem: c.emblem || c.logo || null, n: 0 });
      map.get(id).n++;
    });
    return [...map.values()].sort((a, b) => b.n - a.n);
  }, [selectableFx]);

  const filtered = useMemo(() => {
    let l = selectableFx;
    if (lg !== 'ALL') l = l.filter(f => String(f.competition?.id || f.league?.id) === lg);
    return l;
  }, [selectableFx, lg]);

  const vis = useMemo(() => showAll ? filtered : filtered.slice(0, SHOW_INIT), [filtered, showAll]);
  const hidden = Math.max(0, filtered.length - SHOW_INIT);
  const ids = useMemo(() => new Set(Object.keys(sel)), [sel]);
  const cnt = ids.size;
  const full = cnt >= MAX_ZOKA;
  const scored = Object.values(sel).filter(s => s.h !== '' && s.a !== '').length;
  const ready = cnt > 0 && scored === cnt;

  const pubMatches = useMemo(() => Array.isArray(pubPicks) ? pubPicks : (pubPicks?.matches || []), [pubPicks]);
  const pubMap = useMemo(() => new Map(pubMatches.map(p => [String(p.matchId), p])), [pubMatches]);

  const toggle = useCallback((m) => {
    if (hasMatchStarted(m)) { toast('Cannot select matches that have already started', 'in'); return; }
    const id = String(m.id);
    setSel(prev => {
      if (prev[id]) {
        const n = { ...prev }; delete n[id]; return n;
      } else if (Object.keys(prev).length < MAX_ZOKA) {
        const existing = pubMap.get(id);
        return { ...prev, [id]: existing ? { h: String(existing.adminPick?.home ?? ''), a: String(existing.adminPick?.away ?? '') } : { h: '', a: '' } };
      } else {
        toast(`Max ${MAX_ZOKA} Zoka Picks`, 'in');
        return prev;
      }
    });
  }, [pubMap, toast]);

  const updScore = useCallback((mid, f, v) => {
    const c = v.replace(/[^0-9]/g, '').slice(0, 2);
    setSel(prev => ({ ...prev, [mid]: { ...(prev[mid] || {}), [f]: c } }));
  }, []);

  const buildNewPicks = useCallback(() => {
    const picks = [];
    for (const [mid, sc] of Object.entries(sel)) {
      const m = dayFx.find(x => String(x.id) === mid);
      if (!m || sc.h === '' || sc.a === '') continue;
      const s = getScore(m);
      picks.push({
        matchId: m.id, homeTeam: m.homeTeam, awayTeam: m.awayTeam,
        homeLogo: m.homeTeam?.crest || null, awayLogo: m.awayTeam?.crest || null,
        league: m.competition || m.league, kickoff: m.utcDate || m.kickoff,
        adminPick: { home: Number(sc.h), away: Number(sc.a) },
        homeScore: isFin(m) ? s.h : null, awayScore: isFin(m) ? s.a : null,
        status: isFin(m) ? 'finished' : 'upcoming',
      });
    }
    return picks;
  }, [sel, dayFx]);

  const mergeWithExisting = useCallback((newPicks) => {
    const existing = pubMatches;
    const merged = [...existing];
    for (const np of newPicks) {
      const idx = merged.findIndex(p => String(p.matchId) === String(np.matchId));
      if (idx >= 0) merged[idx] = np;
      else merged.push(np);
    }
    return merged;
  }, [pubMatches]);

  // ★ SEAMLESSLY STITCHED HANDLE SAVE
  const handleSave = useCallback(async () => {
    if (!db || cnt === 0) return;
    setSaving(true);
    try {
      const newPicks = buildNewPicks();
      if (!newPicks.length) { setSaving(false); return; }
      const merged = mergeWithExisting(newPicks);
      await onSaveDraft({ matches: merged, date, totalMatches: merged.length, isDraft: !ready, publishedAt: serverTimestamp() });
      setSel({});
      setFlash(true);
      setTimeout(() => { if (mounted.current) setFlash(false); }, 1400);
      toast(`Saved ${newPicks.length} pick${newPicks.length > 1 ? 's' : ''} (${merged.length} total)`, 'ok');
    } catch (e) { console.error('[Zoka] Save err:', e); toast('Save failed', 'er'); }
    setSaving(false);
  }, [cnt, buildNewPicks, mergeWithExisting, onSaveDraft, date, ready, toast, mounted]);

  const handlePublish = useCallback(async () => {
    if (!db || !ready) return;
    setPublishing(true);
    try {
      const newPicks = buildNewPicks();
      if (!newPicks.length) { setPublishing(false); return; }
      const merged = mergeWithExisting(newPicks);
      await onPublish({ matches: merged, date, totalMatches: merged.length, isDraft: false, publishedAt: serverTimestamp() });
      setSel({});
      toast(`Published ${newPicks.length} pick${newPicks.length > 1 ? 's' : ''} (${merged.length} total)!`, 'ok');
    } catch (e) { console.error('[Zoka] Pub err:', e); toast('Publish failed', 'er'); }
    setPublishing(false);
  }, [db, ready, buildNewPicks, mergeWithExisting, onPublish, date, toast]);

  const loadHist = useCallback(async () => {
    if (hist.length > 0 || histLoad) return;
    setHistLoad(true);
    try {
      const days = [];
      for (let i = 1; i <= 7; i++) {
        const d = dateOffset(-i);
        try {
          const data = await dataLayer.fetchZokaPicks(d);
          if (data && data.matches) {
            const matches = data.matches || [];
            let e = 0, r = 0, mi = 0, p = 0;
            matches.forEach(pk => {
              if (pk.status !== 'finished' || pk.homeScore == null) { p++; return; }
              const h = pk.adminPick?.home, a = pk.adminPick?.away;
              if (h === pk.homeScore && a === pk.awayScore) { e++; return; }
              if ((h > a ? 'H' : h < a ? 'A' : 'D') === (pk.homeScore > pk.awayScore ? 'H' : pk.homeScore < pk.awayScore ? 'A' : 'D')) { r++; return; }
              mi++;
            });
            days.push({ date: d, matches, e, r, mi, p, total: matches.length });
          }
        } catch { /* skip */ }
      }
      if (mounted.current) setHist(days);
    } catch (e) { console.error('[Zoka] Hist err:', e); }
    setHistLoad(false);
  }, [hist, histLoad, mounted]);

  const pubRes = useMemo(() => {
    if (!pubMatches.length) return { e: 0, r: 0, mi: 0, p: 0 };
    let e = 0, r = 0, mi = 0, p = 0;
    pubMatches.forEach(pk => {
      if (pk.status !== 'finished' || pk.homeScore == null) { p++; return; }
      const h = pk.adminPick?.home, a = pk.adminPick?.away;
      if (h === pk.homeScore && a === pk.awayScore) { e++; return; }
      if ((h > a ? 'H' : h < a ? 'A' : 'D') === (pk.homeScore > pk.awayScore ? 'H' : pk.homeScore < pk.awayScore ? 'A' : 'D')) { r++; return; }
      mi++;
    });
    return { e, r, mi, p };
  }, [pubMatches]);

  return (
    <div className="ae">
      {cnt > 0 && (
        <div className="asec pop" style={{ background: 'rgba(245,197,66,.03)', borderColor: 'rgba(245,197,66,.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                {cnt}/{MAX_ZOKA} selected
                {scored === cnt && cnt > 0 && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>✓ All scored</span>}
              </span>
              {Object.keys(sel).some(mid => pubMap.has(mid)) && (
                <div className="aedit-hint"><Pencil size={9} /> Editing {Object.keys(sel).filter(mid => pubMap.has(mid)).length} existing</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              <button className="ab ab-gh ab-sm" onClick={handleSave} disabled={saving || cnt === 0 || scored === 0}>
                <Save size={12} /> Save
              </button>
              <button className="ab ab-gd ab-sm" onClick={handlePublish} disabled={publishing || !ready} title={!ready ? 'Enter scores for all picks to publish' : ''}>
                <Send size={12} /> Publish
              </button>
            </div>
          </div>
        </div>
      )}

      {pubMatches.length > 0 && cnt === 0 && (
        <div className="azs pop" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 6 }}>
            <span style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>{pubMatches.length} published · Tap a match to edit</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <span className="abdg ex"><CheckCircle2 size={9} /> {pubRes.e}</span>
              <span className="abdg rs"><TrendingUp size={9} /> {pubRes.r}</span>
              <span className="abdg ms"><XCircle size={9} /> {pubRes.mi}</span>
              {pubRes.p > 0 && <span className="abdg pn">{pubRes.p}</span>}
            </div>
            <button className="ab ab-dg ab-sm" onClick={onUnpublish} style={{ marginLeft: 'auto' }}><X size={11} /> Unpublish All</button>
          </div>
        </div>
      )}

      {leagues.length > 1 && (
        <div className="alb" style={{ marginTop: 10 }}>
          <button className={`alp${lg === 'ALL' ? ' on' : ''}`} onClick={() => setLg('ALL')}>All ({selectableFx.length})</button>
          {leagues.map(l => (
            <button key={l.id} className={`alp${lg === l.id ? ' on' : ''}`} onClick={() => setLg(l.id)}>
              {l.emblem && <img src={l.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
              {l.name} ({l.n})
            </button>
          ))}
        </div>
      )}

      {fxLoading ? <Skel n={4} /> : vis.length > 0 ? (
        <div className={flash ? 'save-flash' : ''}>
          {vis.map((m, i) => {
            const mid = String(m.id);
            const isPublished = pubMap.has(mid);
            return (
              <div key={mid}>
                <MatchRow m={m} idx={i} mode="zoka" sel={sel[mid]} onToggleSel={toggle}
                  scoreInput={sel[mid]} onScoreInput={updScore} pubPick={isPublished ? pubMap.get(mid) : null}
                  extraBadge={isPublished && !sel[mid] ? (<span className="abdg gd"><Star size={9} /> Published</span>) : null}
                />
                {isPublished && !sel[mid] && (
                  <div className="aedit-hint" style={{ margin: '-4px 16px 8px', cursor: 'pointer' }} onClick={() => toggle(m)}>
                    <Pencil size={9} /> Tap to edit published pick: {pubMap.get(mid).adminPick?.home}-{pubMap.get(mid).adminPick?.away}
                  </div>
                )}
              </div>
            );
          })}
          <ShowMore count={hidden} show={showAll} onToggle={() => setShowAll(p => !p)} />
        </div>
      ) : (
        <Empty icon={Star} title={dayFx.length === 0 ? 'No fixtures for this date' : 'No upcoming matches available'} hint={dayFx.length === 0 ? 'Try a different day' : 'Matches that have started cannot be selected'} />
      )}

      <div className="asec" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => { setShowHist(p => !p); if (!showHist) loadHist(); }}>
          <h3 className="ast" style={{ margin: 0 }}><History size={15} /> Zoka Picks History</h3>
          {showHist ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
        </div>
        {showHist && (
          <div style={{ marginTop: 10 }}>
            {histLoad ? <Skel n={2} /> : hist.length > 0 ? hist.map(day => {
              const isOpen = openDay === day.date;
              const res = day.total - day.p;
              const acc = res > 0 ? Math.round(((day.e + day.r) / res) * 100) : 0;
              return (
                <div key={day.date} className={`ahc${isOpen ? ' op' : ''}`} onClick={() => setOpenDay(isOpen ? null : day.date)}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '.82rem', fontWeight: 800, color: 'var(--text-primary)' }}>{dateLabel(day.date)}</div>
                      <div style={{ fontSize: '.67rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 1 }}>{day.total} picks · {acc}% accuracy</div>
                    </div>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <span className="abdg ex" style={{ fontSize: '.6rem' }}>{day.e}E</span>
                      <span className="abdg rs" style={{ fontSize: '.6rem' }}>{day.r}R</span>
                      <span className="abdg ms" style={{ fontSize: '.6rem' }}>{day.mi}M</span>
                    </div>
                  </div>
                  {isOpen && day.matches.map((pk, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid var(--border)', marginTop: 6, fontSize: '.75rem', gap: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{pk.homeTeam?.shortName || pk.homeTeam?.name || '?'}</span>
                        <span style={{ color: 'var(--text-muted)', margin: '0 5px' }}>vs</span>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{pk.awayTeam?.shortName || pk.awayTeam?.name || '?'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--gold)', fontSize: '.82rem' }}>{pk.adminPick?.home}-{pk.adminPick?.away}</span>
                        {pk.status === 'finished' && pk.homeScore != null && <><span style={{ color: 'var(--text-muted)' }}>→</span><span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text-primary)', fontSize: '.82rem' }}>{pk.homeScore}-{pk.awayScore}</span></>}
                        <RBadge pick={pk} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            }) : <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: 14, fontWeight: 600 }}>No previous Zoka Picks found</p>}
          </div>
        )}
      </div>
    </div>
  );
});

/* ═════════════════════════════════════════════════════════════════════════════════
   FEATURED TAB
   ═════════════════════════════════════════════════════════════════════════════════ */
const FeaturedTab = memo(function FeaturedTab({ date, preds, fixtures, onAdd, onRemove, fxLoading, toast }) {
  const [lg, setLg] = useState('ALL');
  const [showAll, setShowAll] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const isFull = preds.length >= MAX_FEATURED;

  const pids = useMemo(() => new Set(preds.map(p => String(p.matchId))), [preds]);

  const avail = useMemo(() => {
    if (!fixtures?.length) return [];
    let l = fixtures.filter(m => extractDate(m) === date && !hasMatchStarted(m)); 
    if (lg !== 'ALL') l = l.filter(f => String(f.competition?.id || f.league?.id) === lg);
    return l;
  }, [fixtures, date, lg]);

  const leagues = useMemo(() => {
    const map = new Map();
    (fixtures?.filter(m => extractDate(m) === date && !hasMatchStarted(m)) || []).forEach(f => {
      const c = f.competition || f.league; if (!c) return;
      const id = String(c.id || c.code || 'x');
      if (!map.has(id)) map.set(id, { id, name: c.name || 'Other', emblem: c.emblem || c.logo || null, n: 0 });
      map.get(id).n++;
    });
    return [...map.values()].sort((a, b) => b.n - a.n);
  }, [fixtures, date]);

  const vis = useMemo(() => showAll ? avail : avail.slice(0, SHOW_INIT), [avail, showAll]);
  const hidden = Math.max(0, avail.length - SHOW_INIT);

  const handleAddClick = useCallback(async (m) => {
    if (isFull) return;
    const mid = String(m.id);
    setAddingId(mid);
    try { await onAdd(m); } catch (e) { toast('Add failed: ' + e.message, 'er'); }
    finally { setAddingId(null); }
  }, [isFull, onAdd, toast]);

  const handleRemoveClick = useCallback(async (p) => {
    setRemovingId(String(p.matchId));
    try { await onRemove(p); } catch (e) { toast('Remove failed: ' + e.message, 'er'); }
    finally { setRemovingId(null); }
  }, [onRemove, toast]);

  return (
    <div className="ae">
      <div className="asec">
        <h3 className="ast"><Radio size={15} /> Featured Matches ({preds.length}/{MAX_FEATURED})</h3>
        {preds.length > 0 ? (
          <div>
            {preds.map((p, i) => {
              const mid = String(p.matchId);
              const isRemoving = removingId === mid;
              const sc = p.homeScore != null ? { h: p.homeScore, a: p.awayScore } : null;
              const live = isLive(p);
              const finished = isFin(p);
              const st = finished ? { c: 'var(--accent)', b: 'rgba(16,185,129,.08)', l: 'FT' } : live ? { c: '#ef4444', b: 'rgba(239,68,68,.1)', l: 'Live' } : { c: 'var(--text-muted)', b: 'rgba(255,255,255,.04)', l: p.kickoff || 'VS' };
              return (
                <div key={mid} className="am card-in" style={{ animationDelay: `${i * 20}ms`, borderLeft: '3px solid var(--accent)' }}>
                  <div className="amh">
                    <div className="aml">
                      {p.league?.emblem && <img src={p.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                      <span>{p.league?.name || 'Featured'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {live && <span className="ld" />}
                      <span className="as" style={{ color: st.c, background: st.b }}>{st.l}</span>
                    </div>
                  </div>
                  <div className="atm">
                    <div className="ate">
                      {(p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest) && <img src={p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                      <span>{p.homeTeam?.shortName || p.homeTeam?.name || 'Home'}</span>
                    </div>
                    <div className={`asb${live ? ' lv' : ''}${finished ? ' ft' : ''}`}>
                      {sc ? (<><span className={`asn${live ? ' r' : ' g'}`}>{sc.h}</span><span className="asep">–</span><span className={`asn${live ? ' r' : ' g'}`}>{sc.a}</span></>) : <span className="avs">VS</span>}
                    </div>
                    <div className="ate aw">
                      {(p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest) && <img src={p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                      <span>{p.awayTeam?.shortName || p.awayTeam?.name || 'Away'}</span>
                    </div>
                  </div>
                  <div className="aa">
                    <span className="abdg gn"><Radio size={9} /> Featured</span>
                    <button className="ab ab-sm ab-dg" onClick={() => handleRemoveClick(p)} disabled={isRemoving}>
                      {isRemoving ? <Loader2 size={11} className="asp" /> : <Trash2 size={11} />} Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty icon={Radio} title="No featured matches yet" hint="Add matches below for users to predict" />
        )}
      </div>

      <div className="asec">
        <h3 className="ast"><Plus size={15} /> Available Matches {isFull && <span style={{ color: 'var(--red)', fontWeight: 700, fontSize: '.75rem' }}>(FULL)</span>}</h3>
        {leagues.length > 1 && (
          <div className="alb" style={{ marginBottom: 10 }}>
            <button className={`alp${lg === 'ALL' ? ' on' : ''}`} onClick={() => setLg('ALL')}>All</button>
            {leagues.map(l => (
              <button key={l.id} className={`alp${lg === l.id ? ' on' : ''}`} onClick={() => setLg(l.id)}>
                {l.emblem && <img src={l.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                {l.name} ({l.n})
              </button>
            ))}
          </div>
        )}
        {fxLoading ? <Skel n={3} /> : vis.length > 0 ? (
          <div>
            {vis.map((m, i) => {
              const mid = String(m.id);
              const isAdding = addingId === mid;
              const isFeatured = pids.has(mid);
              return (
                <MatchRow 
                  key={mid} 
                  m={m} 
                  idx={i} 
                  mode="featured"
                  isFeatured={isFeatured}
                  isAdding={isAdding}
                  isFull={isFull}
                  onAddClick={handleAddClick}
                  onRemoveClick={handleRemoveClick}
                  isRemoving={removingId === mid}
                />
              );
            })}
            <ShowMore count={hidden} show={showAll} onToggle={() => setShowAll(p => !p)} />
          </div>
        ) : (
          <Empty icon={CalendarDays} title="No available matches" hint="Live and finished matches cannot be featured" />
        )}
      </div>
    </div>
  );
});

/* ═════════════════════════════════════════════════════════════════════════════════
   RESULTS TAB
   ═════════════════════════════════════════════════════════════════════════════════ */
const ResultsTab = memo(function ResultsTab({ date, preds, onResolve, onOverride, toast }) {
  const [scores, setScores] = useState({});
  const [resolving, setResolving] = useState({});
  const [overriding, setOverriding] = useState({});

  const unresolved = useMemo(() =>
    preds.filter(p => {
      const mid = String(p.matchId || p.id);
      const s = scores[mid];
      const hasNewScore = s && s.h !== '' && s.a !== '';
      const hasExistingScore = p.homeScore != null && p.awayScore != null;
      return !p.isFinished && p.status !== 'finished' || hasNewScore || !hasExistingScore;
    }),
    [preds, scores]
  );

  const resolved = useMemo(() => preds.filter(p => p.isFinished || p.status === 'finished'), [preds]);

  const updScore = useCallback((mid, f, v) => {
    const c = v.replace(/[^0-9]/g, '').slice(0, 2);
    setScores(prev => ({ ...prev, [mid]: { ...(prev[mid] || {}), [f]: c } }));
  }, []);

  const handleResolve = useCallback(async (pred) => {
    const mid = String(pred.matchId || pred.id);
    const s = scores[mid];
    const h = s?.h !== '' ? Number(s.h) : (pred.homeScore ?? null);
    const a = s?.a !== '' ? Number(s.a) : (pred.awayScore ?? null);

    if (h == null || a == null) { toast('Enter both scores', 'in'); return; }

    setResolving(prev => ({ ...prev, [mid]: true }));
    try {
      await onResolve(pred, h, a);
      setScores(prev => { const n = { ...prev }; delete n[mid]; return n; });
      toast(`Resolved: ${pred.homeTeam?.shortName || pred.homeTeam?.name} ${h}-${a} ${pred.awayTeam?.shortName || pred.awayTeam?.name}`, 'ok');
    } catch (e) { toast('Resolve failed: ' + e.message, 'er'); }
    setResolving(prev => ({ ...prev, [mid]: false }));
  }, [scores, onResolve, toast]);

  const handleOverride = useCallback(async (pred) => {
    const mid = String(pred.matchId || pred.id);
    const s = scores[mid];
    const h = s?.h !== '' ? Number(s.h) : null;
    const a = s?.a !== '' ? Number(s.a) : null;

    if (h == null || a == null) { toast('Enter new scores to override', 'in'); return; }

    setOverriding(prev => ({ ...prev, [mid]: true }));
    try {
      await onOverride(pred, h, a);
      setScores(prev => { const n = { ...prev }; delete n[mid]; return n; });
      toast(`Override: ${pred.homeTeam?.shortName || pred.homeTeam?.name} → ${h}-${a}`, 'ok');
    } catch (e) { toast('Override failed: ' + e.message, 'er'); }
    setOverriding(prev => ({ ...prev, [mid]: false }));
  }, [scores, onOverride, toast]);

  const handleResolveAll = useCallback(async () => {
    const toResolve = unresolved.filter(p => {
      const mid = String(p.matchId || p.id);
      const s = scores[mid];
      return s?.h !== '' && s?.a !== '';
    });
    if (toResolve.length === 0) { toast('No scored matches to resolve', 'in'); return; }

    setResolving(prev => { const n = { ...prev }; toResolve.forEach(p => { n[String(p.matchId || p.id)] = true; }); return n; });

    let ok = 0, fail = 0;
    for (const p of toResolve) {
      const mid = String(p.matchId || p.id);
      const s = scores[mid];
      try { await onResolve(p, Number(s.h), Number(s.a)); ok++; } catch { fail++; }
    }

    setScores({});
    setResolving({});
    toast(`Resolved ${ok} match${ok !== 1 ? 'es' : ''}${fail > 0 ? ', ' + fail + ' failed' : ''}`, fail > 0 ? 'er' : 'ok');
  }, [unresolved, scores, onResolve, toast]);

  return (
    <div className="ae">
      {unresolved.length > 0 && (
        <div className="asec">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 className="ast" style={{ margin: 0 }}><Zap size={15} /> Score & Resolve ({unresolved.length})</h3>
            <button className="ab ab-sm ab-p" onClick={handleResolveAll} disabled={Object.values(resolving).some(Boolean)}>
              <Zap size={11} /> Resolve All Scored
            </button>
          </div>
          {unresolved.map((p, i) => {
            const mid = String(p.matchId || p.id);
            const s = scores[mid] || {};
            const isResolving = resolving[mid];
            const hasExisting = p.homeScore != null;
            return (
              <div key={mid} className={`am card-in${hasExisting ? ' editing' : ''}`} style={{ animationDelay: `${i * 20}ms` }}>
                <div className="amh">
                  <div className="aml">
                    {p.league?.emblem && <img src={p.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <span>{p.league?.name || 'Match'}</span>
                  </div>
                  {hasExisting && <span className="as" style={{ color: 'var(--gold)', background: 'rgba(245,158,11,.1)' }}>OVERRIDE</span>}
                </div>
                <div className="atm">
                  <div className="ate">
                    {(p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest) && <img src={p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <span>{p.homeTeam?.shortName || p.homeTeam?.name || 'Home'}</span>
                  </div>
                  <div className="asb" style={{ borderColor: 'rgba(16,185,129,.25)', background: 'rgba(16,185,129,.04)' }}>
                    <input className={`ari${s.h ? ' hv' : ''}`} type="number" min="0" max="99" value={s.h ?? (p.homeScore ?? '')} onChange={e => updScore(mid, 'h', e.target.value)} placeholder={p.homeScore ?? '-'} />
                    <span className="asep">–</span>
                    <input className={`ari${s.a ? ' hv' : ''}`} type="number" min="0" max="99" value={s.a ?? (p.awayScore ?? '')} onChange={e => updScore(mid, 'a', e.target.value)} placeholder={p.awayScore ?? '-'} />
                  </div>
                  <div className="ate aw">
                    {(p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest) && <img src={p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <span>{p.awayTeam?.shortName || p.awayTeam?.name || 'Away'}</span>
                  </div>
                </div>
                <div className="aa">
                  {hasExisting ? (
                    <button className="ab ab-sm ab-olive" onClick={() => handleOverride(p)} disabled={overriding[mid] || (!s.h && s.h !== '0') || (!s.a && s.a !== '0')}>
                      {overriding[mid] ? <Loader2 size={11} className="asp" /> : <Copy size={11} />} Override
                    </button>
                  ) : (
                    <button className="ab ab-sm ab-p" onClick={() => handleResolve(p)} disabled={isResolving || (!s.h && s.h !== '0') || (!s.a && s.a !== '0')}>
                      {isResolving ? <Loader2 size={11} className="asp" /> : <Check size={11} />} Resolve
                    </button>
                  )}
                  {p.homeScore != null && <span className="abdg pn">Was: {p.homeScore}-{p.awayScore}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="asec">
          <h3 className="ast"><CheckCircle2 size={15} /> Resolved ({resolved.length})</h3>
          {resolved.map((p, i) => {
            const mid = String(p.matchId || p.id);
            const s = scores[mid] || {};
            const isOverriding = overriding[mid];
            return (
              <div key={mid} className="am card-in ok resolved" style={{ animationDelay: `${i * 15}ms` }}>
                <div className="amh">
                  <div className="aml">
                    {p.league?.emblem && <img src={p.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <span>{p.league?.name || 'Match'}</span>
                  </div>
                  <span className="as" style={{ color: 'var(--accent)', background: 'rgba(16,185,129,.08)' }}>FT</span>
                </div>
                <div className="atm">
                  <div className="ate">
                    {(p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest) && <img src={p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <span>{p.homeTeam?.shortName || p.homeTeam?.name || 'Home'}</span>
                  </div>
                  <div className="asb ft" style={{ borderColor: 'rgba(16,185,129,.25)', background: 'rgba(16,185,129,.04)' }}>
                    <input className={`ari${s.h ? ' hv' : ''}`} type="number" min="0" max="99" value={s.h ?? p.homeScore} onChange={e => updScore(mid, 'h', e.target.value)} />
                    <span className="asep">–</span>
                    <input className={`ari${s.a ? ' hv' : ''}`} type="number" min="0" max="99" value={s.a ?? p.awayScore} onChange={e => updScore(mid, 'a', e.target.value)} />
                  </div>
                  <div className="ate aw">
                    {(p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest) && <img src={p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <span>{p.awayTeam?.shortName || p.awayTeam?.name || 'Away'}</span>
                  </div>
                </div>
                <div className="aa">
                  <span className="abdg ex"><CheckCircle2 size={9} /> {p.homeScore}-{p.awayScore}</span>
                  <button className="ab ab-sm ab-olive" onClick={() => handleOverride(p)} disabled={isOverriding || (!s.h && s.h !== '0') || (!s.a && s.a !== '0')}>
                    {isOverriding ? <Loader2 size={11} className="asp" /> : <Copy size={11} />} Override
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {preds.length === 0 && (
        <Empty icon={Trophy} title="No featured matches for this date" hint="Add featured matches first, then score them here" />
      )}
    </div>
  );
});

/* ═════════════════════════════════════════════════════════════════════════════════
   BROADCAST TAB
   ═════════════════════════════════════════════════════════════════════════════════ */
const BroadcastTab = memo(function BroadcastTab({ toast }) {
  const [type, setType] = useState('global');
  const [uid, setUid] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [search, setSearch] = useState('');
  const [showUserList, setShowUserList] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!db) return;
    setLoadingUsers(true);
    try {
      const snap = await getDocs(query(collection(db, 'users'), limitQ(100)));
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setShowUserList(true);
    } catch (e) {
      toast('Load failed: ' + e.message, 'er');
    }
    setLoadingUsers(false);
  }, [toast]);

  const selectUser = useCallback((u) => {
    setType('personal');
    setUid(u.id);
    setSearch(`${u.displayName || u.email || u.id}`);
    setShowUserList(false);
    toast(`Selected ${u.displayName || u.email}`, 'ok');
  }, [toast]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(u => 
      (u.displayName || '').toLowerCase().includes(q) || 
      (u.email || '').toLowerCase().includes(q) ||
      (u.id || '').toLowerCase().includes(q)
    );
  }, [users, search]);

  const handleSend = useCallback(async () => {
    if (!db || !title.trim() || !message.trim()) return;
    if (type === 'personal' && !uid.trim()) { toast('Target UID required', 'in'); return; }
    
    setSending(true);
    try {
      await addDoc(collection(db, 'notifications'), {
        type,
        targetUid: type === 'personal' ? uid.trim() : null,
        title: title.trim(),
        body: message.trim(),
        createdAt: serverTimestamp(),
        readBy: [],
      });
      toast(`Notification sent!`, 'ok');
      setTitle(''); setMessage(''); setUid(''); setSearch('');
    } catch (e) { toast('Send failed: ' + e.message, 'er'); }
    setSending(false);
  }, [db, title, message, type, uid, toast]);

  return (
    <div className="ae">
      <div className="asec">
        <h3 className="ast"><Megaphone size={15} /> Send Notification</h3>
        
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button className={`ab ab-sm ${type === 'global' ? 'ab-p' : 'ab-ol'}`} onClick={() => setType('global')} style={{ flex: 1 }}>
            <Users size={12} /> Global
          </button>
          <button className={`ab ab-sm ${type === 'personal' ? 'ab-p' : 'ab-ol'}`} onClick={() => setType('personal')} style={{ flex: 1 }}>
            <UserCog size={12} /> Personal
          </button>
        </div>

        {type === 'personal' && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input className="aip" placeholder="Enter User UID manually or load users..." value={search} onChange={e => setSearch(e.target.value)} />
              <button className="ab ab-bl ab-sm" onClick={loadUsers} disabled={loadingUsers} style={{ flexShrink: 0 }}>
                {loadingUsers ? <Loader2 size={11} className="asp" /> : <Users size={11} />} Load Users
              </button>
            </div>
            {showUserList && (
              <div style={{ border: '1px solid var(--border)', borderRadius: '10px', maxHeight: '200px', overflowY: 'auto', background: 'var(--bg-surface)' }}>
                {filteredUsers.length > 0 ? filteredUsers.map(u => (
                  <div key={u.id} className="aur" style={{ margin: 0, borderRadius: 0, borderBottom: '1px solid var(--border)' }} onClick={() => selectUser(u)}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.65rem', fontWeight: 800, color: '#fff' }}>
                      {(u.displayName || u.email || '??').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '.76rem', fontWeight: 700, color: 'var(--text-primary)' }}>{u.displayName || 'Anonymous'}</div>
                      <div style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>{u.email || u.id}</div>
                    </div>
                  </div>
                )) : <p style={{ padding: 14, textAlign: 'center', color: 'var(--text-muted)', fontSize: '.75rem' }}>No users found</p>}
              </div>
            )}
            {uid && <div className="aedit-hint" style={{ marginTop: 4 }}>Target UID: {uid}</div>}
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <input className="aip" placeholder="Notification Title..." value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        
        <div style={{ marginBottom: 14 }}>
          <textarea className="aip" placeholder="Message body..." value={message} onChange={e => setMessage(e.target.value)} rows={4} style={{ resize: 'vertical', minHeight: 100 }} />
        </div>

        <button className="ab ab-p" onClick={handleSend} disabled={sending || !title.trim() || !message.trim()} style={{ width: '100%' }}>
          {sending ? <Loader2 size={13} className="asp" /> : <Send size={13} />} Broadcast Message
        </button>
      </div>
    </div>
  );
});

/* ═════════════════════════════════════════════════════════════════════════════════
   STAFF TAB
   ═════════════════════════════════════════════════════════════════════════════════ */
const StaffTab = memo(function StaffTab({ toast }) {
  const mounted = useMounted();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const loadStaff = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['admin', 'staff'])));
      if (mounted.current) {
        setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.role === 'admin' ? 0 : 1) - (b.role === 'admin' ? 0 : 1)));
      }
    } catch (e) { toast('Load failed: ' + e.message, 'er'); }
    setLoading(false);
  }, [db, mounted, toast]);

  const addStaff = useCallback(async () => {
    if (!db || !email.trim()) return;
    setAdding(true);
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email.trim().toLowerCase())));
      if (snap.empty) { toast('User not found', 'er'); setAdding(false); return; }
      const uid = snap.docs[0].id;
      await setDoc(doc(db, 'users', uid), { role: 'staff', updatedAt: serverTimestamp() }, { merge: true });
      toast(`Added ${email} as staff`, 'ok');
      setEmail('');
      loadStaff();
    } catch (e) { toast('Add failed: ' + e.message, 'er'); }
    setAdding(false);
  }, [db, email, toast, loadStaff]);

  const removeRole = useCallback(async (uid) => {
    if (!db) return;
    try {
      await setDoc(doc(db, 'users', uid), { role: 'user', updatedAt: serverTimestamp() }, { merge: true });
      toast('Role removed', 'ok');
      setStaff(prev => prev.filter(s => s.id !== uid));
    } catch (e) { toast('Remove failed: ' + e.message, 'er'); }
  }, [db, toast]);

  return (
    <div className="ae">
      <div className="asec">
        <h3 className="ast"><UserCog size={15} /> Staff Members</h3>
        <div className="ausr-input">
          <input className="aip" placeholder="Enter email to add as staff..." value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && addStaff()} />
          <button className="ab ab-p ab-sm" onClick={addStaff} disabled={adding || !email.trim()}>
            {adding ? <Loader2 size={11} className="asp" /> : <Plus size={11} />} Add
          </button>
        </div>
        <button className="ab ab-gh ab-sm" onClick={loadStaff} disabled={loading} style={{ marginBottom: 12 }}>
          {loading ? <Loader2 size={11} className="asp" /> : <Users size={11} />} {staff.length > 0 ? 'Refresh' : 'Load Staff from Firebase'}
        </button>
        {staff.length > 0 ? staff.map(s => (
          <div key={s.id} className="aur">
            <div style={{ width: 38, height: 38, borderRadius: 10, background: s.role === 'admin' ? 'rgba(245,197,66,.12)' : 'rgba(96,165,250,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.role === 'admin' ? 'var(--gold)' : 'var(--blue)', fontWeight: 900, fontSize: '.85rem', flexShrink: 0 }}>
              {(s.displayName || s.email || '??').slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>{s.displayName || 'Unknown'}</div>
              <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>{s.email}</div>
            </div>
            <span className={`abdg ${s.role === 'admin' ? 'gd' : 'bl'}`}>{s.role?.toUpperCase()}</span>
            <button className="ab ab-sm ab-dg" onClick={() => removeRole(s.id)}><Ban size={11} /></button>
          </div>
        )) : !loading && <Empty icon={UserCog} title="No staff loaded" hint="Click the button above to load from Firebase" />}
      </div>
    </div>
  );
});

/* ═════════════════════════════════════════════════════════════════════════════════
   USERS TAB
   ═════════════════════════════════════════════════════════════════════════════════ */
const UsersTab = memo(function UsersTab({ toast }) {
  const mounted = useMounted();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [lastKey, setLastKey] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  const loadUsers = useCallback(async (more = false) => {
    if (!db) return;
    setLoading(true);
    try {
      let q = query(collection(db, 'users'), limitQ(50));
      const snap = await getDocs(q);
      if (mounted.current) {
        const newUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        newUsers.sort((a, b) => {
          const tsA = a.createdAt?.seconds || 0;
          const tsB = b.createdAt?.seconds || 0;
          return tsB - tsA;
        });
        setUsers(prev => more ? [...prev, ...newUsers] : newUsers);
        setLastKey(snap.docs[snap.docs.length - 1] || null);
        setHasMore(snap.docs.length === 50);
      }
    } catch (e) { toast('Load failed: ' + e.message, 'er'); }
    setLoading(false);
  }, [db, mounted, toast]);

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(u => 
      (u.displayName || '').toLowerCase().includes(q) || 
      (u.email || '').toLowerCase().includes(q) ||
      (u.id || '').toLowerCase().includes(q)
    );
  }, [users, search]);

  return (
    <div className="ae">
      <div className="asec">
        <h3 className="ast"><Users size={15} /> Users</h3>
        <button className="ab ab-p" onClick={() => loadUsers(false)} disabled={loading} style={{ marginBottom: 14, width: '100%', justifyContent: 'center' }}>
          {loading ? <Loader2 size={14} className="asp" /> : <Users size={14} />}
          {users.length > 0 ? 'Reload Users' : 'Load Users from Firebase'}
        </button>
        {users.length > 0 && (
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input className="aip" style={{ paddingLeft: 36 }} placeholder="Search by name, email, UID..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        )}
        {filtered.length > 0 ? filtered.map((u, i) => (
          <div key={u.id} className="aur">
            <div style={{ width: 38, height: 38, borderRadius: 10, background: `hsl(${(i * 37) % 360}, 50%, 25%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '.78rem', flexShrink: 0 }}>
              {(u.displayName || u.email || '??').slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{u.displayName || 'Anonymous'}</div>
              <div style={{ fontSize: '.66rem', color: 'var(--text-muted)', fontWeight: 600 }}>{u.email || u.id}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '.68rem', fontWeight: 700, color: u.role === 'admin' ? 'var(--gold)' : u.role === 'staff' ? 'var(--blue)' : 'var(--text-muted)' }}>{(u.role || 'user').toUpperCase()}</div>
              <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', fontWeight: 600 }}>{u.createdAt ? fmtTimeAgo(u.createdAt) : ''}</div>
            </div>
          </div>
        )) : !loading && users.length > 0 && <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '.82rem', padding: 20, fontWeight: 600 }}>No users match "{search}"</p>}
        {hasMore && (
          <button className="asm" onClick={() => loadUsers(true)} disabled={loading} style={{ marginTop: 8 }}>
            {loading ? <Loader2 size={13} className="asp" /> : <ChevronDown size={13} />} Load more
          </button>
        )}
      </div>
    </div>
  );
});