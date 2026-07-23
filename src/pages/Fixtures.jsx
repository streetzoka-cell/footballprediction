// ═════════════════════════════════════════════════════════════════════════════════
// FILE: src/pages/Fixtures.jsx
// ★ FIXED: Cleaned up live match merging, true local time, premium UI structure.
// ═════════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, X, Star, Volume2, VolumeX, Clock, Trophy, Users,
  Pause, Flag, Zap, ChevronRight, ChevronDown,
  RefreshCw, Calendar, AlertTriangle, Activity, Plus, Minus, Pin, TrendingUp, ArrowRight, Flame, Camera, Loader
} from 'lucide-react';

import { fetchFixtures, subscribeToLiveFixtures } from '../utils/api';
import { useFootballData } from '../context/FootballDataContext';
import { getLocalDateStr, getLocalDateFromUtc, formatDateShort, formatTime, todayStr, yesterdayStr, tomorrowStr } from '../utils/dates';
import SEO from '../components/SEO';

// ─── Constants & Config ───
const STORAGE_KEY_FAVS = "zoka_favs";
const STORAGE_KEY_PINNED = "zoka_pinned_leagues";
const STORAGE_KEY_FONT = "zoka_fontscale";
const LIVE_REFRESH = 45000;
const TOP_5_CODES = ['PL', 'PD', 'SA', 'BL1', 'FL1']; 

const MatchStatus = Object.freeze({
  LIVE: 'LIVE', FT: 'FT', HT: 'HT', STARTED: 'STARTED',
  IN_PLAY: 'IN_PLAY', PAUSED: 'PAUSED', AET: 'AET', PEN: 'PEN',
  HALF_TIME: 'HALF_TIME', FINISHED: 'FINISHED'
});

const LIVE_STATUSES_SET = new Set([
  MatchStatus.IN_PLAY, MatchStatus.PAUSED, MatchStatus.LIVE, 
  '1H', '2H', 'ET', 'BT'
]);

const TOP_TEAMS_LIST = [
  'manchester united', 'manchester city', 'liverpool', 'chelsea', 'arsenal', 'tottenham hotspur', 'tottenham',
  'real madrid', 'barcelona', 'atletico madrid', 'athletic bilbao', 'sevilla', 'valencia',
  'bayern munich', 'borussia dortmund', 'rb leipzig', 'bayer leverkusen',
  'paris saint germain', 'psg', 'marseille', 'lyon',
  'juventus', 'inter', 'ac milan', 'napoli', 'roma', 'lazio', 'atalanta',
  'benfica', 'porto', 'sporting cp', 'ajax', 'psv eindhoven', 'feyenoord',
  'celtic', 'rangers', 'flamengo', 'palmeiras', 'corinthians', 'sao paulo',
  'boca juniors', 'river plate'
];
const TOP_TEAMS_SET = new Set(TOP_TEAMS_LIST);

const slugify = (text) => String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');

const sortMatches = (a, b) => {
  if (a.isLive && !b.isLive) return -1;
  if (!a.isLive && b.isLive) return 1;
  if (a.isHT && !b.isHT) return -1;
  if (!a.isHT && b.isHT) return 1;
  if (a.isFinished && !b.isFinished) return 1;
  if (!a.isFinished && b.isFinished) return -1;
  return (a.timestamp || 0) - (b.timestamp || 0);
};

// Audio Context for Sound Fx
const Sound = {
  ctx: null, on: true, _lg: 0, _lw: 0,
  _init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return false; } } if (this.ctx.state === 'suspended') this.ctx.resume(); return !!this.ctx; },
  _t() { return this.ctx ? this.ctx.currentTime : 0; },
  goal() {
    if (!this.on || !this._init()) return; if (Date.now() - this._lg < 2000) return; this._lg = Date.now();
    try { navigator.vibrate?.([80,40,80,40,120]); } catch {}
    const t = this._t(), w = this.ctx.createOscillator(), g = this.ctx.createGain();
    w.type='sawtooth'; w.frequency.setValueAtTime(180,t); w.frequency.exponentialRampToValueAtTime(600,t+.12);
    g.gain.setValueAtTime(.04,t); g.gain.exponentialRampToValueAtTime(.001,t+.18);
    w.connect(g); g.connect(this.ctx.destination); w.start(t); w.stop(t+.2);
    [523.25,659.25,783.99,1046.5].forEach((f,i)=>{const o=this.ctx.createOscillator(),gn=this.ctx.createGain();o.type='sine';o.frequency.value=f;const s=t+.14+i*.085;gn.gain.setValueAtTime(0,s);gn.gain.linearRampToValueAtTime(.15,s+.035);gn.gain.exponentialRampToValueAtTime(.001,s+.55);o.connect(gn);gn.connect(this.ctx.destination);o.start(s);o.stop(s+.6);});
  },
  whistle(type='ft') {
    if (!this.on || !this._init()) return; if (Date.now() - this._lw < 3000) return; this._lw = Date.now();
    const t = this._t(), freq = type==='ht'?2800:3200, dur = type==='ht'?.6:.9;
    const play=(start)=>{const o=this.ctx.createOscillator(),g=this.ctx.createGain(),lfo=this.ctx.createOscillator(),lg=this.ctx.createGain();o.type='sine';o.frequency.value=freq;lfo.type='sine';lfo.frequency.value=6;lg.gain.value=80;lfo.connect(lg);lg.connect(o.frequency);g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(.08,start+.05);g.gain.setValueAtTime(.08,start+dur-.1);g.gain.exponentialRampToValueAtTime(.001,start+dur);o.connect(g);g.connect(this.ctx.destination);o.start(start);o.stop(start+dur+.05);lfo.start(start);lfo.stop(start+dur+.05);};
    play(t); if(type==='ft') play(t+dur+.15);
  },
  kickoff() {
    if (!this.on || !this._init()) return;
    const t = this._t(), bs = this.ctx.sampleRate*.15, buf = this.ctx.createBuffer(1,bs,this.ctx.sampleRate), d = buf.getChannelData(0);
    for(let i=0;i<bs;i++) d[i]=(Math.random()*2-1)*(1-i/bs);
    const src=this.ctx.createBufferSource(),flt=this.ctx.createBiquadFilter(),g=this.ctx.createGain();
    src.buffer=buf; flt.type='bandpass'; flt.frequency.setValueAtTime(2000,t); flt.frequency.exponentialRampToValueAtTime(500,t+.15); flt.Q.value=2;
    g.gain.setValueAtTime(.06,t); g.gain.exponentialRampToValueAtTime(.001,t+.15);
    src.connect(flt); flt.connect(g); g.connect(this.ctx.destination); src.start(t);
  },
};

const CMT = {
  goal:["GOOOAL! Pure strike!","Back of the net!","Zoka magic!"],
  ft:["Full Time!","Final Whistle!"],
  ht:["Half Time!","HT Break."],
  kickoff:["Kick Off!","We're underway!"],
  rescue:["Backup Source Active","Switched to global feed"],
};
const pick = (a) => a[Math.floor(Math.random()*a.length)];

function useToasts() {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const timers = useRef(new Map());
  const add = useCallback(t => {
    const id = ++idRef.current;
    setToasts(p => [...p.slice(-2), { ...t, id }]);
    timers.current.set(id, setTimeout(() => { setToasts(p => p.filter(x => x.id !== id)); timers.current.delete(id); }, t.dur || 3500));
    return id;
  }, []);
  const dismiss = useCallback(id => {
    setToasts(p => p.filter(x => x.id !== id));
    if (timers.current.has(id)) { clearTimeout(timers.current.get(id)); timers.current.delete(id); }
  }, []);
  useEffect(() => () => { timers.current.forEach(t => clearTimeout(t)); timers.current.clear(); }, []);
  return { toasts, add, dismiss };
}

