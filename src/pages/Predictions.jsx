import React, { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue, memo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Clock, CheckCircle2, TrendingUp, Target, BarChart3,
  Star, Save, Trophy, Lock, LogIn, ChevronDown, ChevronRight,
  ChevronUp, ChevronLeft, Minus, X, ArrowRight, ArrowLeft,
  Plus, CircleX, CircleCheck, ThumbsUp, ThumbsDown,
  Pencil, Share2, Zap, RefreshCw, Dice5
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useActivePredictions, useUserPredictions, useDailyLeaderboard, useZokaPicks, useZokaVotes, useUserPoints } from '../hooks/useUserData';
import { useFixtures } from '../hooks/useFixtures';
import { todayStr, getLocalDateStr } from '../utils/dates';
import { calcPoints, SPORT, isLiveStatus, isFinishedStatus, PATHS } from '../utils/constants';
import { savePrediction as savePredictionAction, saveZokaVote, removeZokaVote } from '../services/predictions';
import { db } from '../utils/firebase';
import { doc, setDoc, serverTimestamp, getDocs, collection, query, where } from 'firebase/firestore';

import SEO from '../components/SEO';
import AdSlot from '../components/AdSlot'; // ★ NEW IMPORT
import { useToast } from '../core/ToastManager';
import { mergeLiveIntoPredictions, calculateUserStats } from '../engine/predictionEngine';
import { buildTeamRoute, buildLeagueRoute, buildMatchRoute } from '../utils/routes';
import EmptyState from '../components/EmptyState';

const FUTURE_DAYS = 3;
const LOCK_BEFORE_MINUTES = 60;
const ZOKA_VISIBLE_COUNT = 5;
const SMOOTH = 'cubic-bezier(0.22, 1, 0.36, 1)';
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

const ZOKA_JOKES = [
  "Why did the football coach go to the bank? To get his quarterback! 🏦",
  "Why don't football stadiums ever get hot? Because there are too many fans! 🥶",
  "Why did the football team go to the library? To check out some books... and score some points! 📚",
  "I used to play football, but I was always offside with my coach. 🚩",
  "Why do football players make great comedians? They always have good delivery! 🎭",
  "Prediction is difficult, especially when it's about the future. But we'll try anyway! 🔮",
  "What do you call a football player who loses all his matches? A los-er. Let's win instead! 🏆",
  "Why was the football pitch always wet? Because the players kept dribbling! 💧"
];
const getJoke = () => ZOKA_JOKES[Math.floor(Math.random() * ZOKA_JOKES.length)];

const dateOffset = (offset = 0) => getLocalDateStr(offset);

const dateLabel = (d) => {
  if (!d) return '';
  const t = todayStr(), tm = getLocalDateStr(1), ys = getLocalDateStr(-1);
  if (d === t) return 'Today';
  if (d === tm) return 'Tomorrow';
  if (d === ys) return 'Yesterday';
  try {
    const dt = new Date(d + 'T12:00:00');
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch { return d; }
};

const dateDayName = (d) => {
  if (!d) return '';
  try {
    const dt = new Date(d + 'T12:00:00');
    if (isNaN(dt.getTime())) return '';
    return ['S','M','T','W','T','F','S'][dt.getDay()];
  } catch { return ''; }
};

const dateDayNum = (d) => d ? d.slice(8) : '';
const dateMonth = (d) => d ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(d.slice(5,7)) - 1] : '';

const QUICK_PICKS = [
  { h: 1, a: 0 }, { h: 2, a: 1 }, { h: 0, a: 0 }, { h: 1, a: 1 },
  { h: 2, a: 0 }, { h: 0, a: 1 }, { h: 3, a: 1 }, { h: 1, a: 2 },
];

function isMatchLocked(pred, now) {
  if (isFinishedStatus(pred.status, SPORT.FOOTBALL)) return { locked: true, reason: 'finished' };
  if (isLiveStatus(pred.status, SPORT.FOOTBALL) || pred.isLive) return { locked: true, reason: 'live' };
  
  const kickoffStr = pred.kickoffUtc || pred.utcDate || pred.date;
  if (kickoffStr) {
    if (/^\d{4}-\d{2}-\d{2}/.test(kickoffStr)) {
      const kickoffTime = new Date(kickoffStr);
      if (!isNaN(kickoffTime.getTime())) {
        const diffMs = kickoffTime.getTime() - (now || Date.now());
        const diffMins = diffMs / 60000;
        if (diffMins <= LOCK_BEFORE_MINUTES) {
          return { locked: true, reason: diffMins <= 0 ? 'started' : 'closing', minutesLeft: Math.floor(diffMins) };
        }
        return { locked: false, minutesLeft: Math.floor(diffMins) };
      }
    }
  }
  return { locked: false };
}

