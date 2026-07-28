import React, { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue, memo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Clock, CheckCircle2, TrendingUp, Target, BarChart3,
  Star, Save, Trophy, Lock, LogIn, ChevronDown, ChevronRight,
  ChevronUp, ChevronLeft, Minus, X, ArrowRight, ArrowLeft,
  Plus, CircleX, CircleCheck, ThumbsUp, ThumbsDown,
  Pencil, Share2, Zap
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useActivePredictions, useUserPredictions, useDailyLeaderboard, useZokaPicks, useZokaVotes, useUserPoints } from '../hooks/useUserData';
import { useLiveMatches } from '../hooks/useFixtures';
import { todayStr, getLocalDateStr } from '../utils/dates';
import { calcPoints, SPORT, isLiveStatus, isFinishedStatus, PATHS } from '../utils/constants';
import { savePrediction as savePredictionAction, saveZokaVote, removeZokaVote, resolveMatchForAllUsers } from '../services/predictions';
import { db } from '../utils/firebase';
import { doc, setDoc, serverTimestamp, getDocs, collection, query, where } from 'firebase/firestore';
import SEO from '../components/SEO';

// ★ Centralized imports
import { mergeLiveIntoPredictions, calculateUserStats } from '../engine/predictionEngine';
import { buildMatchRoute, buildTeamRoute, buildLeagueRoute } from '../utils/routes';
import { ListSkeleton, ErrorState } from '../components/StateFeedback';
import EmptyState from '../components/EmptyState';

const FUTURE_DAYS = 3;
const LOCK_BEFORE_MINUTES = 60;
const ZOKA_VISIBLE_COUNT = 5;
const SMOOTH = 'cubic-bezier(0.22, 1, 0.36, 1)';
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

const dateOffset = (offset = 0) => getLocalDateStr(offset);

const dateLabel = (d) => {
  const t = todayStr(), tm = getLocalDateStr(1), ys = getLocalDateStr(-1);
  if (d === t) return 'Today';
  if (d === tm) return 'Tomorrow';
  if (d === ys) return 'Yesterday';
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};
const dateDayName = (d) => ['S','M','T','W','T','F','S'][new Date(d + 'T12:00:00').getDay()];
const dateDayNum = (d) => d.slice(8);
const dateMonth = (d) => ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(d.slice(5,7)) - 1];

const QUICK_PICKS = [
  { h: 1, a: 0 }, { h: 2, a: 1 }, { h: 0, a: 0 }, { h: 1, a: 1 },
  { h: 2, a: 0 }, { h: 0, a: 1 }, { h: 3, a: 1 }, { h: 1, a: 2 },
];

function isMatchLocked(pred, now) {
  if (isFinishedStatus(pred.status, SPORT.FOOTBALL)) return { locked: true, reason: 'finished' };
  if (isLiveStatus(pred.status, SPORT.FOOTBALL) || pred.isLive) return { locked: true, reason: 'live' };
  const kickoffStr = pred.kickoff || pred.date;
  if (kickoffStr) {
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
  try { return new Date(kickoff).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
  catch { return '--:--'; }
}

const modalStyle = { background: 'rgba(15,23,42,0.95)', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '24px 20px', maxWidth: 340, width: '100%', textAlign: 'center', animation: `v21-pop .3s ${SPRING} both` };
const toastStyle = { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 12, background: 'rgba(16,185,129,.1)', border: '1.5px solid rgba(16,185,129,.25)', backdropFilter: 'blur(12px)' };

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://zokascore.xyz/" },
    { "@type": "ListItem", "position": 2, "name": "Predictions", "item": "https://zokascore.xyz/predictions" }
  ]
};

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

const Skeleton = memo(function Skeleton() { return <div className="v21-skel" />; });

const ResultBadge = memo(function ResultBadge({ result, isCalculating }) {
  if (isCalculating) return <span className="v21-bdg pn"><Clock size={8} /> Calc...</span>;
  if (!result || result.resultType === 'pending') return <span className="v21-bdg pn"><Clock size={8} /> Pending</span>;
  if (result.resultType === 'exact') return <span className="v21-bdg ex"><CheckCircle2 size={8} /> Hit +{result.points || 10}</span>;
  if (result.resultType === 'result') return <span className="v21-bdg rs"><TrendingUp size={8} /> Won +{result.points || 3}</span>;
  return <span className="v21-bdg ms"><CircleX size={8} /> Missed</span>;
});

const SaveToast = memo(function SaveToast({ show, score }) {
  if (!show) return null;
  return (
    <div className="v21-toast">
      <div style={toastStyle}>
        <CircleCheck size={15} style={{ color: '#10b981' }} />
        <span style={{ fontSize: '.82rem', fontWeight: 800, color: '#10b981' }}>{score}</span>
      </div>
    </div>
  );
});