function useNotifications({ liveMatches, isFav, tab, addToast }) {
  const prevScores = useRef(new Map());
  const prevStatuses = useRef(new Map());
  const timeouts = useRef(new Map());
  
  const [scorePops, setScorePops] = useState(new Map());
  const [flashGoals, setFlashGoals] = useState(new Set());
  const [statusAnims, setStatusAnims] = useState(new Map());
  const [confettiKey, setConfettiKey] = useState(0);

  const clearTO = useCallback((k) => { if (timeouts.current.has(k)) { clearTimeout(timeouts.current.get(k)); timeouts.current.delete(k); } }, []);
  const setTO = useCallback((k, fn, ms) => { clearTO(k); timeouts.current.set(k, setTimeout(() => { fn(); timeouts.current.delete(k); }, ms)); }, [clearTO]);
  const isLiveStatus = useCallback((s) => LIVE_STATUSES_SET.has(s), []);

  useEffect(() => {
    liveMatches.forEach(m => {
      const id = String(m.id);
      const shouldNotify = isFav(id) || tab === 'fixtures';
      const prev = prevScores.current.get(id);
      const h = m.homeScore, a = m.awayScore;
      
      if (prev) {
        if (h != null && prev.h != null && h > prev.h) {
          if (shouldNotify) { addToast({ type: 'goal', msg: pick(CMT.goal), detail: m.homeName, score: `${h}–${a}`, dur: 3500 }); if (Sound.on) Sound.goal(); setConfettiKey(k => k + 1); }
          setFlashGoals(p => new Set([...p, id])); setScorePops(p => new Map([...p, [id, 'home']])); setTO(`pop-${id}`, () => setScorePops(p => { const n = new Map(p); n.delete(id); return n; }), 600);
          setTO(`flash-${id}`, () => setFlashGoals(p => { const n = new Set(p); n.delete(id); return n; }), 3000);
        }
        if (a != null && prev.a != null && a > prev.a) {
          if (shouldNotify) { addToast({ type: 'goal', msg: pick(CMT.goal), detail: m.awayName, score: `${h}–${a}`, dur: 3500 }); if (Sound.on) Sound.goal(); setConfettiKey(k => k + 1); }
          setFlashGoals(p => new Set([...p, id])); setScorePops(p => new Map([...p, [id, 'away']])); setTO(`pop-${id}`, () => setScorePops(p => { const n = new Map(p); n.delete(id); return n; }), 600);
          setTO(`flash-${id}`, () => setFlashGoals(p => { const n = new Set(p); n.delete(id); return n; }), 3000);
        }
      }
      prevScores.current.set(id, { h, a });
    });

    liveMatches.forEach(m => {
      const id = String(m.id);
      const shouldNotify = isFav(id) || tab === 'fixtures';
      const prev = prevStatuses.current.get(id);
      const curr = m.status || '';
      if (prev && prev !== curr) {
        if (!isLiveStatus(prev) && isLiveStatus(curr)) {
          if (shouldNotify) addToast({ type: 'status', st: 'live', msg: pick(CMT.kickoff), detail: `${m.homeName} vs ${m.awayName}`, dur: 3000 });
          if (Sound.on) Sound.kickoff();
          setStatusAnims(p => new Map([...p, [id, { type: 'live', t: Date.now() }]]));
          setTO(`sa-${id}`, () => setStatusAnims(p => { const n = new Map(p); n.delete(id); return n; }), 3500);
        }
        if (isLiveStatus(prev) && (curr === MatchStatus.FINISHED || curr === MatchStatus.FT)) {
          const score = `${m.homeScore ?? 0}–${m.awayScore ?? 0}`;
          if (shouldNotify) addToast({ type: 'status', st: 'ft', msg: pick(CMT.ft), detail: `${m.homeName} vs ${m.awayName}`, score, dur: 4000 });
          if (Sound.on) Sound.whistle('ft');
          setStatusAnims(p => new Map([...p, [id, { type: 'ft', t: Date.now() }]]));
          setTO(`sa-${id}`, () => setStatusAnims(p => { const n = new Map(p); n.delete(id); return n; }), 3500);
        }
        if ((curr === MatchStatus.HALF_TIME || curr === MatchStatus.HT) && prev !== MatchStatus.HALF_TIME && prev !== MatchStatus.HT) {
          if (shouldNotify) addToast({ type: 'status', st: 'ht', msg: pick(CMT.ht), detail: `${m.homeName} vs ${m.awayName}`, dur: 3000 });
          if (Sound.on) Sound.whistle('ht');
          setStatusAnims(p => new Map([...p, [id, { type: 'ht', t: Date.now() }]]));
          setTO(`sa-${id}`, () => setStatusAnims(p => { const n = new Map(p); n.delete(id); return n; }), 3500);
        }
      }
      prevStatuses.current.set(id, curr);
    });
  }, [liveMatches, addToast, isFav, tab, isLiveStatus, setTO]);

  const matchState = useMemo(() => ({ scorePops, flashGoals, statusAnims }), [scorePops, flashGoals, statusAnims]);
  return { matchState, confettiKey };
}

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const matchQ = (m, terms) => [m.homeName, m.awayName, m.leagueName].map(norm).some(x => x && terms.every(t => x.includes(t)));

function extractMatchDate(m) {
  if (!m) return '';
  const rawDate = m.utcDate || m.date || (m.timestamp ? new Date(m.timestamp).toISOString() : null);
  if (rawDate) return getLocalDateFromUtc(rawDate);
  if (m.date && m.date.includes('T')) return m.date.split('T')[0];
  if (m.date) return m.date;
  return '';
}

function normalizeMatch(raw, isPrimary) {
  if (!raw) return null;
  const id = String(raw.id || raw.matchId);
  let status = raw.status || '';
  
  let dateStr = extractMatchDate(raw);
  let kickoff = 'TBD';
  let timestamp = 0;

  const rawDate = raw.utcDate || raw.date;
  if (rawDate) {
    try {
      const dt = new Date(rawDate);
      kickoff = formatTime(rawDate); 
      timestamp = dt.getTime();
    } catch {}
  } else if (raw.kickoff) {
    kickoff = raw.kickoff;
  }

  let isLive = isPrimary ? !!raw.isLive : LIVE_STATUSES_SET.has(status);
  let isHT = status === MatchStatus.HT || status === 'BT' || status === MatchStatus.HALF_TIME;
  let isFinished = isPrimary ? !!raw.isFinished : (status === MatchStatus.FINISHED || status === MatchStatus.FT || status === MatchStatus.AET || status === MatchStatus.PEN);
  let isStarted = false; 
  
  if (isLive && timestamp > 0) {
    const twoHalfHoursMs = 2.5 * 60 * 60 * 1000;
    if (Date.now() > timestamp + twoHalfHoursMs) {
      isLive = false; isHT = false; isFinished = true; status = 'FT';
    }
  }

  if (!isFinished && !isLive && dateStr) {
    const todayDateStr = todayStr();
    if (dateStr < todayDateStr) {
      isFinished = true; isStarted = false; isHT = false; status = 'FT';
    } else if (dateStr === todayDateStr && timestamp > 0) {
      const elapsed = Date.now() - timestamp;
      const hasAnyScore = (raw.homeScore != null && raw.homeScore > 0) || (raw.awayScore != null && raw.awayScore > 0) || (raw.score?.fullTime?.home != null && raw.score?.fullTime?.home > 0) || (raw.score?.fullTime?.away != null && raw.score?.fullTime?.away > 0);
      if (elapsed > (3 * 60 * 60 * 1000) && !hasAnyScore) { isFinished = true; status = 'FT'; }
    }
  }

  if (timestamp > 0 && Date.now() > timestamp && !isLive && !isFinished) isStarted = true;

  const homeScore = isPrimary ? raw.homeScore : (raw.score?.fullTime?.home ?? raw.score?.halfTime?.home ?? null);
  const awayScore = isPrimary ? raw.awayScore : (raw.score?.fullTime?.away ?? raw.score?.halfTime?.away ?? null);

  return {
    id, dateStr, kickoff, timestamp, status, isLive, isHT, isFinished,
    minute: raw.minute || raw.elapsed || null, isStarted, 
    homeName: isPrimary ? (raw.homeTeam?.name || 'TBD') : (raw.homeTeam?.shortName || raw.homeTeam?.name || 'TBD'),
    awayName: isPrimary ? (raw.awayTeam?.name || 'TBD') : (raw.awayTeam?.shortName || raw.awayTeam?.name || 'TBD'),
    homeLogo: isPrimary ? raw.homeLogo : raw.homeTeam?.crest,
    awayLogo: isPrimary ? raw.awayLogo : raw.awayTeam?.crest,
    homeTeamId: isPrimary ? raw.homeTeam?.id : raw.homeTeam?.id,
    awayTeamId: isPrimary ? raw.awayTeam?.id : raw.awayTeam?.id,
    homeScore, awayScore,
    leagueName: isPrimary ? (raw.league?.name || 'Other') : (raw.competition?.name || raw.league?.name || 'Other'),
    leagueLogo: isPrimary ? (raw.league?.emblem || raw.league?.logo) : (raw.competition?.emblem || raw.league?.logo),
    score: raw.score, stats: raw.stats || raw.matchStats || [],
  };
}

