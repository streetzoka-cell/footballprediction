// frontend/src/components/MatchCard.jsx
import React, { memo, useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Star, Pin, Camera, Clock, Zap } from 'lucide-react';
import { buildMatchRoute } from '../utils/routes';
import { formatMinute } from '../engine/matchEngine'; 

const MatchCard = memo(({ m, i, isFav, isPinned, togglePinMatch, toggleFavorite, handleReactNow }) => {
  if (!m) return null;
  
  const prevScoreRef = useRef({ home: m.homeScore, away: m.awayScore });
  const [scoreFlash, setScoreFlash] = useState(false);
  const [goalFlash, setGoalFlash] = useState(false);

  useEffect(() => {
    if (m.isLive && (prevScoreRef.current.home !== m.homeScore || prevScoreRef.current.away !== m.awayScore)) {
      setScoreFlash(true);
      setGoalFlash(true);
      const t1 = setTimeout(() => setScoreFlash(false), 500);
      const t2 = setTimeout(() => setGoalFlash(false), 2000);
      prevScoreRef.current = { home: m.homeScore, away: m.awayScore };
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [m.homeScore, m.awayScore, m.isLive]);

  const isLive = m.isLive; 
  const isHT = m.isHT; 
  const isFt = m.isFinished; 
  const isStarted = m.isStarted;
  const isSched = !isLive && !isHT && !isFt && !isStarted;
  
  let cls = 'zoka-card';
  if (isLive) cls += ' live'; 
  else if (isStarted) cls += ' started';
  else if (isFt) cls += ' finished'; 
  else if (isSched) cls += ' scheduled';
  if (goalFlash) cls += ' goal-flash';
  
  const matchLink = buildMatchRoute(m.id, m.homeName, m.awayName);
  const display = m.display || {};
  const minute = m.displayMinute || display.minute || 0;

  let statusBadge = null;
  const matchStatus = (m.status || display.status || '').toUpperCase();
  
  if (isFt) {
    if (matchStatus === 'PEN') statusBadge = <span className="status-badge status-ft">PEN</span>;
    else if (matchStatus === 'AET' || minute >= 120) statusBadge = <span className="status-badge status-ft">AET</span>;
    else statusBadge = <span className="status-badge status-ft">FT</span>;
  } else if (matchStatus === 'PST' || matchStatus === 'POSTP') {
    statusBadge = <span className="status-badge" style={{ color: 'var(--gold)', background: 'rgba(var(--gold-rgb), 0.1)' }}>PST</span>;
  } else if (matchStatus === 'CANC' || matchStatus === 'ABD') {
    statusBadge = <span className="status-badge" style={{ color: 'var(--danger)', background: 'rgba(var(--danger-rgb), 0.1)' }}>CANC</span>;
  } else if (matchStatus === 'INT' || matchStatus === 'SUSP') {
    statusBadge = <span className="status-badge" style={{ color: 'var(--gold)', background: 'rgba(var(--gold-rgb), 0.1)' }}>INTERRUPTED</span>;
  } else if (isHT) {
    statusBadge = <span className="status-badge status-ht">HT</span>;
  } else if (isLive) {
    if (matchStatus === 'ET') {
      statusBadge = <span className="status-badge status-live"><span className="zk-live-pulse-dot" style={{ background: 'var(--danger)', marginRight: '4px' }}></span> {formatMinute(minute, 'ET')}</span>;
    } else if (matchStatus === 'P') {
      statusBadge = <span className="status-badge status-live"><span className="zk-live-pulse-dot" style={{ background: 'var(--danger)', marginRight: '4px' }}></span> PEN</span>;
    } else {
      statusBadge = <span className="status-badge status-live"><span className="zk-live-pulse-dot" style={{ background: 'var(--danger)', marginRight: '4px' }}></span> {formatMinute(minute, matchStatus)}</span>;
    }
  } else if (isStarted) {
    statusBadge = <span className="status-badge status-upcoming"><Clock size={10} /> STARTED</span>;
  } else if (isSched) {
    statusBadge = <span className="status-badge status-upcoming">{m.kickoff}</span>;
  }

  const hasStats = m.stats && (m.stats.possession || m.stats.shots || m.stats.corners);

  // ★ NEW: Extract AI Smart Pick
  const aiPick = m.mlPredictions?.["1x2"]?.pick;
  const aiProb = m.mlPredictions?.["1x2"]?.pick_probability;
  
  const formatPick = (pick) => {
    if (!pick) return null;
    if (pick === 'HOME_WIN') return m.homeName?.split(' ')[0] || 'HOME';
    if (pick === 'AWAY_WIN') return m.awayName?.split(' ')[0] || 'AWAY';
    return pick;
  };

  return (
    <article className={cls} style={{ animationDelay: i * 15 + 'ms' }} aria-label={`${m.homeName} vs ${m.awayName}`}>
      
      {goalFlash && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2 }} aria-hidden="true">
          <span style={{ fontSize: '2rem', animation: 'zk-confetti 1.5s ease-out forwards' }}>🎉</span>
        </div>
      )}

      <header className="zoka-card-top">
        <div className="flex-center gap-4">
          {m.category === 'FEATURED' && isSched && (
            <span className="badge badge-gold">★ TOP</span>
          )}
          {statusBadge}
        </div>
        <div className="zoka-card-actions">
          {isLive && (
            <button className={`btn-icon-sm ${isPinned ? 'active' : ''}`} onClick={() => togglePinMatch(m.id)} title="Pin to Screen" aria-label="Pin to Screen">
              <Pin size={14} fill={isPinned ? 'var(--primary)' : 'none'} color={isPinned ? 'var(--primary)' : 'var(--text-muted)'} />
            </button>
          )}
          <button className={`btn-icon-sm ${isFav ? 'active' : ''}`} onClick={() => toggleFavorite(m.id)} title="Favourite" aria-label="Toggle favourite">
            <Star size={14} fill={isFav ? 'var(--gold)' : 'none'} color={isFav ? 'var(--gold)' : 'var(--text-muted)'} />
          </button>
        </div>
      </header>
      
      <Link to={matchLink} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        <div className="zoka-teams">
          <div className="zoka-team-col home">
            <div className="zoka-team-row">
              {m.homeLogo && <img className="zoka-crest" src={m.homeLogo} alt={`${m.homeName} logo`} width="24" height="24" loading="lazy" />}
              <span className="zoka-team-name">{m.homeName}</span>
            </div>
          </div>
          <div className="zoka-score-box">
            {(isLive || isHT || isFt) ? (
              <div className="zoka-scores">
                <span className={`zoka-score-num ${isLive ? 'live-score' : ''} ${isFt ? 'ft-score' : ''} ${scoreFlash ? 'anim-score-pop' : ''}`}>{m.homeScore != null ? m.homeScore : '--'}</span>
                <span className="zoka-sep">–</span>
                <span className={`zoka-score-num ${isLive ? 'live-score' : ''} ${isFt ? 'ft-score' : ''} ${scoreFlash ? 'anim-score-pop' : ''}`}>{m.awayScore != null ? m.awayScore : '--'}</span>
              </div>
            ) : <span className="zoka-vs">{isStarted ? '--' : 'VS'}</span>}
          </div>
          <div className="zoka-team-col away">
            <div className="zoka-team-row">
              {m.awayLogo && <img className="zoka-crest" src={m.awayLogo} alt={`${m.awayName} logo`} width="24" height="24" loading="lazy" />}
              <span className="zoka-team-name">{m.awayName}</span>
            </div>
          </div>
        </div>
        
        <div className="zoka-comp-row" style={{ justifyContent: 'space-between' }}>
          <div className="flex-center gap-4" style={{ minWidth: 0 }}>
            {m.leagueLogo && <img src={m.leagueLogo} alt="" width="14" height="14" loading="lazy" aria-hidden="true" />}
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.leagueName}</span>
          </div>
          
          {/* ★ NEW: AI Smart Pick Pill */}
          {aiPick && (
            <div 
              className="flex-center gap-4" 
              style={{ 
                fontSize: '10.1px', 
                fontWeight: 700, 
                color: 'var(--accent)', 
                background: 'rgba(var(--accent-rgb), 0.1)', 
                padding: '2px 6px', 
                borderRadius: '4px', 
                border: '1px solid rgba(var(--accent-rgb), 0.2)',
                flexShrink: 0
              }}
            >
              <Zap size={10} fill="currentColor" />
              {formatPick(aiPick)} ({aiProb}%)
            </div>
          )}
        </div>
      </Link>

      {hasStats && (
        <div className="p-12 flex-col gap-8" style={{ borderTop: '1px solid var(--border)', marginTop: 'var(--sp-8)' }}>
          {m.stats.possession && (
            <div className="flex-between text-muted" style={{ fontSize: 'var(--fs-xs)' }} role="group" aria-label="Possession stats">
              <span>{m.stats.possession.home}%</span>
              <div style={{ flex: 1, height: '4px', margin: '0 8px', background: 'var(--bg-elevated)', borderRadius: '2px', overflow: 'hidden' }} role="progressbar" aria-valuenow={m.stats.possession.home} aria-valuemin="0" aria-valuemax="100">
                <div style={{ width: `${m.stats.possession.home}%`, height: '100%', background: 'var(--primary)' }}></div>
              </div>
              <span>{m.stats.possession.away}%</span>
            </div>
          )}
        </div>
      )}

      <footer className="p-12 flex-between">
        <button onClick={() => handleReactNow(m)} className="btn btn-ghost btn-sm">
          <Camera size={12} aria-hidden="true" /> React
        </button>
      </footer>
    </article>
  );
});

export default MatchCard;