const LoginModal = memo(function LoginModal({ onClose, nav }) {
  return (
    <div onClick={onClose} className="v21-overlay" style={{ zIndex: 9999 }}>
      <div onClick={e => e.stopPropagation()} style={modalStyle}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(16,185,129,.08)', border: '1.5px solid rgba(16,185,129,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: '#10b981' }}><LogIn size={22} /></div>
        <div style={{ fontSize: '1rem', fontWeight: 900, color: '#fff', marginBottom: 6 }}>Login Required</div>
        <div style={{ fontSize: '.8rem', color: '#94a3b8', marginBottom: 18, lineHeight: 1.5 }}>Sign in to make predictions and compete on the leaderboard.</div>
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
            {hasData && !isActive && <span style={{ position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: '50%', background: '#10b981', opacity: .5 }} />}
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
    <div className="v21-si-wrap">
      <button className="v21-step" onClick={() => onChange(String(Math.max(0, (num || 0) - 1)))}><Minus size={12} /></button>
      <input className="v21-si" value={display} onChange={e => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="?" maxLength={2} />
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
  const leagueId = pick.league?.id || pick.leagueKey;
  const homeId = pick.homeTeam?.id || pick.homeTeamId;
  const awayId = pick.awayTeam?.id || pick.awayTeamId;

  let leftColor = 'rgba(245,197,66,.12)';
  if (res?.resultType === 'exact') leftColor = '#10b981';
  else if (res?.resultType === 'result') leftColor = '#f5c542';
  else if (res?.resultType === 'miss') leftColor = '#ef4444';
  else if (isFin) leftColor = 'rgba(16,185,129,.2)';

  const cardCls = `v21-mc zoka${!isFin && !isLive ? ' pending' : ''}${isLive ? ' live' : ''}${isFin ? ' finished' : ''}`;

  return (
    <div className={cardCls} style={{ borderLeft: `3px solid ${leftColor}`, animationDelay: `${index * 30}ms` }}>
      <div className="v21-mh">
        <div className="v21-ml">
          {pick.league?.emblem && <img src={pick.league.emblem} alt={`${leagueName} logo`} width="14" height="14" loading="lazy" style={{objectFit:'contain'}} onError={e => { e.target.style.display = 'none'; }} />}
          <Link to={buildLeagueRoute(leagueId, leagueName)} style={{ textDecoration: 'none', color: 'inherit' }}>{leagueName}</Link>
        </div>
        <span className="v21-st" style={{ color: isFin ? '#10b981' : isLive ? '#ef4444' : '#94a3b8', background: isFin ? 'rgba(16,185,129,.08)' : isLive ? 'rgba(239,68,68,.1)' : 'rgba(255,255,255,.04)' }}>
          {isFin ? 'FT' : isLive ? (pick.minute || 'LIVE') : kickoff}
        </span>
      </div>
      <div className="v21-tm">
        <div className="v21-te">
          {homeLogo && <img src={homeLogo} alt={`${homeName} logo`} width="24" height="24" loading="lazy" style={{objectFit:'contain'}} onError={e => { e.target.style.display = 'none'; }} />}
          <Link to={buildTeamRoute(homeId, homeName)} style={{ textDecoration: 'none', color: 'inherit' }}>{homeName}</Link>
        </div>
        {isFin && pick.homeScore != null ? (
          <div className="v21-sb ft">
            <span className="v21-sn" style={{ color: '#10b981' }}>{pick.homeScore}</span>
            <span className="v21-sp">–</span>
            <span className="v21-sn" style={{ color: '#10b981' }}>{pick.awayScore}</span>
          </div>
        ) : isLive && pick.homeScore != null ? (
          <div className="v21-sb live">
            <span className="v21-sn" style={{ color: '#ef4444' }}>{pick.homeScore}</span>
            <span className="v21-sp">–</span>
            <span className="v21-sn" style={{ color: '#ef4444' }}>{pick.awayScore}</span>
          </div>
        ) : (
          <div className="v21-sb">
            <span className="v21-sn" style={{ color: '#f5c542' }}>{pick.adminPick?.home ?? '?'}</span>
            <span className="v21-sp">–</span>
            <span className="v21-sn" style={{ color: '#f5c542' }}>{pick.adminPick?.away ?? '?'}</span>
          </div>
        )}
        <div className="v21-te aw">
          {awayLogo && <img src={awayLogo} alt={`${awayName} logo`} width="24" height="24" loading="lazy" style={{objectFit:'contain'}} onError={e => { e.target.style.display = 'none'; }} />}
          <Link to={buildTeamRoute(awayId, awayName)} style={{ textDecoration: 'none', color: 'inherit' }}>{awayName}</Link>
        </div>
      </div>
      <div className="v21-ma" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 120 }}>
          {isFin && res && res.resultType !== 'pending' && <ResultBadge result={res} />}
          {isFin && (!res || res.resultType === 'pending') && <span className="v21-bdg pn"><Clock size={8} /> Calc...</span>}
          {!isFin && !isLive && vs.total > 0 && (
            <>
              <button className={`v21-vote${myV === 'agree' ? ' agree-on' : ''}`} onClick={() => onVote(mid, 'agree')} disabled={isVoting}>
                <ThumbsUp size={11} /> {vs.agree || 0}
              </button>
              <div className="v21-vote-bar">
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

const PredCard = memo(function PredCard({ pred, index, userPred, result, isEditing, editH, editA, onEdit, onSave, onCancel, onQuickPick, onEditH, onEditA, loggedIn, onLogin, saving, now, onShare }) {
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
  const leagueId = pred.league?.id || pred.leagueKey;
  const homeId = pred.homeTeam?.id || pred.homeTeamId;
  const awayId = pred.awayTeam?.id || pred.awayTeamId;

  let leftColor = 'rgba(255,255,255,0.06)';
  if (isResolved && effectiveResult?.resultType === 'exact') leftColor = '#10b981';
  else if (isResolved && effectiveResult?.resultType === 'result') leftColor = '#f5c542';
  else if (isResolved && effectiveResult?.resultType === 'miss') leftColor = '#ef4444';
  else if (isFin) leftColor = 'rgba(16,185,129,.2)';
  else if (isLive) leftColor = 'rgba(239,68,68,.3)';
  else if (hasPred) leftColor = '#60a5fa';
  else if (lockInfo.minutesLeft != null && lockInfo.minutesLeft <= 90) leftColor = 'rgba(245,197,36,.3)';

  let cardCls = 'v21-mc';
  if (isEditing) cardCls += ' editing';
  else if (isLive) cardCls += ' live';
  else if (isFin) cardCls += ' finished';
  else if (isLocked && !hasPred) cardCls += ' locked';
  else if (isFin && !hasPred) cardCls += ' missed';

  let statusLabel = kickoff;
  let statusColor = '#94a3b8';
  let statusBg = 'rgba(255,255,255,.04)';
  if (isEditing) { statusLabel = 'EDITING'; statusColor = '#10b981'; statusBg = 'rgba(16,185,129,.08)'; }
  else if (isLive) { statusLabel = pred.minute != null ? `${pred.minute}'` : 'LIVE'; statusColor = '#ef4444'; statusBg = 'rgba(239,68,68,.1)'; }
  else if (isFin) { statusLabel = 'FT'; statusColor = '#10b981'; statusBg = 'rgba(16,185,129,.08)'; }
  else if (lockInfo.minutesLeft != null && lockInfo.minutesLeft <= 60) { statusColor = '#f59e0b'; statusBg = 'rgba(245,158,11,.08)'; }

  return (
    <div className={cardCls} style={{ borderLeft: `3px solid ${leftColor}`, animationDelay: `${index * 20}ms` }}>
      <div className="v21-mh">
        <div className="v21-ml">
          {pred.league?.emblem && <img src={pred.league.emblem} alt={`${leagueName} logo`} width="14" height="14" loading="lazy" style={{objectFit:'contain'}} onError={e => { e.target.style.display = 'none'; }} />}
          <Link to={buildLeagueRoute(leagueId, leagueName)} style={{ textDecoration: 'none', color: 'inherit' }}>{leagueName}</Link>
        </div>
        <span className="v21-st" style={{ color: statusColor, background: statusBg }}>{statusLabel}</span>
      </div>
      <div className="v21-tm">
        <div className="v21-te">
          {homeLogo && <img src={homeLogo} alt={`${homeName} logo`} width="24" height="24" loading="lazy" style={{objectFit:'contain'}} onError={e => { e.target.style.display = 'none'; }} />}
          <Link to={buildTeamRoute(homeId, homeName)} style={{ textDecoration: 'none', color: 'inherit' }}>{homeName}</Link>
        </div>
        {isEditing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ScoreStepper value={editH} onChange={onEditH} />
            <span style={{ color: '#64748b', fontWeight: 700, fontSize: '.7rem', opacity: .3 }}>–</span>
            <ScoreStepper value={editA} onChange={onEditA} />
          </div>
        ) : hasPred ? (
          <div className={`v21-sb${isFin ? ' ft' : ''}`} style={!isFin ? { borderColor: 'rgba(96,165,250,.2)', background: 'rgba(96,165,250,.05)' } : {}}>
            <span className="v21-sn" style={{ color: isFin ? '#10b981' : '#60a5fa' }}>{userPred.homeScore}</span>
            <span className="v21-sp">–</span>
            <span className="v21-sn" style={{ color: isFin ? '#10b981' : '#60a5fa' }}>{userPred.awayScore}</span>
          </div>
        ) : isFin && pred.homeScore != null ? (
          <div className="v21-sb ft">
            <span className="v21-sn" style={{ color: '#10b981' }}>{pred.homeScore}</span>
            <span className="v21-sp">–</span>
            <span className="v21-sn" style={{ color: '#10b981' }}>{pred.awayScore}</span>
          </div>
        ) : (
          <div className="v21-sb"><span className="v21-vs">VS</span></div>
        )}
        <div className="v21-te aw">
          {awayLogo && <img src={awayLogo} alt={`${awayName} logo`} width="24" height="24" loading="lazy" style={{objectFit:'contain'}} onError={e => { e.target.style.display = 'none'; }} />}
          <Link to={buildTeamRoute(awayId, awayName)} style={{ textDecoration: 'none', color: 'inherit' }}>{awayName}</Link>
        </div>
      </div>
      <div className="v21-ma" style={{ gap: 6, flexWrap: 'wrap' }}>
        {isEditing && (
          <div className="v21-qp" style={{ width: '100%' }}>
            {QUICK_PICKS.map((qp, qi) => (
              <button key={qi} className={`v21-qp-btn${editH === String(qp.h) && editA === String(qp.a) ? ' sel' : ''}`} onClick={() => onQuickPick(qp.h, qp.a)}>{qp.h}–{qp.a}</button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', width: '100%', justifyContent: 'flex-end' }}>
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

const ResultsOverlay = memo(function ResultsOverlay({ date, preds, userPredsObj, results, onClose, nav }) {
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
    preds.forEach(p => {
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
              <div style={{ fontSize: '.95rem', fontWeight: 900, color: '#fff' }}>My Results</div>
              <div style={{ fontSize: '.68rem', color: '#94a3b8', fontWeight: 600, marginTop: 2 }}>{dateLabel(date)}</div>
            </div>
            <button className="v21-b v21-bgh v21-bsm" onClick={onClose}><X size={14} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5, marginBottom: 12 }}>
            <div className="v21-stat"><div className="n" style={{ color: '#a855f7' }}><AnimNum value={stats.totalPts} /></div><div className="l">Points</div></div>
            <div className="v21-stat"><div className="n" style={{ color: '#10b981' }}><AnimNum value={stats.exact} /></div><div className="l">Exact</div></div>
            <div className="v21-stat"><div className="n" style={{ color: '#f5c542' }}><AnimNum value={stats.result} /></div><div className="l">Result</div></div>
          </div>
          {stats.predicted > 0 && (
            <div className="v21-progress" style={{ marginBottom: 12 }}>
              <div className="v21-progress-bar"><div className="v21-progress-fill" style={{ width: `${((stats.predicted - stats.pending) / stats.predicted) * 100}%`, background: stats.allResolved ? '#10b981' : 'linear-gradient(90deg,#10b981,#34d399)' }} /></div>
              <div className="v21-progress-labels"><span>{stats.predicted} predicted</span><span>{stats.allResolved ? '✓ Complete' : `${stats.pending} pending`}</span></div>
            </div>
          )}
          {preds.map((p, i) => {
            const up = upMap.get(String(p.matchId));
            if (!up) return null;
            let res = resMap.get(String(p.matchId));
            if ((!res || res.resultType === 'pending') && (isFinishedStatus(p.status, SPORT.FOOTBALL) || p.isFinished) && p.homeScore != null) {
              const r = calcPoints(up.homeScore, up.awayScore, p.homeScore, p.awayScore);
              res = { ...r, resultType: r.type };
            }
            const rType = res?.resultType;
            return (
              <div key={p.id || i} className="v21-res-row" style={{ animationDelay: `${i * 20}ms`, borderLeft: rType === 'exact' ? '3px solid #10b981' : rType === 'result' ? '3px solid #f5c542' : rType === 'miss' ? '3px solid #ef4444' : '3px solid rgba(255,255,255,0.06)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {typeof p.homeTeam === 'object' ? p.homeTeam?.shortName || p.homeTeam?.name : p.homeTeam} vs {typeof p.awayTeam === 'object' ? p.awayTeam?.shortName || p.awayTeam?.name : p.awayTeam}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: '#60a5fa', fontSize: '.78rem', background: 'rgba(96,165,250,.06)', padding: '2px 6px', borderRadius: 5 }}>{up.homeScore}-{up.awayScore}</span>
                  {rType && rType !== 'pending' && <span className={`v21-bdg ${rType === 'exact' ? 'ex' : rType === 'result' ? 'rs' : 'ms'}`}>+{res.points || 0}</span>}
                </div>
              </div>
            );
          })}
          {stats.predicted === 0 && (
            <EmptyState icon={Target} title="No predictions for this day" />
          )}
          {stats.allResolved && (
            <div className="v21-rank" style={{ marginTop: 14, textAlign: 'center' }}>
              <Trophy size={22} style={{ color: '#10b981', marginBottom: 6 }} />
              <div style={{ fontSize: '.88rem', fontWeight: 900, color: '#fff', marginBottom: 3 }}>All Results In!</div>
              <div style={{ fontSize: '.76rem', color: '#94a3b8', fontWeight: 600, marginBottom: 12 }}>You scored <strong style={{ color: '#a855f7' }}>{stats.totalPts} pts</strong> · {stats.accuracy}% accuracy</div>
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
  
  const uid = currentUser?.uid;
  const loggedIn = !!uid;
  const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Anonymous';
  const isAdmin = userProfile?.role === 'admin';

  const [selDate, setSelDate] = useState(todayStr());
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState(null);
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
  
  const mountedRef = useRef(true);
  const resolving = useRef(new Set());

  const { data: activePredictions = [], isLoading: loadingActive } = useActivePredictions(selDate);
  const { data: userPredictions = {}, isLoading: loadingPreds } = useUserPredictions(uid, selDate);
  const { data: dailyLB = null } = useDailyLeaderboard(selDate);
  const { data: zokaPicksData = null } = useZokaPicks(selDate);
  const { data: zokaVotesData = { stats: {} } } = useZokaVotes(selDate);
  const { data: userPoints = null } = useUserPoints(uid);
  const { data: liveFixtures = [] } = useLiveMatches();

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

  const featuredPreds = activePredictions;
  const zokaPicks = zokaPicksData;
  const zokaVoteStats = zokaVotesData?.stats || {};
  const ctxUserPreds = userPredictions;
  const dailyEntries = dailyLB?.entries || [];
  const userStats = userPoints || {};
  const ctxLoading = loadingActive || loadingPreds;

  const fixtureMap = useMemo(() => new Map(liveFixtures.map(f => [String(f.id), f])), [liveFixtures]);

  useEffect(() => {
    try { setCurrentUserVotes(JSON.parse(localStorage.getItem(`zoka_votes_${selDate}`) || '{}')); } catch { setCurrentUserVotes({}); }
  }, [selDate]);

  // ★ REFACTORED: Use centralized engine for merging live data
  const mergedFeatured = useMemo(() => mergeLiveIntoPredictions(featuredPreds, fixtureMap), [featuredPreds, fixtureMap]);
  const mergedZoka = useMemo(() => mergeLiveIntoPredictions(zokaPicks?.matches || [], fixtureMap), [zokaPicks, fixtureMap]);

  const userPredMap = useMemo(() => {
    const m = new Map();
    Object.values(ctxUserPreds).forEach(p => {
      if (p.predId) m.set(p.predId, p);
      if (p.matchId) m.set(String(p.matchId), p);
    });
    return m;
  }, [ctxUserPreds]);

  const resultMap = useMemo(() => {
    const m = new Map();
    officialResults.forEach(r => m.set(String(r.matchId), r));
    return m;
  }, [officialResults]);

  // ★ REFACTORED: Use centralized engine for user stats calculation
  const myDayStats = useMemo(() => calculateUserStats(Object.values(ctxUserPreds), mergedFeatured, officialResults), [ctxUserPreds, mergedFeatured, officialResults]);

  const openLogin = useCallback(() => setShowLogin(true), []);
  
  const handleShare = useCallback(async (pred, isZoka = false) => {
    if (!uid) { openLogin(); return; }
    const baseUrl = window.location.origin;
    const matchId = pred.matchId || pred.id;
    const shareUrl = `${baseUrl}/predictions?match=${matchId}&ref=${encodeURIComponent(uid)}`;

    let homeName = 'Home', awayName = 'Away', scoreText = '';
    if (typeof pred.homeTeam === 'object') {
      homeName = pred.homeTeam?.shortName || pred.homeTeam?.name || 'Home';
      awayName = pred.awayTeam?.shortName || pred.awayTeam?.name || 'Away';
    } else {
      homeName = pred.homeTeam || 'Home';
      awayName = pred.awayTeam || 'Away';
    }
    if (isZoka) {
      scoreText = `${pred.adminPick?.home ?? '?'}-${pred.adminPick?.away ?? '?'}`;
    } else {
      const up = userPredMap.get(pred.id) || userPredMap.get(String(pred.matchId));
      if (up) scoreText = `${up.homeScore}-${up.awayScore}`;
    }

    const shareText = `My prediction for ${homeName} vs ${awayName} is ${scoreText || 'a draw'}! Think you can do better? Join me on ZokaScore.`;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'ZokaScore Prediction', text: shareText, url: shareUrl });
        setToast('Shared! Earn points when friends visit.');
      } catch (err) { if (err.name !== 'AbortError') console.error('Share failed', err); }
    } else {
      const fullText = `${shareText}\n\n${shareUrl}`;
      try {
        await navigator.clipboard.writeText(fullText);
        setCopyToast(true);
        setTimeout(() => setCopyToast(false), 3000);
      } catch (e) {
        setToast(`Copy failed. Please copy manually: ${fullText}`);
      }
    }
  }, [uid, openLogin, userPredMap]);

  const handleBannerShare = useCallback(async () => {
    if (!uid) { openLogin(); return; }

    const total = userStats?.predicted || myDayStats.pred || 0;
    const correct = (userStats?.exact || myDayStats.ex || 0) + (userStats?.result || myDayStats.rs || 0);
    const points = userStats?.points || myDayStats.pts || 0;

    const shareUrl = `${window.location.origin}/predictions?ref=${encodeURIComponent(uid)}`;

    let shareText;
    if (total > 0) {
      shareText = `🔥 I predicted ${correct}/${total} matches and scored ${points} points! Think you can beat me?\n\nJoin me on ZOKASCORE: ${shareUrl}`;
    } else {
      shareText = `I'm predicting football matches live on ZOKASCORE! Think you can beat me?\n\nJoin now: ${shareUrl}`;
    }

    if (navigator.share) {
      try { await navigator.share({ title: 'ZOKASCORE', text: shareText, url: shareUrl }); }
      catch (err) { /* cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(shareText);
        setCopyToast(true);
        setTimeout(() => setCopyToast(false), 3000);
      } catch (e) {
        setToast(`Copy failed. Please copy manually: ${shareText}`);
      }
    }
  }, [uid, userStats, myDayStats, openLogin]);

  const startEdit = useCallback((pred) => {
    const mid = String(pred.matchId);
    const existing = userPredMap.get(mid);
    setEditingId(mid);
    setEditH(existing ? String(existing.homeScore) : '');
    setEditA(existing ? String(existing.awayScore) : '');
  }, [userPredMap]);

  const cancelEdit = useCallback(() => { setEditingId(null); setEditH(''); setEditA(''); }, []);
  const quickPick = useCallback((h, a) => { setEditH(String(h)); setEditA(String(a)); }, []);

  const savePrediction = useCallback(async (pred) => {
    if (!uid || !editingId) return;
    const h = parseInt(editH, 10);
    const a = parseInt(editA, 10);
    if (isNaN(h) || isNaN(a)) { setToast('Enter valid scores'); return; }
    setSaving(true);
    try {
      const matchId = String(pred.matchId || editingId);
      const matchDate = pred.matchDate || selDate;
      await savePredictionAction(uid, displayName, { ...pred, id: editingId, matchId, matchDate }, h, a);
      setEditingId(null);
      setEditH('');
      setEditA('');
      setToast(`${h}-${a} saved`);
      queryClient.invalidateQueries(['userPredictions', uid, selDate]);
    } catch (e) {
      console.error('[Pred] Save err:', e);
      setToast('Save failed');
    }
    setSaving(false);
  }, [uid, editingId, editH, editA, selDate, displayName, queryClient]);

  const handleVote = useCallback(async (matchId, vote) => {
    if (!uid) { openLogin(); return; }
    const midStr = String(matchId || '');
    setVotingId(midStr);
    try {
      const oldVote = currentUserVotes[midStr];
      if (oldVote === vote) {
        await removeZokaVote(uid, midStr, null);
        setCurrentUserVotes(prev => {
          const n = { ...prev }; delete n[midStr]; 
          try { localStorage.setItem(`zoka_votes_${selDate}`, JSON.stringify(n)); } catch {}
          return n;
        });
      } else {
        await saveZokaVote(uid, midStr, vote);
        setCurrentUserVotes(prev => {
          const n = { ...prev, [midStr]: vote };
          try { localStorage.setItem(`zoka_votes_${selDate}`, JSON.stringify(n)); } catch {}
          return n;
        });
      }
      queryClient.invalidateQueries(['zokaVotes', selDate]);
    } catch (e) { console.error('[Pred] Vote err:', e); }
    setVotingId(null);
  }, [uid, openLogin, currentUserVotes, selDate, queryClient]);

  const handleDateChange = useCallback((d) => {
    setSelDate(d);
    setFilter('all');
    setZokaExpanded(false);
    cancelEdit();
  }, [cancelEdit]);
  
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const referrer = params.get('ref');
    if (referrer) {
      let deviceId = localStorage.getItem('zk_device_id');
      if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
        localStorage.setItem('zk_device_id', deviceId);
      }
      const visitKey = `zk_ref_${referrer}_${deviceId}`;
      if (!localStorage.getItem(visitKey)) {
        localStorage.setItem(visitKey, '1');
        if (db) {
          setDoc(doc(db, 'referral_visits', visitKey), {
            referrerUid: referrer,
            visitorDeviceId: deviceId,
            visitorUid: uid || null,
            visitedAt: serverTimestamp(),
            status: 'pending'
          }).catch(e => console.error("Referral track err:", e));
        }
      }
    }
  }, [location.search, uid]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isAdmin || !liveFixtures.length) return;
    const toResolve = mergedFeatured.filter(p => {
      const mid = String(p.matchId);
      const fx = fixtureMap.get(mid);
      const fxHome = fx?.goalsHome ?? fx?.homeScore ?? fx?.score?.fullTime?.home;
      const fxAway = fx?.goalsAway ?? fx?.awayScore ?? fx?.score?.fullTime?.away;
      return fx && isFinishedStatus(fx.status, SPORT.FOOTBALL) && fxHome != null && fxAway != null && p.status !== 'finished';
    });

    toResolve.forEach(pred => {
      const mid = String(pred.matchId);
      if (!resolving.current.has(mid)) {
        const fx = fixtureMap.get(mid);
        const fxHome = fx.goalsHome ?? fx.homeScore ?? fx.score?.fullTime?.home;
        const fxAway = fx.goalsAway ?? fx.awayScore ?? fx.score?.fullTime?.away;
        
        resolving.current.add(mid);
        
        const predId = pred.id || `feat_${selDate}_${mid}`;
        setDoc(doc(db, PATHS.ACTIVE_PREDICTIONS, predId), { 
          homeScore: fxHome, 
          awayScore: fxAway, 
          status: 'finished', 
          updatedAt: serverTimestamp() 
        }, { merge: true }).catch(console.error);
        
        resolveMatchForAllUsers(mid, fxHome, fxAway, pred.matchDate || selDate)
          .catch(e => console.error("Resolve err:", e))
          .finally(() => resolving.current.delete(mid));
      }
    });
  }, [isAdmin, mergedFeatured, fixtureMap, selDate, liveFixtures]);

  const dateList = useMemo(() => {
    const arr = [];
    for (let i = -14; i <= FUTURE_DAYS; i++) arr.push(dateOffset(i));
    return arr;
  }, []);

  const hasDataMap = useMemo(() => {
    const m = {};
    if (mergedFeatured.length > 0) m[selDate] = true;
    if (mergedZoka.length > 0) m[selDate] = true;
    return m;
  }, [mergedFeatured, mergedZoka, selDate]);

  const visibleZoka = useMemo(() => {
    if (mergedZoka.length <= ZOKA_VISIBLE_COUNT) return mergedZoka;
    return zokaExpanded ? mergedZoka : mergedZoka.slice(0, ZOKA_VISIBLE_COUNT);
  }, [mergedZoka, zokaExpanded]);
  
  const hiddenZokaCount = mergedZoka.length - ZOKA_VISIBLE_COUNT;

  const deferredFilter = useDeferredValue(filter);
  const filteredPreds = useMemo(() => {
    if (deferredFilter === 'predicted') return mergedFeatured.filter(p => userPredMap.get(String(p.matchId)));
    if (deferredFilter === 'unpredicted') return mergedFeatured.filter(p => !userPredMap.get(String(p.matchId)) && !isFinishedStatus(p.status, SPORT.FOOTBALL));
    if (deferredFilter === 'finished') return mergedFeatured.filter(p => isFinishedStatus(p.status, SPORT.FOOTBALL) || p.isFinished);
    return mergedFeatured;
  }, [mergedFeatured, userPredMap, deferredFilter]);

  const filterCounts = useMemo(() => ({
    all: mergedFeatured.length,
    predicted: mergedFeatured.filter(p => userPredMap.get(String(p.matchId))).length,
    unpredicted: mergedFeatured.filter(p => !userPredMap.get(String(p.matchId)) && !isFinishedStatus(p.status, SPORT.FOOTBALL)).length,
    finished: mergedFeatured.filter(p => isFinishedStatus(p.status, SPORT.FOOTBALL) || p.isFinished).length,
  }), [mergedFeatured, userPredMap]);

  const myRank = useMemo(() => {
    if (!uid || !dailyEntries) return null;
    return dailyEntries.find(u => u.uid === uid) || null;
  }, [dailyEntries, uid]);

  return (
    <div className="v21-page">
      <SEO
        title="Predict Matches & Win | ZOKASCORE"
        description="Predict football matches, climb the leaderboard, and challenge your friends. Expert tips and live scoring."
        keywords="football predictions, betting tips, match predictions, soccer tips"
        robots="index,follow"
        breadcrumbs={[{ name: "Home", path: "/" }, { name: "Predictions", path: "/predictions" }]}
      />

      {copyToast && <div className="v21-toast-copy">Copied to clipboard!</div>}

      <div className="v21-hdr">
        <button className="v21-hdr-btn" onClick={() => nav('/')}><ArrowLeft size={12} /> Home</button>
        <div className="v21-hdr-title">
          <h1>
            <span style={{ color: '#fff' }}>MATCH</span>
            <span style={{ color: '#10b981' }}>PREDICT</span>
          </h1>
          <div className="sub">Predict · Compete · Win</div>
        </div>
        <button className="v21-hdr-btn" onClick={() => setShowResults(true)}><BarChart3 size={12} /> Results</button>
      </div>

      <div className="v21-dsk">
        <div className="v21-wrap" style={{ padding: 0 }}>
          <DateStrip date={selDate} onChange={handleDateChange} dates={dateList} hasDataMap={hasDataMap} />
        </div>
      </div>

      <div className="v21-wrap">
        {loggedIn && (
          <div style={{ marginBottom: 16, animation: `v21-fade-up .4s ${SMOOTH} both` }}>
            <div className="v21-stats">
              <div className="v21-stat"><div className="n" style={{ color: '#fbbf24' }}><AnimNum value={myDayStats.pts} /></div><div className="l">Points</div></div>
              <div className="v21-stat"><div className="n" style={{ color: '#10b981' }}><AnimNum value={myDayStats.ex} /></div><div className="l">Exact</div></div>
              <div className="v21-stat"><div className="n" style={{ color: '#f5c542' }}><AnimNum value={myDayStats.rs} /></div><div className="l">Results</div></div>
              <div className="v21-stat"><div className="n" style={{ color: '#a855f7' }}>{myRank ? `#${myRank.rank}` : '—'}</div><div className="l">Rank</div></div>
            </div>
            {myDayStats.pred > 0 && (
              <div className="v21-progress" style={{ marginBottom: 10 }}>
                <div className="v21-progress-bar"><div className="v21-progress-fill" style={{ width: `${((myDayStats.pred - myDayStats.pn) / myDayStats.pred) * 100}%`, background: myDayStats.allResolved ? '#10b981' : 'linear-gradient(90deg,#10b981,#34d399)' }} /></div>
                <div className="v21-progress-labels"><span>{myDayStats.pred} predicted · {myDayStats.accuracy}% accuracy</span><span>{myDayStats.allResolved ? '✓ Complete' : `${myDayStats.pn} pending`}</span></div>
              </div>
            )}
            {myRank && (
              <div className="v21-rank" style={{ marginTop: 10 }}>
                <div className="v21-rank-inner">
                  <Trophy size={18} style={{ color: '#f5c542' }} />
                  <div>
                    <div style={{ fontSize: '.76rem', fontWeight: 700, color: '#fff' }}>Rank #{myRank.rank}</div>
                    <div style={{ fontSize: '.62rem', color: '#94a3b8', fontWeight: 600 }}>{myRank.points} pts · {myRank.accuracy}% accuracy</div>
                  </div>
                  <button className="v21-rank-btn" onClick={() => nav('/leaderboard')}>Board <ChevronRight size={10} /></button>
                </div>
              </div>
            )}
          </div>
        )}

        {loggedIn && myDayStats.pred > 0 && (
          <div className="v21-banner">
            <div className="v21-banner-text">
              <Trophy size={18} style={{ color: '#fbbf24', flexShrink: 0 }} />
              You've predicted {myDayStats.pred} matches today! Challenge your friends to beat your score.
            </div>
            <button className="v21-banner-btn" onClick={handleBannerShare}>
              <Share2 size={18} /> Share & Challenge Friends
            </button>
          </div>
        )}

        {!loggedIn && (
          <div className="v21-banner login-banner">
            <div className="v21-banner-text">
              <Lock size={18} style={{ color: '#3b82f6', flexShrink: 0 }} />
              Sign in to lock in your predictions and climb the global leaderboard.
            </div>
            <Link to="/login" className="v21-banner-btn blue">
              <Zap size={18} /> Sign In to Predict
            </Link>
          </div>
        )}

        <div className="v21-filter">
          {[
            { key: 'all', label: 'All', count: filterCounts.all },
            { key: 'predicted', label: 'Predicted', count: filterCounts.predicted },
            { key: 'unpredicted', label: 'Open', count: filterCounts.unpredicted },
            { key: 'finished', label: 'Finished', count: filterCounts.finished },
          ].map(f => (
            <button key={f.key} className={`v21-fbtn${filter === f.key ? ' on' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label} ({f.count})
            </button>
          ))}
        </div>

        {mergedZoka.length > 0 && (
          <div className="v21-zoka">
            <div className="v21-zoka-hd">
              <div className="v21-zoka-icon"><Star size={14} style={{ color: '#f5c542' }} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.85rem', fontWeight: 900, color: '#fff' }}>Zoka Picks</div>
                <div style={{ fontSize: '.6rem', fontWeight: 600, color: '#94a3b8', marginTop: 1 }}>
                  {mergedZoka.length} picks · Not for competition
                </div>
              </div>
            </div>
            {visibleZoka.map((pick, i) => (
              <ZokaPickCard key={pick.matchId || i} pick={pick} index={i} voteStats={zokaVoteStats} userVote={currentUserVotes} onVote={handleVote} votingId={votingId} onShare={handleShare} />
            ))}
            {hiddenZokaCount > 0 && !zokaExpanded && (
              <button className="v21-zoka-more" onClick={() => setZokaExpanded(true)}>
                <ChevronDown size={14} /> Show {hiddenZokaCount} More
              </button>
            )}
            {zokaExpanded && hiddenZokaCount > 0 && (
              <button className="v21-zoka-more" onClick={() => setZokaExpanded(false)}>
                <ChevronUp size={14} /> Show Less
              </button>
            )}
          </div>
        )}

        <div style={{ animation: `v21-fade-up .3s ${SMOOTH} both` }}>
          <div className="v21-sec">
            <div className="v21-sec-icon"><Target size={13} /></div>
            <span>Featured — Compete</span>
            <span className="v21-sec-badge">{filteredPreds.length}</span>
          </div>

          {ctxLoading ? (
            <div>{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} />)}</div>
          ) : filteredPreds.length > 0 ? (
            filteredPreds.map((pred, i) => {
              const predId = String(pred.matchId);
              return (
                <PredCard
                  key={predId}
                  pred={pred}
                  index={i}
                  userPred={userPredMap.get(predId)}
                  result={resultMap.get(predId)}
                  isEditing={editingId === predId}
                  editH={editH}
                  editA={editA}
                  onEdit={startEdit}
                  onSave={savePrediction}
                  onCancel={cancelEdit}
                  onQuickPick={quickPick}
                  onEditH={setEditH}
                  onEditA={setEditA}
                  loggedIn={loggedIn}
                  onLogin={openLogin}
                  saving={saving}
                  now={now}
                  onShare={handleShare}
                />
              );
            })
          ) : (
            <EmptyState 
              icon={Target} 
              title={filter === 'predicted' ? 'No predictions yet' : filter === 'finished' ? 'No finished matches' : filter === 'unpredicted' ? 'All predicted!' : 'No featured matches'} 
              hint={filter === 'all' ? 'Check back later' : 'Try another filter'} 
            />
          )}
        </div>

        {myDayStats.allResolved && myDayStats.pred > 0 && (
          <div className="v21-rank" style={{ marginTop: 16, textAlign: 'center' }}>
            <Trophy size={24} style={{ color: '#10b981', marginBottom: 8 }} />
            <div style={{ fontSize: '.9rem', fontWeight: 900, color: '#fff', marginBottom: 3 }}>All Results In!</div>
            <div style={{ fontSize: '.76rem', color: '#94a3b8', fontWeight: 600, marginBottom: 12 }}>
              You scored <strong style={{ color: '#a855f7' }}>{myDayStats.pts} pts</strong> · {myDayStats.accuracy}% accuracy
            </div>
            <button className="v21-b v21-bp" onClick={() => nav('/leaderboard')}>View Leaderboard <ArrowRight size={13} /></button>
          </div>
        )}

        {loggedIn && myDayStats.pred > 0 && (
          <button className="v21-banner-btn secondary" style={{ marginTop: '20px' }} onClick={handleBannerShare}>
            <Share2 size={18} /> Share My Score Again
          </button>
        )}
      </div>

      <SaveToast show={!!toast} score={toast} />
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} nav={nav} />}
      {showResults && (
        <ResultsOverlay date={selDate} preds={mergedFeatured} userPredsObj={ctxUserPreds} results={officialResults} onClose={() => setShowResults(false)} nav={nav} />
      )}
    </div>
  );
}