const MatchCardSkeleton = React.memo(() => (
  <div className="zoka-sk-card">
    <div className="zoka-sk-row" style={{ justifyContent: 'space-between', marginBottom: '12px' }}>
      <div className="zoka-sk-line" style={{ width: '60px', height: '10px' }} />
      <div className="zoka-sk-circle" style={{ width: '40px', height: '12px', borderRadius: '4px' }} />
    </div>
    <div className="zoka-sk-row"><div className="zoka-sk-circle" /><div className="zoka-sk-line" /></div>
    <div className="zoka-sk-row" style={{ marginTop: '8px' }}><div className="zoka-sk-circle" /><div className="zoka-sk-line" /></div>
  </div>
));

const Skeleton = React.memo(({ count = 5 }) => (
  <div>{Array.from({ length: count }).map((_, i) => <MatchCardSkeleton key={i} />)}</div>
));

const ToastContainer = React.memo(({ toasts, onDismiss }) => {
  if (!toasts.length) return null;
  return (
    <div className="zoka-toast-wrap">
      {toasts.map(t => {
        const isGoal = t.type === 'goal', isRescue = t.type === 'rescue';
        let bg, icon;
        if (isRescue) { bg = 'linear-gradient(135deg,rgba(251,191,36,.9),rgba(245,158,11,.85))'; icon = '🌐'; }
        else if (isGoal) { bg = 'linear-gradient(135deg,rgba(239,68,68,.9),rgba(185,28,28,.85))'; icon = '⚽'; }
        else {
          const m = { ft: ['rgba(16,185,129,.9)','rgba(5,150,105,.85)'], ht: ['rgba(249,115,22,.9)','rgba(217,90,12,.85)'], live: ['rgba(239,68,68,.9)','rgba(220,38,38,.85)'] };
          const c = m[t.st] || m.live; bg = `linear-gradient(135deg,${c[0]},${c[1]})`;
          icon = t.st === 'ft' ? '🏁' : t.st === 'ht' ? '⏸️' : '⚡';
        }
        return (
          <div key={t.id} className="zoka-toast" style={{ background: bg }} onClick={() => onDismiss(t.id)}>
            <div className="zoka-toast-inner">
              <span className="zoka-toast-icon">{icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="zoka-toast-title">{isRescue ? 'AUTO-SWITCH' : isGoal ? 'GOAL!' : t.st === 'ft' ? 'FULL TIME' : t.st === 'ht' ? 'HALF TIME' : 'LIVE ACTION'}</div>
                {t.msg && <div className="zoka-toast-msg">{t.msg}</div>}
                {t.detail && <div className="zoka-toast-detail">{t.detail}</div>}
              </div>
              {t.score && <div className="zoka-toast-score">{t.score}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
});

const Confetti = React.memo(({ active }) => {
  if (!active) return null;
  const colors = ['#fbbf24','#f59e0b','#ef4444','#ffffff','#fbbf24','#f59e0b'];
  const p = Array.from({ length: 24 }, (_, i) => ({ left: 8 + Math.random() * 84, bottom: 80, color: colors[i % colors.length], delay: Math.random() * .3, rot: Math.random() * 360 }));
  return (
    <div className="zoka-confetti">
      {p.map((x, i) => <div key={i} className="zoka-confetti-p" style={{ left: x.left + '%', bottom: x.bottom + 'px', background: x.color, animationDelay: x.delay + 's', transform: `rotate(${x.rot}deg)` }} />)}
    </div>
  );
});

const ScoreBreakdown = React.memo(({ match, onNavigate }) => {
  if (match.isStarted && !match.isLive) {
    return (
      <div className="zoka-empty" style={{ padding: '30px', textAlign: 'center', borderRadius: '0 0 14px 14px' }}>
        <Clock size={24} style={{ marginBottom: '10px', color: '#475569' }} />
        <div style={{ color: '#e2e8f0', fontWeight: 700, marginBottom: '6px' }}>Match in Progress</div>
        <div style={{ color: '#64748b', fontSize: '.9em' }}>Live coverage not available. Results will be shown at Full Time.</div>
      </div>
    );
  }
  const s = match.score || {};
  const stats = match.stats || [];
  const goals = s.goals || [];
  const cards = s.cards || [];
  const periods = [
    { l: 'Half Time', h: s.halftime?.home, a: s.halftime?.away },
    { l: 'Full Time', h: s.fullTime?.home ?? match.homeScore, a: s.fullTime?.away ?? match.awayScore },
  ];
  const hasScoreData = periods.some(p => p.h != null || p.a != null);
  const hasEvents = goals.length > 0 || cards.length > 0;
  const hasStatsData = stats.length > 0;
  if (!hasScoreData && !hasEvents && !hasStatsData) return <div className="zoka-empty" style={{ borderRadius: 0, padding: '20px' }}>Details appear once the match begins</div>;
  const events = [...goals.map(g => ({ ...g, eventType: 'goal' })), ...cards.map(c => ({ ...c, eventType: 'card' }))].sort((a, b) => (a.minute || 0) - (b.minute || 0));

  return (
    <div style={{ padding: '8px 0 0' }}>
      {hasScoreData && (<>
        <div className="zoka-exp-section">Score Breakdown</div>
        {periods.filter(p => p.h != null || p.a != null).map(p => (
          <div key={p.l} className="zoka-exp-row"><span className="zoka-exp-label">{p.l}</span><span className="zoka-exp-val">{p.h ?? '-'} – {p.a ?? '-'}</span></div>
        ))}
      </>)}
      {hasEvents && (<>
        <div className="zoka-exp-section">Match Events</div>
        <div className="zoka-timeline">
          {events.map((e, i) => {
            const isGoal = e.eventType === 'goal';
            const isYellow = e.type === 'YELLOW_CARD';
            const isRed = e.type === 'RED_CARD';
            const isHome = e.team?.id === match.homeTeamId || e.team?.name === match.homeName;
            const prevEvent = events[i-1];
            const showHTDivider = prevEvent && prevEvent.minute <= 45 && e.minute > 45;
            return (
              <React.Fragment key={i}>
                {showHTDivider && <div className="zoka-timeline-divider">HALF TIME</div>}
                <div className={`zoka-timeline-row ${isHome ? 'home' : 'away'}`}>
                  <span className="zoka-timeline-min">{e.minute != null ? `${e.minute}'` : ''}</span>
                  <span className="zoka-timeline-icon">{isGoal ? '⚽' : isYellow ? '🟨' : isRed ? '🟥' : '⚠️'}</span>
                  <span className="zoka-timeline-text">{e.scorer?.name || e.player?.name || 'Unknown'}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </>)}
      {hasStatsData && (<>
        <div className="zoka-exp-section">Match Stats</div>
        {stats.map((stat, i) => {
          const homeVal = parseFloat(stat.home) || 0;
          const awayVal = parseFloat(stat.away) || 0;
          const total = homeVal + awayVal;
          const homePct = total > 0 ? (homeVal / total) * 100 : 50;
          const awayPct = total > 0 ? (awayVal / total) * 100 : 50;
          return (
            <div key={i} className="zoka-stat-bar">
              <span className="zoka-stat-val home">{stat.home}</span>
              <div className="zoka-stat-track">
                <div className="zoka-stat-fill home" style={{ width: `${homePct}%` }} />
                <div className="zoka-stat-fill away" style={{ width: `${awayPct}%` }} />
                <span className="zoka-stat-label">{stat.type}</span>
              </div>
              <span className="zoka-stat-val away">{stat.away}</span>
            </div>
          );
        })}
      </>)}
      <button className="zoka-view-details" onClick={() => onNavigate(match.id)}>View Match Details <ArrowRight size={14} /></button>
    </div>
  );
});

const MatchCard = React.memo(({ m, idx, expanded, onToggle, onNavigate, matchState, isFav, onFav, onReactNow }) => {
  const isLive = m.isLive; const isHT = m.isHT; const isFt = m.isFinished; const isStarted = m.isStarted;
  const isSched = !isLive && !isHT && !isFt && !isStarted;
  const isExp = expanded === m.id;
  const id = String(m.id);
  const isFlash = matchState.flashGoals.has(id);
  const sa = matchState.statusAnims.get(id);
  const popSide = matchState.scorePops.get(id);

  let cls = 'zoka-card';
  if (isLive) cls += ' live'; else if (isStarted) cls += ' started';
  else if (isFt) cls += ' finished'; else if (isSched) cls += ' scheduled';
  if (isFlash) cls += ' goal-flash'; if (sa?.type === 'ft') cls += ' ft-settle';
  if (isExp) cls += ' expanded';
  const barColor = isLive ? '#ef4444' : isStarted ? '#fbbf24' : isFt ? '#10b981' : 'transparent';

  return (
    <div>
      <div className={cls} style={{ animationDelay: idx * 15 + 'ms', paddingLeft: (isLive || isStarted || isFt) ? 18 : 16 }} onClick={() => onToggle(isExp ? null : m.id)}>
        {(isLive || isStarted || isFt) && <div className="zoka-left-bar" style={{ background: barColor }} />}
        <div className="zoka-card-top">
          <div>
            {isLive && <span className="zoka-status live-s"><span className="zoka-dot" /> {m.minute != null ? `${m.minute}'` : MatchStatus.LIVE}</span>}
            {isStarted && <span className="zoka-status started-s"><Clock size={10} /> {MatchStatus.STARTED}</span>}
            {isHT && <span className="zoka-status" style={{ color: '#fbbf24', background: 'rgba(251,191,36,.12)' }}>{MatchStatus.HT}</span>}
            {isFt && <span className="zoka-status ft-s">{MatchStatus.FT}</span>}
            {isSched && <span className="zoka-status time-s">{m.kickoff}</span>}
          </div>
          <div className="zoka-card-actions" onClick={e => e.stopPropagation()}>
            <button className={`zoka-icon-btn fav ${isFav ? 'active' : ''}`} onClick={() => onFav(m.id)} title="Favourite" aria-label="Toggle favourite">
              <Star size={16} fill={isFav ? '#fbbf24' : 'none'} color={isFav ? '#fbbf24' : '#475569'} />
            </button>
          </div>
        </div>
        <div className="zoka-teams">
          <div className="zoka-team-col home"><div className="zoka-team-row">{m.homeLogo && <img className="zoka-crest" src={m.homeLogo} alt="" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}<span className="zoka-team-name">{m.homeName}</span></div></div>
          <div className="zoka-score-box">
            {(isLive || isHT || isFt) ? (
              <div className="zoka-scores">
                <span className={`zoka-score-num ${isLive ? 'live-score' : ''} ${isFt ? 'ft-score' : ''} ${popSide === 'home' ? 'pop' : ''}`} key={`h-${m.id}-${m.homeScore}-${popSide}`}>{m.homeScore ?? 0}</span>
                <span className="zoka-sep">–</span>
                <span className={`zoka-score-num ${isLive ? 'live-score' : ''} ${isFt ? 'ft-score' : ''} ${popSide === 'away' ? 'pop' : ''}`} key={`a-${m.id}-${m.awayScore}-${popSide}`}>{m.awayScore ?? 0}</span>
              </div>
            ) : <span className="zoka-vs">VS</span>}
          </div>
          <div className="zoka-team-col away"><div className="zoka-team-row">{m.awayLogo && <img className="zoka-crest" src={m.awayLogo} alt="" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}<span className="zoka-team-name">{m.awayName}</span></div></div>
        </div>
        <div className="zoka-comp-row">{m.leagueLogo && <img src={m.leagueLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}<span>{m.leagueName}</span></div>
        {sa && (
          <div className="zoka-overlay">
            <div className="zoka-overlay-badge" style={{ background: sa.type === 'ht' ? 'rgba(249,115,22,.88)' : sa.type === 'ft' ? 'rgba(16,185,129,.88)' : 'rgba(239,68,68,.88)' }}>
              {sa.type === 'ht' && <><Pause size={16} /> HALF TIME</>}
              {sa.type === 'ft' && <><Flag size={16} /> FULL TIME</>}
              {sa.type === 'live' && <><Zap size={16} /> KICK OFF</>}
            </div>
          </div>
        )}
      </div>
      {isExp && (
        <div className="zoka-expanded">
          <div className="zoka-react-banner" onClick={(e) => { e.stopPropagation(); onReactNow(m); }}><Camera size={16} /> React Now</div>
          <ScoreBreakdown match={m} onNavigate={onNavigate} />
        </div>
      )}
    </div>
  );
});

const LeagueSection = React.memo(({ group, expanded, onToggle, onNavigate, isExpanded, toggleLeagueExpand, matchState, isFav, onFav, isPinned, onTogglePin, onReactNow }) => {
  const limit = group.isTop || isPinned ? 5 : 1;
  const visibleMatches = isExpanded ? group.matches : group.matches.slice(0, limit);
  const hiddenCount = group.matches.length - limit;
  return (
    <div className="zoka-section">
      <div className="zoka-league-hd">
        {group.logo && <img src={group.logo} alt="" style={{ width: '16px', height: '16px', borderRadius: '3px' }} onError={e => { e.target.style.display = 'none'; }} />}
        <span className="zoka-league-name">{group.name}</span>
        <span className="zoka-league-count">{group.matches.length}</span>
        <button className="zoka-icon-btn" style={{ opacity: isPinned ? 1 : 0.5, color: isPinned ? '#10b981' : '#475569' }} onClick={() => onTogglePin(group.name)} title="Pin League"><Pin size={12} fill={isPinned ? '#10b981' : 'none'} /></button>
      </div>
      {visibleMatches.map((m, i) => <MatchCard key={`${group.name}-${m.id}-${i}`} m={m} idx={i} expanded={expanded} onToggle={onToggle} onNavigate={onNavigate} matchState={matchState} isFav={isFav(m.id)} onFav={onFav} onReactNow={onReactNow} />)}
      {hiddenCount > 0 && (
        <button className="zoka-show-more" onClick={() => toggleLeagueExpand(group.name)}>
          {isExpanded ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          {isExpanded ? 'Show less' : `Show ${hiddenCount} more matches`}
        </button>
      )}
    </div>
  );
});

const CompCard = React.memo(({ c }) => (
  <div className="zoka-team-card" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px', textAlign: 'left' }}>
    {c.emblem && <img src={c.emblem} alt="" style={{ width: '32px', height: '32px', margin: 0 }} onError={e => { e.target.style.display = 'none'; }} />}
    <div className="name">{c.name}</div>
  </div>
));

function CompetitionSelector({ selectedCompCode, onSelect, topGlobalComps, otherGlobalComps }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const filteredComps = useMemo(() => { if (!searchQ.trim()) return otherGlobalComps; return otherGlobalComps.filter(c => (c.name || '').toLowerCase().includes(searchQ.toLowerCase())); }, [otherGlobalComps, searchQ]);
  return (
    <>
      <div className="zoka-pill-scroll" style={{ marginBottom: '10px' }}>
        {topGlobalComps.map(c => (<button key={c.id} className={`zoka-pill ${selectedCompCode === c.code ? 'active' : ''}`} onClick={() => onSelect(c.code)}>{c.emblem && <img src={c.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}{c.code || c.name}</button>))}
      </div>
      <button className="zoka-pill" style={{ width: '100%', marginBottom: '10px', borderRadius: '12px', padding: '12px 16px' }} onClick={() => setSearchOpen(p => !p)}>
        <Search size={16} />{searchOpen ? 'Close All Leagues Search' : 'Search All Other Leagues'}<ChevronDown size={16} style={{ marginLeft: 'auto', opacity: 0.6 }} />
      </button>
      {searchOpen && (
        <div className="zoka-filter-panel" style={{ position: 'static', maxHeight: '300px' }}>
          <input className="zoka-search-static" style={{ width: '100%', marginBottom: '10px' }} placeholder="Type league name..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
          {filteredComps.length === 0 && <div className="zoka-empty" style={{ padding: '12px' }}><p>No leagues found</p></div>}
          {filteredComps.map(c => (<button key={c.id} className={`zoka-filter-item ${selectedCompCode === c.code ? 'active' : ''}`} onClick={() => { onSelect(c.code); setSearchOpen(false); setSearchQ(''); }}>{c.emblem && <img src={c.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}{c.name}</button>))}
        </div>
      )}
    </>
  );
}

export default function Fixtures() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { fixtures: backupRaw, liveMatches: backupLive, competitions, loading: backupLoading, loadDateFixtures, getStandings, getTeams, refreshFixtures } = useFootballData();
  const { toasts, add: addToast, dismiss: dismissToast } = useToasts();
  
  const [tab, setTab] = useState(searchParams.get('tab') || 'fixtures');
  const [selectedDate, setSelectedDate] = useState(searchParams.get('date') || todayStr());
  const [compFilter, setCompFilter] = useState(searchParams.get('league') || 'ALL');
  
  const [favs, setFavs] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY_FAVS) || '[]')); } catch { return new Set(); } });
  const [pinnedLeagues, setPinnedLeagues] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY_PINNED) || '[]')); } catch { return new Set(); } });
  
  const toggleFav = useCallback(id => { setFavs(p => { const n = new Set(p); const idStr = String(id); if (n.has(idStr)) n.delete(idStr); else n.add(idStr); try { localStorage.setItem(STORAGE_KEY_FAVS, JSON.stringify([...n])); } catch {} return n; }); }, []);
  const togglePinLeague = useCallback(leagueName => { setPinnedLeagues(p => { const n = new Set(p); if (n.has(leagueName)) n.delete(leagueName); else n.add(leagueName); try { localStorage.setItem(STORAGE_KEY_PINNED, JSON.stringify([...n])); } catch {} return n; }); }, []);
  const isFav = useCallback(id => favs.has(String(id)), [favs]);

  const [primaryFixtures, setPrimaryFixtures] = useState([]);
  const [primaryLoading, setPrimaryLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  
  const [globalLiveMatches, setGlobalLiveMatches] = useState([]);

  const deferredSearch = useDeferredValue(searchQ);
  const normalizedSearch = useMemo(() => deferredSearch.trim().toLowerCase(), [deferredSearch]);

  const [ui, setUI] = useState({ soundOn: true, rescued: false, moreDatesOpen: false, leagueFilterOpen: false, showLiveOnly: false, showAllTopMatches: false, showAllLiveMatches: false });
  const toggleUI = useCallback((key) => setUI(prev => ({ ...prev, [key]: !prev[key] })), []);
  
  const [standingsData, setStandingsData] = useState(null);
  const [teamsData, setTeamsData] = useState(null);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(false);
  
  const rescueToastSent = useRef(false);
  const welcomeToastShown = useRef(false);
  const [expandedLeagues, setExpandedLeagues] = useState(new Set());
  
  const [fontScale, setFontScale] = useState(() => { try { return parseFloat(localStorage.getItem(STORAGE_KEY_FONT) || '1'); } catch { return 1; } });
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY_FONT, String(fontScale)); } catch {} }, [fontScale]);
  
  const [selectedCompCode, setSelectedCompCode] = useState(null);
  const moreRef = useRef(null);

  useEffect(() => {
    const params = {};
    if (tab !== 'fixtures') params.tab = tab;
    if (selectedDate !== todayStr()) params.date = selectedDate;
    if (compFilter !== 'ALL') params.league = compFilter;
    setSearchParams(params, { replace: true });
  }, [tab, selectedDate, compFilter, setSearchParams]);

  const dates = useMemo(() => {
    const past = []; for (let i = 14; i >= 2; i--) { const d = getLocalDateStr(-i); past.push({ str: d, label: formatDateShort(d) }); }
    const future = []; for (let i = 2; i <= 15; i++) { const d = getLocalDateStr(i); future.push({ str: d, label: formatDateShort(d) }); }
    return { past, future };
  }, []);

  const leaguePriorityMap = useMemo(() => ({ 'FIFA World Cup': 1, 'UEFA Champions League': 2, 'UEFA Europa League': 3, 'UEFA Conference League': 4, 'Premier League': 5, 'La Liga': 6, 'Serie A': 7, 'Bundesliga': 8, 'Ligue 1': 9, 'Primeira Liga': 10, 'Eredivisie': 11, 'Süper Lig': 12, 'Championship': 13 }), []);

  useEffect(() => { Sound.on = ui.soundOn; }, [ui.soundOn]);

  useEffect(() => {
    const handler = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setUI(prev => ({ ...prev, moreDatesOpen: false })); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isPrimaryDate = [yesterdayStr(), todayStr(), tomorrowStr()].includes(selectedDate);

  const mergeLiveMatches = useCallback((baseMatches, liveMatches) => {
    if (!liveMatches || liveMatches.length === 0) return baseMatches;
    const liveMap = new Map(liveMatches.map(m => [String(m.id), m]));
    let changed = false;
    const next = baseMatches.map(f => {
      const liveMatch = liveMap.get(String(f.id));
      if (liveMatch) {
        const normalizedLive = normalizeMatch(liveMatch, true);
        if (normalizedLive.isLive !== f.isLive || normalizedLive.isFinished !== f.isFinished || normalizedLive.homeScore !== f.homeScore || normalizedLive.awayScore !== f.awayScore || normalizedLive.minute !== f.minute) {
          changed = true;
          return { ...f, ...normalizedLive };
        }
      }
      return f;
    });
    return changed ? next : baseMatches;
  }, []);

  const fetchPrimary = useCallback(async (date, silent = false) => {
    if (!silent) setPrimaryLoading(true);
    try {
      const res = await fetchFixtures(date);
      const l = Array.isArray(res) ? res : res?.matches || [];
      let baseMatches = l.map(m => normalizeMatch(m, true));
      
      if (globalLiveMatches.length > 0) {
        baseMatches = mergeLiveMatches(baseMatches, globalLiveMatches);
      }
      
      setPrimaryFixtures(baseMatches);
    } catch (e) {
      setPrimaryFixtures([]);
    } finally {
      if (!silent) setPrimaryLoading(false);
    }
  }, [globalLiveMatches, mergeLiveMatches]);

  useEffect(() => {
    if (!isPrimaryDate) { setPrimaryFixtures([]); setPrimaryLoading(false); return; }
    fetchPrimary(selectedDate);
  }, [selectedDate, isPrimaryDate, fetchPrimary]);

  useEffect(() => { if (selectedDate) loadDateFixtures(selectedDate); }, [selectedDate, loadDateFixtures]);

  useEffect(() => {
    if (!isPrimaryDate) return;
    const interval = setInterval(() => { fetchPrimary(selectedDate, true); }, LIVE_REFRESH);
    return () => clearInterval(interval);
  }, [selectedDate, isPrimaryDate, fetchPrimary]);

  useEffect(() => {
    const unsub = subscribeToLiveFixtures(selectedDate, ({ matches: lm }) => {
      if (!lm) return;
      setGlobalLiveMatches(lm);
    });
    return () => unsub();
  }, [selectedDate]);

  useEffect(() => {
    if (globalLiveMatches.length === 0) return;
    
    setPrimaryFixtures(prev => {
      const liveForDate = globalLiveMatches.filter(m => extractMatchDate(m) === selectedDate);
      if (liveForDate.length === 0) return prev;
      
      const liveMap = new Map(liveForDate.map(m => [String(m.id), m]));
      let changed = false;
      const next = prev.map(f => {
        const freshMatch = liveMap.get(String(f.id));
        if (freshMatch) {
          liveMap.delete(String(f.id)); 
          const normalizedFresh = normalizeMatch(freshMatch, true);
          if (normalizedFresh.isLive !== f.isLive || normalizedFresh.isFinished !== f.isFinished || normalizedFresh.homeScore !== f.homeScore || normalizedFresh.awayScore !== f.awayScore || normalizedFresh.minute !== f.minute) {
            changed = true;
            return { ...f, ...normalizedFresh };
          }
        }
        return f;
      });
      
      return changed ? next : prev;
    });
  }, [globalLiveMatches, selectedDate]);

  const backupFixtures = useMemo(() => {
    return (backupRaw || []).map(m => normalizeMatch(m, false)).filter(m => m.dateStr === selectedDate);
  }, [backupRaw, selectedDate]);

  useEffect(() => {
    const needsRescue = primaryFixtures.length === 0 && backupFixtures.length > 0 && !primaryLoading;
    if (needsRescue && !ui.rescued) {
      setUI(prev => ({ ...prev, rescued: true }));
      if (!rescueToastSent.current) { rescueToastSent.current = true; addToast({ type: 'rescue', msg: pick(CMT.rescue), detail: `Showing ${backupFixtures.length} games from backup`, dur: 4000 }); }
    }
    if (!needsRescue && ui.rescued) { setUI(prev => ({ ...prev, rescued: false })); rescueToastSent.current = false; }
  }, [primaryFixtures.length, backupFixtures.length, primaryLoading, ui.rescued, addToast]);

  useEffect(() => {
    if (!welcomeToastShown.current && !primaryLoading && primaryFixtures.length > 0) {
      const live = primaryFixtures.filter(m => m.isLive && (m.homeScore > 0 || m.awayScore > 0));
      if (live.length > 0) { welcomeToastShown.current = true; setTimeout(() => { addToast({ type: 'status', st: 'live', msg: `${live.length} live match${live.length > 1 ? 'es' : ''} with goals!`, detail: 'Scores updating in real-time', dur: 3500 }); }, 800); }
    }
  }, [primaryFixtures, primaryLoading, addToast]);

  useEffect(() => {
    rescueToastSent.current = false; welcomeToastShown.current = false;
    setExpanded(null); setExpandedLeagues(new Set()); setSearchQ('');
    setUI(prev => ({ ...prev, rescued: false, leagueFilterOpen: false, moreDatesOpen: false, showLiveOnly: false, showAllTopMatches: false, showAllLiveMatches: false }));
  }, [selectedDate]);

  const allFixtures = useMemo(() => {
    let list = primaryFixtures.length > 0 ? primaryFixtures : backupFixtures;
    const uniqueIds = new Set();
    return list.filter(m => { const idStr = String(m.id); if (uniqueIds.has(idStr)) return false; uniqueIds.add(idStr); return true; });
  }, [primaryFixtures, backupFixtures]);

  const fixtureCompList = useMemo(() => {
    const map = new Map();
    allFixtures.forEach(m => { if (!map.has(m.leagueName)) map.set(m.leagueName, { value: m.leagueName, name: m.leagueName, emblem: m.leagueLogo }); });
    return [...map.values()].sort((a, b) => (leaguePriorityMap[a.name] ?? 99) - (leaguePriorityMap[b.name] ?? 99));
  }, [allFixtures, leaguePriorityMap]);

  const displayFixtures = useMemo(() => {
    let list = allFixtures;
    if (compFilter !== 'ALL') list = list.filter(m => String(m.leagueName) === compFilter);
    if (ui.showLiveOnly) list = list.filter(m => m.isLive);
    if (normalizedSearch) { const terms = normalizedSearch.split(/\s+/).filter(Boolean); if (terms.length) list = list.filter(m => matchQ(m, terms)); }
    return list;
  }, [allFixtures, compFilter, ui.showLiveOnly, normalizedSearch]);

  const topMatches = useMemo(() => {
    return allFixtures.filter(m => {
      const home = norm(m.homeName); const away = norm(m.awayName);
      const isTopHome = [...TOP_TEAMS_SET].some(t => home.includes(t));
      const isTopAway = [...TOP_TEAMS_SET].some(t => away.includes(t));
      return isTopHome || isTopAway;
    }).sort(sortMatches);
  }, [allFixtures]);

  const visibleTopMatches = ui.showAllTopMatches ? topMatches : topMatches.slice(0, 2);
  const hiddenTopCount = topMatches.length - 2;
  const topMatchIds = useMemo(() => new Set(topMatches.map(m => String(m.id))), [topMatches]);

  const grouped = useMemo(() => {
    const map = new Map();
    displayFixtures.forEach(m => {
      if (favs.has(String(m.id))) return; 
      if (topMatchIds.has(String(m.id))) return; 
      const key = m.leagueName || 'Other';
      if (!map.has(key)) map.set(key, { name: key, logo: m.leagueLogo, matches: [] });
      map.get(key).matches.push(m);
    });
    map.forEach(g => g.matches.sort(sortMatches));
    return [...map.values()].sort((a, b) => {
      const pA = pinnedLeagues.has(a.name) ? 0 : 1; const pB = pinnedLeagues.has(b.name) ? 0 : 1;
      if (pA !== pB) return pA - pB;
      const lA = leaguePriorityMap[a.name] ?? 99; const lB = leaguePriorityMap[b.name] ?? 99;
      if (lA !== lB) return lA - lB;
      return a.name.localeCompare(b.name);
    });
  }, [displayFixtures, favs, leaguePriorityMap, pinnedLeagues, topMatchIds]);

  const { topLeagues, otherLeagues } = useMemo(() => {
    return { topLeagues: grouped.slice(0, 5).map(g => ({...g, isTop: true})), otherLeagues: grouped.slice(5).map(g => ({...g, isTop: false})) };
  }, [grouped]);

  const toggleLeagueExpand = useCallback((leagueName) => { setExpandedLeagues(prev => { const n = new Set(prev); if (n.has(leagueName)) n.delete(leagueName); else n.add(leagueName); return n; }); }, []);

  const globalCompList = useMemo(() => (competitions || []).map(c => ({ id: String(c.id), code: c.code, name: c.name, emblem: c.emblem })).sort((a, b) => (a.name || '').localeCompare(b.name || '')), [competitions]);
  const topGlobalComps = useMemo(() => globalCompList.filter(c => TOP_5_CODES.includes(c.code)), [globalCompList]);
  const otherGlobalComps = useMemo(() => globalCompList.filter(c => !TOP_5_CODES.includes(c.code)), [globalCompList]);

  const liveCount = useMemo(() => allFixtures.filter(m => m.isLive).length, [allFixtures]);
  const favMatches = useMemo(() => displayFixtures.filter(m => favs.has(String(m.id))), [displayFixtures, favs]);

  const liveMatches = useMemo(() => {
    if (primaryFixtures.length > 0) return primaryFixtures.filter(m => m.isLive);
    return (backupLive || []).map(m => normalizeMatch(m, false)).filter(m => m.isLive);
  }, [primaryFixtures, backupLive]);
  
  const visibleLiveMatches = ui.showAllLiveMatches ? liveMatches : liveMatches.slice(0, 5);
  const hiddenLiveCount = liveMatches.length - 5;

  const { matchState, confettiKey } = useNotifications({ liveMatches, isFav, tab, addToast });

  const handleMatchToggle = useCallback((matchId) => { setExpanded(prev => prev === matchId ? null : matchId); }, []);
  const handleNavigateToMatch = useCallback((matchId) => {
    const m = displayFixtures.find(x => String(x.id) === String(matchId));
    if (m) { const slug = `${slugify(m.homeName)}-vs-${slugify(m.awayName)}`; navigate(`/match/${m.id}/${slug}`); }
  }, [displayFixtures, navigate]);

  const handleReactNow = useCallback((match) => {
    navigate('/studio/reactor', { state: { fixtureId: match.id, homeTeam: match.homeName, awayTeam: match.awayName, homeLogo: match.homeLogo, awayLogo: match.awayLogo, score: { home: match.homeScore, away: match.awayScore }, minute: match.minute, scorer: match.homeScore > match.awayScore ? match.homeName : match.awayName, competition: match.leagueName } });
  }, [navigate]);

  const handleRefresh = useCallback(async () => { await Promise.all([refreshFixtures(), fetchPrimary(selectedDate)]); }, [refreshFixtures, fetchPrimary, selectedDate]);
  const onSearchChange = useCallback((e) => { setSearchQ(e.target.value); }, []);

  const currentLeagueEmblem = useMemo(() => { if (compFilter === 'ALL') return null; return fixtureCompList.find(c => c.value === compFilter)?.emblem || null; }, [compFilter, fixtureCompList]);

  useEffect(() => { if (tab !== 'standings' || !selectedCompCode) return; let cancelled = false; const fetchS = async () => { setStandingsLoading(true); try { const res = await getStandings(selectedCompCode); if (!cancelled) setStandingsData(res); } catch (e) {} finally { if (!cancelled) setStandingsLoading(false); } }; fetchS(); return () => { cancelled = true; }; }, [tab, selectedCompCode, getStandings]);
  useEffect(() => { if (tab !== 'teams' || !selectedCompCode) return; let cancelled = false; const fetchT = async () => { setTeamsLoading(true); try { const res = await getTeams(selectedCompCode); if (!cancelled) setTeamsData(res); } catch (e) {} finally { if (!cancelled) setTeamsLoading(false); } }; fetchT(); return () => { cancelled = true; }; }, [tab, selectedCompCode, getTeams]);

  return (
    <div className="zoka-page" style={{ fontSize: `${fontScale * 16}px` }}>
      <SEO title="Football Fixtures, Live Scores & Tables | ZOKA" description="Get the latest football fixtures, live scores, league tables, and match predictions on ZOKA." keywords="football fixtures, live scores, ZOKA" path="/fixtures" robots="index,follow" />
      <Confetti active={confettiKey > 0} key={confettiKey} />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="zoka-wrap">
        <div className="zoka-hdr">
          <div className="zoka-hdr-title">
            <h1><Activity size={18} style={{ color: '#10b981' }} /> Zoka <span>Live</span></h1>
            <div className="zoka-hdr-sub">{liveCount > 0 ? `${liveCount} Live Matches` : 'Live scores · Fixtures · Standings'}</div>
          </div>
          <div className="zoka-hdr-actions">
            <button className="zoka-hdr-btn" onClick={() => setFontScale(p => Math.max(0.8, p - 0.1))} title="Decrease Font Size"><Minus size={16} /></button>
            <button className="zoka-hdr-btn" onClick={() => setFontScale(p => Math.min(1.4, p + 0.1))} title="Increase Font Size"><Plus size={16} /></button>
            <button className={`zoka-hdr-btn ${ui.soundOn ? 'active' : ''}`} onClick={() => toggleUI('soundOn')} title="Sound">{ui.soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
            <button className="zoka-hdr-btn" onClick={handleRefresh} title="Refresh"><RefreshCw size={18} className={primaryLoading || backupLoading ? 'zoka-spin' : ''} /></button>
          </div>
        </div>

        {primaryLoading && primaryFixtures.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981', padding: '8px 12px', borderRadius: '10px', fontSize: '0.75em', fontWeight: 700, marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <Loader size={14} className="zoka-spin" /> Syncing Main Fixtures...
          </div>
        )}
        <div className="zoka-stats">
          <div className="zoka-schip"><div className="val live-c">{liveCount}</div><div className="lbl">Live</div></div>
          <div className="zoka-schip"><div className="val total-c">{displayFixtures.length}</div><div className="lbl">Matches</div></div>
          <div className="zoka-schip"><div className="val fav-c">{favs.size}</div><div className="lbl">Favourites</div></div>
        </div>

        <div className="zoka-datenav">
          <button className={`zoka-nav-btn ${selectedDate === yesterdayStr() ? 'active' : ''}`} onClick={() => setSelectedDate(yesterdayStr())}>Yesterday</button>
          <button className={`zoka-nav-btn ${selectedDate === todayStr() ? 'active' : ''}`} onClick={() => setSelectedDate(todayStr())}>Today</button>
          <button className={`zoka-nav-btn ${selectedDate === tomorrowStr() ? 'active' : ''}`} onClick={() => setSelectedDate(tomorrowStr())}>Tomorrow</button>
          <div className="zoka-more-wrap" ref={moreRef}>
            <button className={`zoka-more-btn ${ui.moreDatesOpen ? 'open' : ''}`} onClick={() => toggleUI('moreDatesOpen')}><Calendar size={16} /> More <ChevronDown size={16} /></button>
            {ui.moreDatesOpen && (
              <div className="zoka-more-dropdown">
                <div className="zoka-more-label">Past Dates</div>
                {dates.past.map(d => (<button key={d.str} className={`zoka-more-item ${selectedDate === d.str ? 'active' : ''}`} onClick={() => { setSelectedDate(d.str); setUI(prev => ({ ...prev, moreDatesOpen: false })); }}>{d.label}</button>))}
                <div className="zoka-more-label" style={{ marginTop: '8px' }}>Future Dates</div>
                {dates.future.map(d => (<button key={d.str} className={`zoka-more-item ${selectedDate === d.str ? 'active' : ''}`} onClick={() => { setSelectedDate(d.str); setUI(prev => ({ ...prev, moreDatesOpen: false })); }}>{d.label}</button>))}
              </div>
            )}
          </div>
        </div>

        <div className="zoka-tabs">
          {['fixtures', 'favourites', 'standings', 'teams', 'competitions'].map(t => (
            <button key={t} className={`zoka-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="zoka-search-static">
          <Search size={18} style={{ color: '#475569', flexShrink: 0 }} />
          <input type="text" placeholder="Search teams or leagues..." value={searchQ} onChange={onSearchChange} />
          {searchQ && <button className="zoka-search-clear" onClick={() => setSearchQ('')}><X size={18} /></button>}
        </div>

        {tab === 'fixtures' && (
          <>
            {ui.rescued && (
              <div className="zoka-rescue">
                <div className="zoka-rescue-icon"><AlertTriangle size={18} /></div>
                <div>
                  <div className="zoka-rescue-title">Backup Source Active</div>
                  <div className="zoka-rescue-sub">Showing {backupFixtures.length} games from global feed</div>
                </div>
              </div>
            )}

            {topMatches.length > 0 && !searchQ && (
              <div className="zoka-section">
                <div className="zoka-league-hd">
                  <Flame size={18} style={{ color: '#fbbf24' }} />
                  <span className="zoka-league-name">Top Matches</span>
                </div>
                {visibleTopMatches.map((m, i) => <MatchCard key={`top-${m.id}-${i}`} m={m} idx={i} expanded={expanded} onToggle={handleMatchToggle} onNavigate={handleNavigateToMatch} matchState={matchState} isFav={isFav(m.id)} onFav={toggleFav} onReactNow={handleReactNow} />)}
                {hiddenTopCount > 0 && (
                  <button className="zoka-show-more" onClick={() => toggleUI('showAllTopMatches')}>
                    {ui.showAllTopMatches ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    {ui.showAllTopMatches ? 'Show less' : `Show ${hiddenTopCount} more top matches`}
                  </button>
                )}
              </div>
            )}

            {liveMatches.length > 0 && !searchQ && (
              <div className="zoka-section">
                <div className="zoka-league-hd">
                  <TrendingUp size={18} style={{ color: '#ef4444' }} />
                  <span className="zoka-league-name">Live Matches</span>
                </div>
                {visibleLiveMatches.map((m, i) => <MatchCard key={`live-${m.id}-${i}`} m={m} idx={i} expanded={expanded} onToggle={handleMatchToggle} onNavigate={handleNavigateToMatch} matchState={matchState} isFav={isFav(m.id)} onFav={toggleFav} onReactNow={handleReactNow} />)}
                {hiddenLiveCount > 0 && (
                  <button className="zoka-show-more" onClick={() => toggleUI('showAllLiveMatches')}>
                    {ui.showAllLiveMatches ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    {ui.showAllLiveMatches ? 'Show less' : `Show ${hiddenLiveCount} more live matches`}
                  </button>
                )}
              </div>
            )}

            {fixtureCompList.length > 0 && (
              <div className="zoka-filter-row">
                <button className="zoka-pill" style={{ width: '100%', justifyContent: 'space-between' }} onClick={() => toggleUI('leagueFilterOpen')}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {currentLeagueEmblem && <img src={currentLeagueEmblem} alt="" style={{ width: '16px', height: '16px' }} onError={e => { e.target.style.display = 'none'; }} />}
                    {compFilter === 'ALL' ? 'All Leagues' : compFilter}
                  </span>
                  <ChevronDown size={16} />
                </button>
                {ui.leagueFilterOpen && (
                  <div className="zoka-filter-panel" style={{ position: 'static' }}>
                    <button className={`zoka-filter-item ${compFilter === 'ALL' ? 'active' : ''}`} onClick={() => { setCompFilter('ALL'); setUI(prev => ({ ...prev, leagueFilterOpen: false })); }}>All Leagues</button>
                    {fixtureCompList.map(c => (
                      <button key={c.value} className={`zoka-filter-item ${compFilter === String(c.value) ? 'active' : ''}`} onClick={() => { setCompFilter(String(c.value)); setUI(prev => ({ ...prev, leagueFilterOpen: false })); }}>
                        {c.emblem && <img src={c.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
                {liveCount > 0 && (
                  <button className={`zoka-pill ${ui.showLiveOnly ? 'active' : ''}`} onClick={() => toggleUI('showLiveOnly')} style={{ flexShrink: 0, marginTop: '8px', justifyContent: 'center' }}>
                    {ui.showLiveOnly ? <span className="zoka-dot" style={{ background: '#ef4444' }} /> : <Activity size={14} />}
                    {ui.showLiveOnly ? 'Live Only' : 'Show Live'}
                  </button>
                )}
              </div>
            )}

            {primaryLoading && isPrimaryDate ? (
              <Skeleton count={5} />
            ) : displayFixtures.length === 0 ? (
              <div className="zoka-empty">
                <div className="zoka-empty-icon"><Calendar size={28} /></div>
                <p>No fixtures scheduled for this date.</p>
                <p className="zoka-empty-hint">Try another date or clear your search.</p>
                {searchQ && <button className="zoka-empty-action" onClick={() => setSearchQ('')}>Clear Search</button>}
              </div>
            ) : (
              <>
                {favMatches.length > 0 && (
                  <div className="zoka-section">
                    <div className="zoka-league-hd">
                      <Star size={18} className="zoka-fav-icon" />
                      <span className="zoka-league-name">Favourites</span>
                    </div>
                    {favMatches.map((m, i) => <MatchCard key={`fav-${m.id}-${i}`} m={m} idx={i} expanded={expanded} onToggle={handleMatchToggle} onNavigate={handleNavigateToMatch} matchState={matchState} isFav={isFav(m.id)} onFav={toggleFav} onReactNow={handleReactNow} />)}
                  </div>
                )}

                {topLeagues.map(group => (
                  <LeagueSection key={group.name} group={group} expanded={expanded} onToggle={handleMatchToggle} onNavigate={handleNavigateToMatch} isExpanded={expandedLeagues.has(group.name)} toggleLeagueExpand={toggleLeagueExpand} matchState={matchState} isFav={isFav} onFav={toggleFav} isPinned={pinnedLeagues.has(group.name)} onTogglePin={togglePinLeague} onReactNow={handleReactNow} />
                ))}

                {otherLeagues.length > 0 && !ui.leagueFilterOpen && (
                  <button className="zoka-show-more" onClick={() => toggleUI('leagueFilterOpen')} style={{ marginTop: '8px' }}>
                    <ChevronDown size={16} /> Show {otherLeagues.length} more leagues
                  </button>
                )}

                {(ui.leagueFilterOpen || compFilter !== 'ALL') && otherLeagues.map(group => (
                  <LeagueSection key={group.name} group={group} expanded={expanded} onToggle={handleMatchToggle} onNavigate={handleNavigateToMatch} isExpanded={expandedLeagues.has(group.name)} toggleLeagueExpand={toggleLeagueExpand} matchState={matchState} isFav={isFav} onFav={toggleFav} isPinned={pinnedLeagues.has(group.name)} onTogglePin={togglePinLeague} onReactNow={handleReactNow} />
                ))}

                <div className="zoka-seo-links">
                  <h3>Today's Match Links</h3>
                  {displayFixtures.slice(0, 50).map(m => {
                    const slug = `${slugify(m.homeName)}-vs-${slugify(m.awayName)}`;
                    return (
                      <Link key={m.id} to={`/match/${m.id}/${slug}`} className="zoka-seo-link" rel="bookmark">
                        {m.homeName} vs {m.awayName}
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {tab === 'favourites' && (
          <>
            {favMatches.length > 0 ? (
              <div className="zoka-section">
                <div className="zoka-league-hd">
                  <Star size={18} className="zoka-fav-icon" />
                  <span className="zoka-league-name">Favourites ({favMatches.length})</span>
                </div>
                {favMatches.map((m, i) => <MatchCard key={`fav-tab-${m.id}-${i}`} m={m} idx={i} expanded={expanded} onToggle={handleMatchToggle} onNavigate={handleNavigateToMatch} matchState={matchState} isFav={isFav(m.id)} onFav={toggleFav} onReactNow={handleReactNow} />)}
              </div>
            ) : (
              <div className="zoka-empty">
                <div className="zoka-empty-icon"><Star size={28} /></div>
                <p>No favourite matches found for this date</p>
                <p className="zoka-empty-hint">Tap the star icon on any match to add it here.</p>
              </div>
            )}
          </>
        )}

        {tab === 'standings' && (
          <CompetitionSelector selectedCompCode={selectedCompCode} onSelect={setSelectedCompCode} topGlobalComps={topGlobalComps} otherGlobalComps={otherGlobalComps} />
        )}

        {tab === 'teams' && (
          <CompetitionSelector selectedCompCode={selectedCompCode} onSelect={setSelectedCompCode} topGlobalComps={topGlobalComps} otherGlobalComps={otherGlobalComps} />
        )}

        {tab === 'competitions' && (
          <div className="zoka-teams-grid">
            {globalCompList.map(c => <CompCard key={c.id} c={c} />)}
          </div>
        )}
      </div>
    </div>
  );
}