function formatMinutesLeft(mins) {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}m`;
}

function parseKickoffTime(kickoff) {
  if (!kickoff) return '--:--';
  if (typeof kickoff === 'string' && /^\d{2}:\d{2}$/.test(kickoff)) return kickoff;
  try {
    const d = new Date(kickoff);
    if (isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

const modalStyle = { background: 'var(--bg-glass-strong)', border: '1.5px solid var(--glass-border)', borderRadius: 'var(--r-16)', padding: '24px 20px', maxWidth: 340, width: '100%', textAlign: 'center', animation: `zk-pop .3s ${SPRING} both` };

const AnimNum = memo(function AnimNum({ value, duration = 400, delay = 0 }) {
  const [d, setD] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    const t = typeof value === 'number' ? value : 0;
    if (t === 0) { setD(0); return; }
    const start = performance.now() + delay;
    const run = (now) => {
      if (now < start) { raf.current = requestAnimationFrame(run); return; }
      const p = Math.min((now - start) / duration, 1);
      setD(Math.round((1 - Math.pow(1 - p, 3)) * t));
      if (p < 1) raf.current = requestAnimationFrame(run);
    };
    raf.current = requestAnimationFrame(run);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, duration, delay]);
  return <>{d}</>;
});

const Skeleton = memo(function Skeleton() { return <div className="skeleton" style={{ height: 100, borderRadius: 'var(--r-12)', marginBottom: 'var(--sp-8)' }} />; });

const ResultBadge = memo(function ResultBadge({ result, isCalculating }) {
  if (isCalculating) return <span className="v21-bdg pn"><Clock size={8} /> Calc...</span>;
  if (!result || result.resultType === 'pending') return <span className="v21-bdg pn"><Clock size={8} /> Pending</span>;
  if (result.resultType === 'exact') return <span className="v21-bdg ex"><CheckCircle2 size={8} /> Hit +{result.points || 10}</span>;
  if (result.resultType === 'result') return <span className="v21-bdg rs"><TrendingUp size={8} /> Won +{result.points || 3}</span>;
  return <span className="v21-bdg ms"><CircleX size={8} /> Missed</span>;
});

const LoginModal = memo(function LoginModal({ onClose, nav }) {
  return (
    <div onClick={onClose} className="v21-overlay" style={{ zIndex: 9999, alignItems: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={modalStyle}>
        <div style={{ width: 48, height: 48, borderRadius: 'var(--r-12)', background: 'rgba(var(--primary-rgb),.08)', border: '1.5px solid rgba(var(--primary-rgb),.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: 'var(--primary)' }}><LogIn size={22} /></div>
        <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: 6 }}>Login Required</div>
        <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.5 }}>Sign in to make predictions and compete on the leaderboard.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} className="v21-b v21-bgh" style={{ flex: 1, minHeight: 44 }}>Cancel</button>
          <button onClick={() => { onClose(); nav('/login'); }} className="v21-b v21-bp" style={{ flex: 1, minHeight: 44 }}>Log In</button>
        </div>
      </div>
    </div>
  );
});

const DateStrip = memo(function DateStrip({ date, onChange, dates, hasDataMap }) {
  const stripRef = useRef(null);
  const today = todayStr();
  const [expanded, setExpanded] = useState(false);

  const visibleDates = useMemo(() => {
    if (expanded) return dates;
    const todayIdx = dates.indexOf(today);
    const start = Math.max(0, todayIdx - 1);
    return dates.slice(start, start + 8);
  }, [dates, expanded, today]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    requestAnimationFrame(() => {
      const el = strip.querySelector(`[data-date="${date}"]`);
      if (el) {
        const stripRect = strip.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const offset = elRect.left - stripRect.left - stripRect.width / 2 + elRect.width / 2;
        strip.scrollBy({ left: offset, behavior: 'smooth' });
      }
    });
  }, [date]);

  return (
    <div className="v21-ds" ref={stripRef}>
      {visibleDates.map(d => {
        const isToday = d === today;
        const isPast = d < today;
        const isActive = d === date;
        const hasData = hasDataMap?.[d];
        return (
          <button key={d} data-date={d} className={`v21-dc${isActive ? ' on' : ''}${isToday ? ' today' : ''}${isPast && !isActive ? ' past' : ''}`} onClick={() => onChange(d)}>
            <span className="dn">{dateDayName(d)}</span>
            <span className="dd">{dateDayNum(d)}</span>
            <span className="dm">{dateMonth(d)}</span>
            {hasData && !isActive && <span style={{ position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: '50%', background: 'var(--primary)', opacity: .5 }} />}
          </button>
        );
      })}
      {!expanded && dates.length > 8 && (
        <button className="v21-dmore" onClick={() => setExpanded(true)}><ChevronRight size={10} /> More</button>
      )}
      {expanded && (
        <button className="v21-dmore" onClick={() => setExpanded(false)}><ChevronLeft size={10} /> Less</button>
      )}
    </div>
  );
});

const ScoreStepper = memo(function ScoreStepper({ value, onChange }) {
  const num = value === '' || value == null ? null : parseInt(value, 10);
  const display = num != null && !isNaN(num) ? num : '';
  return (
    <div className="v21-si-wrap" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <button className="v21-step" onClick={() => onChange(String(Math.max(0, (num || 0) - 1)))}><Minus size={12} /></button>
      <input className="v21-si" value={display} onChange={e => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="?" maxLength={2} style={{ width: '32px', textAlign: 'center', background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 'var(--r-8)', color: 'var(--text-primary)', fontWeight: 800, fontSize: 'var(--fs-md)' }} />
      <button className="v21-step" onClick={() => onChange(String(Math.min(99, (num || 0) + 1)))}><Plus size={12} /></button>
    </div>
  );
});

const ZokaPickCard = memo(function ZokaPickCard({ pick, index, voteStats, userVote, onVote, votingId, onShare }) {
  const isFin = isFinishedStatus(pick.status, SPORT.FOOTBALL) || pick.isFinished;
  const isLive = isLiveStatus(pick.status, SPORT.FOOTBALL) || pick.isLive;
  const mid = String(pick.matchId);

  const res = useMemo(() => {
    if (pick.adminPick && isFin && pick.homeScore != null) {
      const r = calcPoints(pick.adminPick.home, pick.adminPick.away, pick.homeScore, pick.awayScore);
      return { ...r, resultType: r.type };
    }
    return null;
  }, [pick.adminPick, isFin, pick.homeScore, pick.awayScore]);

  const vs = voteStats?.[mid] || { agree: 0, disagree: 0, total: 0 };
  const myV = userVote?.[mid];
  const isVoting = votingId === mid;

  const homeLogo = pick.homeLogo || pick.homeTeam?.logo || pick.homeTeam?.crest;
  const awayLogo = pick.awayLogo || pick.awayTeam?.logo || pick.awayTeam?.crest;
  const kickoff = parseKickoffTime(pick.kickoff || pick.date);
  const homeName = typeof pick.homeTeam === 'object' ? (pick.homeTeam?.shortName || pick.homeTeam?.name || 'Home') : (pick.homeTeam || 'Home');
  const awayName = typeof pick.awayTeam === 'object' ? (pick.awayTeam?.shortName || pick.awayTeam?.name || 'Away') : (pick.awayTeam || 'Away');
  
  const leagueName = pick.league?.name || 'Zoka Pick';
  const matchLink = buildMatchRoute(mid, homeName, awayName);

  let leftColor = 'rgba(var(--gold-rgb),.12)';
  if (res?.resultType === 'exact') leftColor = 'var(--primary)';
  else if (res?.resultType === 'result') leftColor = 'var(--gold)';
  else if (res?.resultType === 'miss') leftColor = 'var(--danger)';
  else if (isFin) leftColor = 'rgba(var(--primary-rgb),.2)';

  const cardCls = `v21-mc zoka${!isFin && !isLive ? ' pending' : ''}${isLive ? ' live' : ''}${isFin ? ' finished' : ''}`;

  return (
    <div className={cardCls} style={{ borderLeft: `3px solid ${leftColor}`, animationDelay: `${index * 30}ms` }}>
      <Link to={matchLink} className="v21-card-link-area" style={{textDecoration:'none', color:'inherit'}}>
        <div className="v21-mh">
          <div className="v21-ml">
            {pick.league?.emblem && <img src={pick.league.emblem} alt={`${leagueName} logo`} width="14" height="14" loading="lazy" style={{objectFit:'contain'}} onError={e => { e.target.style.display = 'none'; }} />}
            <span>{leagueName}</span>
          </div>
          <span className="v21-st" style={{ color: isFin ? 'var(--primary)' : isLive ? 'var(--danger)' : 'var(--text-muted)', background: isFin ? 'rgba(var(--primary-rgb),.08)' : isLive ? 'rgba(var(--danger-rgb),.1)' : 'var(--bg-elevated)' }}>
            {isFin ? 'FT' : isLive ? (pick.minute || 'LIVE') : kickoff}
          </span>
        </div>
        <div className="v21-tm">
          <div className="v21-te">
            {homeLogo && <img src={homeLogo} alt={`${homeName} logo`} width="24" height="24" loading="lazy" style={{objectFit:'contain'}} onError={e => { e.target.style.display = 'none'; }} />}
            <span>{homeName}</span>
          </div>
          {isFin && pick.homeScore != null ? (
            <div className="v21-sb ft">
              <span className="v21-sn" style={{ color: 'var(--primary)' }}>{pick.homeScore}</span>
              <span className="v21-sp">–</span>
              <span className="v21-sn" style={{ color: 'var(--primary)' }}>{pick.awayScore}</span>
            </div>
          ) : isLive && pick.homeScore != null ? (
            <div className="v21-sb live">
              <span className="v21-sn" style={{ color: 'var(--danger)' }}>{pick.homeScore}</span>
              <span className="v21-sp">–</span>
              <span className="v21-sn" style={{ color: 'var(--danger)' }}>{pick.awayScore}</span>
            </div>
          ) : (
            <div className="v21-sb">
              <span className="v21-sn" style={{ color: 'var(--gold)' }}>{pick.adminPick?.home ?? '?'}</span>
              <span className="v21-sp">–</span>
              <span className="v21-sn" style={{ color: 'var(--gold)' }}>{pick.adminPick?.away ?? '?'}</span>
            </div>
          )}
          <div className="v21-te aw">
            {awayLogo && <img src={awayLogo} alt={`${awayName} logo`} width="24" height="24" loading="lazy" style={{objectFit:'contain'}} onError={e => { e.target.style.display = 'none'; }} />}
            <span>{awayName}</span>
          </div>
        </div>
      </Link>

      <div className="v21-ma" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'space-between', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 120 }}>
          {isFin && res && res.resultType !== 'pending' && <ResultBadge result={res} />}
          {isFin && (!res || res.resultType === 'pending') && <span className="v21-bdg pn"><Clock size={8} /> Calc...</span>}
          {!isFin && !isLive && vs.total > 0 && (
            <>
              <button className={`v21-vote${myV === 'agree' ? ' agree-on' : ''}`} onClick={() => onVote(mid, 'agree')} disabled={isVoting}>
                <ThumbsUp size={11} /> {vs.agree || 0}
              </button>
              <div className="v21-vote-bar" style={{ width: '60px', height: '4px', background: 'var(--bg-elevated)', borderRadius: '2px', overflow: 'hidden' }}>
                <div className="v21-vote-fill" style={{ width: `${vs.total > 0 ? Math.round((vs.agree / vs.total) * 100) : 0}%` }} />
              </div>
              <button className={`v21-vote${myV === 'disagree' ? ' disagree-on' : ''}`} onClick={() => onVote(mid, 'disagree')} disabled={isVoting}>
                <ThumbsDown size={11} /> {vs.disagree || 0}
              </button>
            </>
          )}
        </div>
        <button className="v21-b v21-bshare v21-bsm" onClick={() => onShare(pick, true)}>
          <Share2 size={10} /> Share
        </button>
      </div>
    </div>
  );
});

const PredCard = memo(function PredCard({ pred, index, userPred, result, isEditing, editH, editA, onEdit, onSave, onCancel, onQuickPick, onEditH, onEditA, loggedIn, onLogin, saving, now, onShare, zokaPick = null, communityStats = {} }) {
  const mid = String(pred.matchId);
  const isFin = isFinishedStatus(pred.status, SPORT.FOOTBALL) || pred.isFinished;
  const isLive = isLiveStatus(pred.status, SPORT.FOOTBALL) || pred.isLive;
  const hasPred = !!userPred;

  const localResult = useMemo(() => {
    if (isFin && hasPred && pred.homeScore != null) {
      const r = calcPoints(userPred.homeScore, userPred.awayScore, pred.homeScore, pred.awayScore);
      return { ...r, resultType: r.type };
    }
    return null;
  }, [isFin, hasPred, pred.homeScore, pred.awayScore, userPred]);

  const effectiveResult = result || localResult;
  const isResolved = !!effectiveResult && effectiveResult.resultType !== 'pending';

  const lockInfo = isMatchLocked(pred, now);
  const isLocked = lockInfo.locked;

  const homeLogo = pred.homeLogo || pred.homeTeam?.logo || pred.homeTeam?.crest;
  const awayLogo = pred.awayLogo || pred.awayTeam?.logo || pred.awayTeam?.crest;
  const homeName = typeof pred.homeTeam === 'object' ? (pred.homeTeam?.shortName || pred.homeTeam?.name || 'Home') : (pred.homeTeam || 'Home');
  const awayName = typeof pred.awayTeam === 'object' ? (pred.awayTeam?.shortName || pred.awayTeam?.name || 'Away') : (pred.awayTeam || 'Away');
  const kickoff = parseKickoffTime(pred.kickoff || pred.date);
  
  const leagueName = pred.league?.name || 'Match';
  const matchLink = buildMatchRoute(mid, homeName, awayName);

  const zokaHome = zokaPick?.adminPick?.home;
  const zokaAway = zokaPick?.adminPick?.away;
  const beatZoka = isFin && hasPred && zokaHome != null ? 
    (calcPoints(userPred.homeScore, userPred.awayScore, pred.homeScore, pred.awayScore).points > 
     calcPoints(zokaHome, zokaAway, pred.homeScore, pred.awayScore).points) : false;

  const totalVotes = (communityStats?.home || 0) + (communityStats?.draw || 0) + (communityStats?.away || 0);
  const homePct = totalVotes > 0 ? Math.round(((communityStats?.home || 0) / totalVotes) * 100) : 0;
  const drawPct = totalVotes > 0 ? Math.round(((communityStats?.draw || 0) / totalVotes) * 100) : 0;
  const awayPct = totalVotes > 0 ? Math.round(((communityStats?.away || 0) / totalVotes) * 100) : 0;

  let leftColor = 'var(--bg-elevated)';
  if (isResolved && effectiveResult?.resultType === 'exact') leftColor = 'var(--primary)';
  else if (isResolved && effectiveResult?.resultType === 'result') leftColor = 'var(--gold)';
  else if (isResolved && effectiveResult?.resultType === 'miss') leftColor = 'var(--danger)';
  else if (isFin) leftColor = 'rgba(var(--primary-rgb),.2)';
  else if (isLive) leftColor = 'rgba(var(--danger-rgb),.3)';
  else if (hasPred) leftColor = 'var(--accent)';
  else if (lockInfo.minutesLeft != null && lockInfo.minutesLeft <= 90) leftColor = 'rgba(var(--gold-rgb),.3)';

  let cardCls = 'v21-mc';
  if (isEditing) cardCls += ' editing';
  else if (isLive) cardCls += ' live';
  else if (isFin) cardCls += ' finished';
  else if (isLocked && !hasPred) cardCls += ' locked';
  else if (isFin && !hasPred) cardCls += ' missed';

  let statusLabel = kickoff;
  let statusColor = 'var(--text-muted)';
  let statusBg = 'var(--bg-elevated)';
  if (isEditing) { statusLabel = 'EDITING'; statusColor = 'var(--primary)'; statusBg = 'rgba(var(--primary-rgb),.08)'; }
  else if (isLive) { statusLabel = pred.minute != null ? `${pred.minute}'` : 'LIVE'; statusColor = 'var(--danger)'; statusBg = 'rgba(var(--danger-rgb),.1)'; }
  else if (isFin) { statusLabel = 'FT'; statusColor = 'var(--primary)'; statusBg = 'rgba(var(--primary-rgb),.08)'; }
  else if (lockInfo.minutesLeft != null && lockInfo.minutesLeft <= 60) { statusColor = 'var(--warning)'; statusBg = 'rgba(var(--gold-rgb),.08)'; }

  return (
    <div className={cardCls} style={{ borderLeft: `3px solid ${leftColor}`, animationDelay: `${index * 20}ms` }}>
      <Link to={matchLink} className="v21-card-link-area" style={{textDecoration:'none', color:'inherit'}}>
        <div className="v21-mh">
          <div className="v21-ml">
            {pred.league?.emblem && <img src={pred.league.emblem} alt={`${leagueName} logo`} width="14" height="14" loading="lazy" style={{objectFit:'contain'}} onError={e => { e.target.style.display = 'none'; }} />}
            <span>{leagueName}</span>
          </div>
          <span className="v21-st" style={{ color: statusColor, background: statusBg }}>{statusLabel}</span>
        </div>
        <div className="v21-tm">
          <div className="v21-te">
            {homeLogo && <img src={homeLogo} alt={`${homeName} logo`} width="24" height="24" loading="lazy" style={{objectFit:'contain'}} onError={e => { e.target.style.display = 'none'; }} />}
            <span>{homeName}</span>
          </div>
          {isEditing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} onClick={e => e.preventDefault()}>
              <ScoreStepper value={editH} onChange={onEditH} />
              <span style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: '.7rem', opacity: .3 }}>–</span>
              <ScoreStepper value={editA} onChange={onEditA} />
            </div>
          ) : hasPred ? (
            <div className={`v21-sb${isFin ? ' ft' : ''}`} style={!isFin ? { borderColor: 'rgba(var(--accent-rgb),.2)', background: 'rgba(var(--accent-rgb),.05)' } : {}}>
              <span className="v21-sn" style={{ color: isFin ? 'var(--primary)' : 'var(--accent)' }}>{userPred.homeScore}</span>
              <span className="v21-sp">–</span>
              <span className="v21-sn" style={{ color: isFin ? 'var(--primary)' : 'var(--accent)' }}>{userPred.awayScore}</span>
            </div>
          ) : isFin && pred.homeScore != null ? (
            <div className="v21-sb ft">
              <span className="v21-sn" style={{ color: 'var(--primary)' }}>{pred.homeScore}</span>
              <span className="v21-sp">–</span>
              <span className="v21-sn" style={{ color: 'var(--primary)' }}>{pred.awayScore}</span>
            </div>
          ) : (
            <div className="v21-sb"><span className="v21-vs">VS</span></div>
          )}
          <div className="v21-te aw">
            {awayLogo && <img src={awayLogo} alt={`${awayName} logo`} width="24" height="24" loading="lazy" style={{objectFit:'contain'}} onError={e => { e.target.style.display = 'none'; }} />}
            <span>{awayName}</span>
          </div>
        </div>

        {!isEditing && totalVotes > 0 && (
          <div className="v21-benchmark-row" style={{ display: 'flex', gap: '10px', marginTop: '12px', padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--r-8)' }}>
            <div style={{ flex: 1.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Community ({totalVotes} players)</span>
              </div>
              <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', background: 'var(--bg-deep)' }}>
                <div style={{ width: `${homePct}%`, background: 'var(--primary)', transition: 'width 0.5s ease' }} title={`${homePct}% Home`} />
                <div style={{ width: `${drawPct}%`, background: 'var(--text-muted)', transition: 'width 0.5s ease' }} title={`${drawPct}% Draw`} />
                <div style={{ width: `${awayPct}%`, background: 'var(--danger)', transition: 'width 0.5s ease' }} title={`${awayPct}% Away`} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px', fontWeight: 600 }}>
                <span style={{ color: 'var(--primary)' }}>{homePct}% Home</span>
                <span>{drawPct}% Draw</span>
                <span style={{ color: 'var(--danger)' }}>{awayPct}% Away</span>
              </div>
            </div>
            {zokaPick && (
              <div style={{ flex: 1, borderLeft: '1px solid var(--border)', paddingLeft: '10px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                  <Star size={10} style={{ color: 'var(--gold)' }} />
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ZokaPick</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 900, color: beatZoka ? 'var(--primary)' : 'var(--text-primary)' }}>
                    {zokaHome} - {zokaAway}
                  </span>
                  {beatZoka && <span style={{ fontSize: '0.6rem', background: 'var(--primary)', color: 'var(--text-inverse)', padding: '1px 4px', borderRadius: '4px', fontWeight: 800 }}>BEAT!</span>}
                </div>
              </div>
            )}
          </div>
        )}
      </Link>

      <div className="v21-ma" style={{ gap: '6px', flexWrap: 'wrap', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
        {isEditing && (
          <div className="v21-qp" style={{ width: '100%', display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {QUICK_PICKS.map((qp, qi) => (
              <button key={qi} className={`v21-qp-btn${editH === String(qp.h) && editA === String(qp.a) ? ' sel' : ''}`} onClick={() => onQuickPick(qp.h, qp.a)}>{qp.h}–{qp.a}</button>
            ))}
            <button className="v21-qp-btn surprise" onClick={() => onQuickPick(Math.floor(Math.random()*4), Math.floor(Math.random()*4))}>
              <Dice5 size={12} /> Surprise
            </button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', width: '100%', justifyContent: 'flex-end' }}>
          {isEditing ? (
            <>
              <button className="v21-b v21-bp v21-bsm" onClick={() => onSave(pred)} disabled={saving || !editH || !editA}><Save size={10} /> Save</button>
              <button className="v21-b v21-bgh v21-bsm" onClick={onCancel}><X size={10} /> Cancel</button>
            </>
          ) : isResolved ? (
            <>
              <ResultBadge result={effectiveResult} />
              <button className="v21-b v21-bshare v21-bsm" onClick={() => onShare(pred, false)}><Share2 size={10} /> Share</button>
            </>
          ) : isFin && !hasPred ? (
            <span className="v21-bdg ms"><CircleX size={8} /> Missed</span>
          ) : isLocked && !isFin ? (
            <span className="v21-bdg pn"><Lock size={8} /> {lockInfo.reason === 'live' ? 'Live' : lockInfo.reason === 'closing' ? `${formatMinutesLeft(lockInfo.minutesLeft)} left` : 'Started'}</span>
          ) : hasPred ? (
            <>
              <span className="v21-bdg bl"><CheckCircle2 size={8} /> Saved</span>
              {!isLocked && <button className="v21-b v21-bbl v21-bsm" onClick={() => onEdit(pred)}><Pencil size={9} /> Edit</button>}
              <button className="v21-b v21-bshare v21-bsm" onClick={() => onShare(pred, false)}><Share2 size={10} /> Share</button>
            </>
          ) : lockInfo.minutesLeft != null && lockInfo.minutesLeft <= 90 ? (
            <span className="v21-lock-timer"><Clock size={9} /> {formatMinutesLeft(lockInfo.minutesLeft)}</span>
          ) : loggedIn ? (
            <button className="v21-b v21-bp v21-bsm" onClick={() => onEdit(pred)}><Target size={10} /> Predict</button>
          ) : (
            <button className="v21-b v21-bgh v21-bsm" onClick={onLogin}><LogIn size={10} /> Login</button>
          )}
        </div>
      </div>
    </div>
  );
});

const ResultsOverlay = memo(function ResultsOverlay({ date, preds = [], userPredsObj, results, onClose, nav }) {
  const overlayBoxRef = useRef(null);
  useEffect(() => { if (overlayBoxRef.current) overlayBoxRef.current.scrollTop = 0; }, []);

  const upMap = useMemo(() => {
    const m = new Map();
    Object.values(userPredsObj || {}).forEach(p => {
      if (p.predId) m.set(p.predId, p);
      if (p.matchId) m.set(String(p.matchId), p);
    });
    return m;
  }, [userPredsObj]);

  const resMap = useMemo(() => {
    const m = new Map();
    (results || []).forEach(r => m.set(String(r.matchId), r));
    return m;
  }, [results]);

  const stats = useMemo(() => {
    let totalPts = 0, exact = 0, result = 0, miss = 0, pending = 0, predicted = 0;
    const safePreds = preds || [];
    safePreds.forEach(p => {
      const up = upMap.get(String(p.matchId));
      if (!up) return;
      predicted++;
      let res = resMap.get(String(p.matchId));
      if ((!res || res.resultType === 'pending') && (isFinishedStatus(p.status, SPORT.FOOTBALL) || p.isFinished) && p.homeScore != null) {
        const r = calcPoints(up.homeScore, up.awayScore, p.homeScore, p.awayScore);
        res = { ...r, resultType: r.type };
      }
      if (!res || res.resultType === 'pending') { pending++; return; }
      if (res.resultType === 'exact') { exact++; totalPts += (res.points || 10); }
      else if (res.resultType === 'result') { result++; totalPts += (res.points || 3); }
      else miss++;
    });
    return { totalPts, exact, result, miss, pending, predicted, allResolved: predicted > 0 && pending === 0, accuracy: predicted > 0 ? Math.round(((exact + result) / predicted) * 100) : 0 };
  }, [preds, upMap, resMap]);

  return (
    <div className="v21-overlay" onClick={onClose}>
      <div className="v21-overlay-box" ref={overlayBoxRef} onClick={e => e.stopPropagation()}>
        <div className="v21-overlay-handle" />
        <div style={{ padding: '16px 18px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: '.95rem', fontWeight: 900, color: 'var(--text-primary)' }}>My Results</div>
              <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>{dateLabel(date)}</div>
            </div>
            <button className="v21-b v21-bgh v21-bsm" onClick={onClose}><X size={14} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5, marginBottom: 12 }}>
            <div className="v21-stat"><div className="n" style={{ color: 'var(--accent)' }}><AnimNum value={stats.totalPts} /></div><div className="l">Points</div></div>
            <div className="v21-stat"><div className="n" style={{ color: 'var(--primary)' }}><AnimNum value={stats.exact} /></div><div className="l">Exact</div></div>
            <div className="v21-stat"><div className="n" style={{ color: 'var(--gold)' }}><AnimNum value={stats.result} /></div><div className="l">Result</div></div>
          </div>
          {stats.predicted > 0 && (
            <div className="v21-progress" style={{ marginBottom: 12 }}>
              <div className="v21-progress-bar"><div className="v21-progress-fill" style={{ width: `${((stats.predicted - stats.pending) / stats.predicted) * 100}%`, background: stats.allResolved ? 'var(--primary)' : 'linear-gradient(90deg,var(--primary),var(--primary-dim))' }} /></div>
              <div className="v21-progress-labels"><span>{stats.predicted} predicted</span><span>{stats.allResolved ? '✓ Complete' : `${stats.pending} pending`}</span></div>
            </div>
          )}
          {(preds || []).map((p, i) => {
            const up = upMap.get(String(p.matchId));
            if (!up) return null;
            let res = resMap.get(String(p.matchId));
            if ((!res || res.resultType === 'pending') && (isFinishedStatus(p.status, SPORT.FOOTBALL) || p.isFinished) && p.homeScore != null) {
              const r = calcPoints(up.homeScore, up.awayScore, p.homeScore, p.awayScore);
              res = { ...r, resultType: r.type };
            }
            const rType = res?.resultType;
            const matchLink = buildMatchRoute(p.matchId, p.homeTeam?.name || 'Home', p.awayTeam?.name || 'Away');
            return (
              <Link to={matchLink} key={p.id || i} className="v21-res-row" style={{ animationDelay: `${i * 20}ms`, borderLeft: rType === 'exact' ? '3px solid var(--primary)' : rType === 'result' ? '3px solid var(--gold)' : rType === 'miss' ? '3px solid var(--danger)' : '3px solid var(--border)', textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 'var(--sp-8)', padding: 'var(--sp-12)', borderRadius: 'var(--r-8)', background: 'var(--bg-card)', marginBottom: 'var(--sp-8)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {typeof p.homeTeam === 'object' ? (p.homeTeam?.shortName || p.homeTeam?.name || 'Home') : (p.homeTeam || 'Home')} vs {typeof p.awayTeam === 'object' ? (p.awayTeam?.shortName || p.awayTeam?.name || 'Away') : (p.awayTeam || 'Away')}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--accent)', fontSize: '.78rem', background: 'rgba(var(--accent-rgb),.06)', padding: '2px 6px', borderRadius: 5 }}>{up.homeScore}-{up.awayScore}</span>
                  {rType && rType !== 'pending' && <span className={`v21-bdg ${rType === 'exact' ? 'ex' : rType === 'result' ? 'rs' : 'ms'}`}>+{res.points || 0}</span>}
                </div>
              </Link>
            );
          })}
          {stats.predicted === 0 && (
            <EmptyState icon={Target} title="No predictions for this day" />
          )}
          {stats.allResolved && (
            <div className="v21-rank" style={{ marginTop: 14, textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-12)', padding: 'var(--sp-12)' }}>
              <Trophy size={22} style={{ color: 'var(--primary)', marginBottom: 6, margin: '0 auto 6px' }} />
              <div style={{ fontSize: '.88rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: 3 }}>All Results In!</div>
              <div style={{ fontSize: '.76rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 12 }}>You scored <strong style={{ color: 'var(--accent)' }}>{stats.totalPts} pts</strong> · {stats.accuracy}% accuracy</div>
              <button className="v21-b v21-bp" onClick={() => { onClose(); nav('/leaderboard'); }}>View Leaderboard <ArrowRight size={13} /></button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default function Predictions() {
  const { currentUser, userProfile } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const toast = useToast();
  
  const uid = currentUser?.uid;
  const loggedIn = !!uid;
  const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Anonymous';
  const isAdmin = userProfile?.role === 'admin';

  const [selDate, setSelDate] = useState(todayStr());
  const [now, setNow] = useState(Date.now());
  const [copyToast, setCopyToast] = useState(false);
  const [filter, setFilter] = useState('all');
  const [showLogin, setShowLogin] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [zokaExpanded, setZokaExpanded] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editH, setEditH] = useState('');
  const [editA, setEditA] = useState('');
  const [saving, setSaving] = useState(false);
  const [votingId, setVotingId] = useState(null);
  const [currentUserVotes, setCurrentUserVotes] = useState({});
  const [joke, setJoke] = useState(getJoke());
  
  const mountedRef = useRef(true);

  const { data: activePredictions = [], isLoading: loadingActive } = useActivePredictions(selDate);
  const { data: userPredictions, isLoading: loadingPreds } = useUserPredictions(uid, selDate);
  const { data: dailyLB = null } = useDailyLeaderboard(selDate);
  const { data: zokaPicksData = null } = useZokaPicks(selDate);
  const { data: zokaVotesData = { stats: {} } } = useZokaVotes(selDate);
  const { data: userPoints = null } = useUserPoints(uid);
  const { data: dateFixtures = [] } = useFixtures(selDate);

  const { data: officialResults = [] } = useQuery({
    queryKey: ['userResults', uid, selDate],
    queryFn: async () => {
      if (!uid || !db || !selDate) return [];
      const q = query(collection(db, PATHS.PREDICTION_RESULTS), where('userId', '==', uid), where('matchDate', '==', selDate));
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data());
    },
    enabled: !!uid && !!selDate,
    staleTime: 60 * 1000,
  });

  const featuredPreds = activePredictions || [];
  const zokaPicks = zokaPicksData;
  const zokaVoteStats = zokaVotesData?.stats || {};
  const ctxUserPreds = userPredictions || {};

  // Derived state
  const userPredMap = useMemo(() => {
    const m = {};
    if (ctxUserPreds) {
      Object.values(ctxUserPreds).forEach(p => {
        if (p.predId) m[p.predId] = p;
        if (p.matchId) m[String(p.matchId)] = p;
      });
    }
    return m;
  }, [ctxUserPreds]);

  const officialResultsMap = useMemo(() => {
    const m = new Map();
    (officialResults || []).forEach(r => m.set(String(r.matchId), r));
    return m;
  }, [officialResults]);

  const zokaPickMap = useMemo(() => {
    const m = new Map();
    (zokaPicks?.matches || []).forEach(p => m.set(String(p.matchId), p));
    return m;
  }, [zokaPicks]);

  // Handlers
  const onEdit = useCallback((pred) => {
    const up = userPredMap[String(pred.matchId)];
    setEditingId(pred.id || pred.matchId);
    setEditH(up ? String(up.homeScore) : '');
    setEditA(up ? String(up.awayScore) : '');
  }, [userPredMap]);

  const onCancel = useCallback(() => {
    setEditingId(null);
    setEditH('');
    setEditA('');
  }, []);

  const onQuickPick = useCallback((h, a) => {
    setEditH(String(h));
    setEditA(String(a));
  }, []);

  const onSave = useCallback(async (pred) => {
    if (!loggedIn) { setShowLogin(true); return; }
    if (!editH || !editA || saving) return;
    setSaving(true);
    try {
      await savePredictionAction({
        userId: uid,
        matchId: String(pred.matchId),
        predId: pred.id,
        homeScore: parseInt(editH, 10),
        awayScore: parseInt(editA, 10),
        matchDate: selDate,
        kickoff: pred.kickoff || pred.date,
        homeTeam: pred.homeTeam,
        awayTeam: pred.awayTeam,
        league: pred.league
      });
      toast.show('Prediction saved!', 'success');
      onCancel();
    } catch (err) {
      console.error('Save error:', err);
      toast.show('Failed to save prediction', 'error');
    } finally {
      setSaving(false);
    }
  }, [loggedIn, editH, editA, saving, uid, selDate, onCancel, toast]);

  const onVote = useCallback(async (matchId, vote) => {
    if (!loggedIn) { setShowLogin(true); return; }
    setVotingId(matchId);
    try {
      const prevVote = currentUserVotes[matchId];
      if (prevVote === vote) {
        await removeZokaVote(uid, matchId, vote);
        setCurrentUserVotes(prev => { const n = { ...prev }; delete n[matchId]; return n; });
      } else {
        await saveZokaVote(uid, matchId, vote);
        setCurrentUserVotes(prev => ({ ...prev, [matchId]: vote }));
      }
    } catch (err) {
      console.error('Vote error:', err);
    } finally {
      setVotingId(null);
    }
  }, [loggedIn, uid, currentUserVotes]);

  const onShare = useCallback(async (pred, isZoka = false) => {
    const url = `${window.location.origin}/predictions?match=${pred.matchId}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'ZOKASCORE Prediction', text: `Check out this match prediction!`, url });
      } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2000);
    }
  }, []);

  // Filters
  const filteredPreds = useMemo(() => {
    if (!featuredPreds) return [];
    if (filter === 'all') return featuredPreds;
    if (filter === 'mine') return featuredPreds.filter(p => userPredMap[String(p.matchId)]);
    if (filter === 'locked') return featuredPreds.filter(p => isMatchLocked(p, now).locked);
    if (filter === 'open') return featuredPreds.filter(p => !isMatchLocked(p, now).locked);
    return featuredPreds;
  }, [featuredPreds, filter, userPredMap, now]);

  const zokaVis = zokaExpanded ? (zokaPicks?.matches || []) : (zokaPicks?.matches || []).slice(0, ZOKA_VISIBLE_COUNT);

  const dailyEntries = dailyLB?.entries || [];
  const myEntry = useMemo(() => dailyEntries.find(u => u.uid === uid), [dailyEntries, uid]);
  
  const stats = useMemo(() => {
    let predicted = 0, exact = 0, result = 0, pending = 0, points = 0;
    featuredPreds.forEach(p => {
      const up = userPredMap[String(p.matchId)];
      if (!up) return;
      predicted++;
      let res = officialResultsMap.get(String(p.matchId));
      if ((!res || res.resultType === 'pending') && (isFinishedStatus(p.status, SPORT.FOOTBALL) || p.isFinished) && p.homeScore != null) {
        const r = calcPoints(up.homeScore, up.awayScore, p.homeScore, p.awayScore);
        res = { ...r, resultType: r.type };
      }
      if (!res || res.resultType === 'pending') { pending++; return; }
      if (res.resultType === 'exact') { exact++; points += (res.points || 10); }
      else if (res.resultType === 'result') { result++; points += (res.points || 3); }
    });
    return { predicted, exact, result, pending, points };
  }, [featuredPreds, userPredMap, officialResultsMap]);

  // Dates
  const dates = useMemo(() => {
    const arr = [];
    for (let i = -2; i <= FUTURE_DAYS; i++) {
      arr.push(getLocalDateStr(i));
    }
    return arr;
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const matchParam = new URLSearchParams(location.search).get('match');
    if (matchParam) {
      const pred = featuredPreds.find(p => String(p.matchId) === String(matchParam));
      if (pred) {
        onEdit(pred);
        // Clear the URL param so it doesn't re-trigger on re-renders
        nav('/predictions', { replace: true });
      }
    }
  }, [location.search, featuredPreds, onEdit, nav]);

  // SEO
  const seoProps = useMemo(() => ({
    title: `Football Predictions & Picks - ${dateLabel(selDate)}`,
    description: "Make your football predictions, compete with friends, and climb the leaderboard. Get expert AI picks and community stats for today's matches.",
    keywords: "football predictions, soccer predictions, football picks, match predictions, zokascore predictions",
    path: '/predictions',
    robots: 'index,follow'
  }), [selDate]);

  return (
    <div className="v21-page">
      <SEO {...seoProps} />
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} nav={nav} />}
      {showResults && (
        <ResultsOverlay
          date={selDate}
          preds={featuredPreds}
          userPredsObj={ctxUserPreds}
          results={officialResults}
          onClose={() => setShowResults(false)}
          nav={nav}
        />
      )}

      <div className="v21-layout">
        {/* Main Content Column */}
        <div className="v21-main-col">
          <header className="v21-header">
            <Link to="/" className="v21-back-btn">
              <ArrowLeft size={16} /> Home
            </Link>
            <h1 className="v21-title">Predict & Win</h1>
            <div className="v21-header-stats">
              <div className="v21-hstat" onClick={() => loggedIn && setShowResults(true)}>
                <span className="v21-hstat-val">{stats.points}</span>
                <span className="v21-hstat-lbl">Points</span>
              </div>
              <div className="v21-hstat" onClick={() => loggedIn && setShowResults(true)}>
                <span className="v21-hstat-val">{stats.exact}</span>
                <span className="v21-hstat-lbl">Exact</span>
              </div>
              <div className="v21-hstat" onClick={() => loggedIn && setShowResults(true)}>
                <span className="v21-hstat-val">{stats.predicted}</span>
                <span className="v21-hstat-lbl">Predicted</span>
              </div>
            </div>
          </header>

          <div className="v21-dates-wrap">
            <DateStrip date={selDate} onChange={setSelDate} dates={dates} />
          </div>

          <div className="v21-filters">
            {['all', 'mine', 'open', 'locked'].map(f => (
              <button
                key={f}
                className={`v21-pill ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Zoka Picks Section */}
          {zokaVis.length > 0 && (
            <div className="v21-zoka-section">
              <div className="v21-sech">
                <Star size={14} style={{ color: 'var(--gold)' }} />
                <h2>Zoka AI Picks</h2>
                <span className="v21-sech-badge" style={{ background: 'rgba(var(--gold-rgb),.1)', color: 'var(--gold)', border: '1px solid rgba(var(--gold-rgb),.3)' }}>{zokaVis.length}</span>
                <div className="v21-sech-line" />
              </div>
              <div className="v21-zoka-grid">
                {zokaVis.map((p, i) => (
                  <ZokaPickCard
                    key={p.matchId || i}
                    pick={p}
                    index={i}
                    voteStats={zokaVoteStats}
                    userVote={currentUserVotes}
                    onVote={onVote}
                    votingId={votingId}
                    onShare={onShare}
                  />
                ))}
              </div>
              {(zokaPicks?.matches?.length || 0) > ZOKA_VISIBLE_COUNT && (
                <button className="v21-toggle" onClick={() => setZokaExpanded(!zokaExpanded)}>
                  {zokaExpanded ? 'Show less' : `Show all ${zokaPicks.matches.length} picks`} <ChevronDown size={13} />
                </button>
              )}
            </div>
          )}

          {/* Featured Predictions List */}
          <div className="v21-pred-list">
            <div className="v21-sech">
              <Target size={14} style={{ color: 'var(--primary)' }} />
              <h2>Featured Matches</h2>
              <span className="v21-sech-badge" style={{ background: 'rgba(var(--primary-rgb),.1)', color: 'var(--primary)', border: '1px solid rgba(var(--primary-rgb),.3)' }}>{filteredPreds.length}</span>
              <div className="v21-sech-line" />
            </div>

            {loadingActive ? (
              <div className="v21-skel-list">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} />)}
              </div>
            ) : filteredPreds.length === 0 ? (
              <EmptyState icon={Target} title="No matches found for this filter." hint="Try selecting a different date or filter." />
            ) : (
              <div className="v21-cards-wrap">
                {filteredPreds.map((p, i) => (
                  <React.Fragment key={p.id || String(p.matchId) || i}>
                    <PredCard
                      pred={p}
                      index={i}
                      userPred={userPredMap[String(p.matchId)]}
                      result={officialResultsMap.get(String(p.matchId))}
                      isEditing={editingId === (p.id || p.matchId)}
                      editH={editH}
                      editA={editA}
                      onEdit={onEdit}
                      onSave={onSave}
                      onCancel={onCancel}
                      onQuickPick={onQuickPick}
                      onEditH={setEditH}
                      onEditA={setEditA}
                      loggedIn={loggedIn}
                      onLogin={() => setShowLogin(true)}
                      saving={saving}
                      now={now}
                      onShare={onShare}
                      zokaPick={zokaPickMap.get(String(p.matchId))}
                    />
                    {/* ✅ NEW AD PLACEMENT: Every 5 cards */}
                    {(i + 1) % 5 === 0 && (
                      <AdSlot id={`pred-list-ad-${i}`} mobile={true} desktop={false} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

          {copyToast && (
            <div className="v21-toast">Link copied to clipboard!</div>
          )}
        </div>

        {/* Desktop Sticky Sidebar Column */}
        <aside className="v21-sidebar">
          <div className="v21-sidebar-card glass-card">
            <h3 className="v21-sidebar-title">My Performance</h3>
            <div className="v21-sidebar-stats">
              <div className="v21-sstat">
                <div className="v21-sstat-val" style={{ color: 'var(--accent)' }}>{stats.points}</div>
                <div className="v21-sstat-lbl">Total Points</div>
              </div>
              <div className="v21-sstat-row">
                <div className="v21-sstat-mini">
                  <div className="v21-sstat-val-sm" style={{ color: 'var(--primary)' }}>{stats.exact}</div>
                  <div className="v21-sstat-lbl-sm">Exact</div>
                </div>
                <div className="v21-sstat-mini">
                  <div className="v21-sstat-val-sm" style={{ color: 'var(--gold)' }}>{stats.result}</div>
                  <div className="v21-sstat-lbl-sm">Results</div>
                </div>
              </div>
            </div>
            <button className="v21-b v21-bp v21-bsm v21-w-full" onClick={() => loggedIn ? setShowResults(true) : setShowLogin(true)}>
              <BarChart3 size={12} /> View Detailed Results
            </button>
          </div>

          <div className="v21-sidebar-card glass-card">
            <h3 className="v21-sidebar-title">Daily Leaderboard</h3>
            <div className="v21-lb-list">
              {dailyEntries.slice(0, 5).map((u, i) => (
                <div key={u.uid} className={`v21-lb-item ${u.uid === uid ? 'me' : ''}`}>
                  <span className="v21-lb-rank">#{i + 1}</span>
                  <div className="v21-lb-avatar" style={{ background: 'var(--primary)', color: '#fff' }}>
                    {(u.displayName || '??').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="v21-lb-info">
                    <div className="v21-lb-name">{u.displayName}</div>
                    <div className="v21-lb-sub">{u.exact || 0} exact</div>
                  </div>
                  <span className="v21-lb-pts">{u.points || 0}</span>
                </div>
              ))}
              {dailyEntries.length === 0 && (
                <div className="v21-lb-empty">No entries yet today. Be the first!</div>
              )}
            </div>
            <Link to="/leaderboard" className="v21-b v21-bgh v21-bsm v21-w-full" style={{ textDecoration: 'none' }}>
              Full Leaderboard <ArrowRight size={12} />
            </Link>
          </div>

          {/* ✅ STICKY SIDEBAR AD FOR DESKTOP */}
          <div className="v21-sidebar-ad-wrap">
            <AdSlot id="pred-sidebar-sticky" desktop={true} mobile={false} />
          </div>
        </aside>
      </div>
    </div>
  );
}