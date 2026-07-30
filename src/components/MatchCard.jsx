import React, { memo, useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Star, Pin, Camera, Clock } from 'lucide-react';
import { buildMatchRoute } from '../utils/routes';

const MatchCard = memo(({ m, i, isFav, isPinned, togglePinMatch, toggleFavorite, handleReactNow }) => {
  if (!m) return null;
  
  // ★ Animation State for Score Flash & Goal Replay
  const prevScoreRef = useRef({ home: m.homeScore, away: m.awayScore });
  const [scoreFlash, setScoreFlash] = useState(false);
  const [goalFlash, setGoalFlash] = useState(false);

  useEffect(() => {
    if (m.isLive && (prevScoreRef.current.home !== m.homeScore || prevScoreRef.current.away !== m.awayScore)) {
      setScoreFlash(true);
      setGoalFlash(true);
      const t1 = setTimeout(() => setScoreFlash(false), 1000);
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
  
  // ★ Add goal-replay class to trigger border flash
  if (goalFlash) cls += ' goal-replay';
  
  const barColor = isLive ? '#ef4444' : isStarted ? '#fbbf24' : isFt ? '#10b981' : 'transparent';
  const matchLink = buildMatchRoute(m.id, m.homeName, m.awayName);
  const display = m.display || {};
  const minute = m.displayMinute || display.minute;

  // ★ Clean, professional status badge logic
  let statusBadge = null;
  const matchStatus = (m.status || display.status || '').toUpperCase();
  
  if (isFt) {
    if (matchStatus === 'PEN') {
      statusBadge = <span className="zoka-status ft-s">Pen</span>;
    } else if (matchStatus === 'AET' || minute >= 120) {
      statusBadge = <span className="zoka-status ft-s">AET</span>;
    } else {
      statusBadge = <span className="zoka-status ft-s">FT</span>;
    }
  } else if (matchStatus === 'PST' || matchStatus === 'POSTP') {
    statusBadge = <span className="zoka-status" style={{ color: '#fbbf24', background: 'rgba(251,191,36,.12)' }}>PST</span>;
  } else if (matchStatus === 'CANC' || matchStatus === 'ABD') {
    statusBadge = <span className="zoka-status" style={{ color: '#ef4444', background: 'rgba(239,68,68,.12)' }}>CANC</span>;
  } else if (matchStatus === 'SUSP' || matchStatus === 'INT') {
    statusBadge = <span className="zoka-status" style={{ color: '#fbbf24', background: 'rgba(251,191,36,.12)' }}>SUSP</span>;
  } else if (isHT) {
    statusBadge = <span className="zoka-status" style={{ color: '#fbbf24', background: 'rgba(251,191,36,.12)' }}>HT</span>;
  } else if (isLive) {
    // ★ Added Live Heartbeat dot to live matches
    if (matchStatus === 'ET') {
      statusBadge = (
        <span className="zoka-status live-s">
          <span className="live-pulse-dot" style={{ background: '#ef4444', marginRight: 4 }}></span> ET {minute != null ? `${minute}'` : ''}
        </span>
      );
    } else if (matchStatus === 'P') {
      statusBadge = (
        <span className="zoka-status live-s">
          <span className="live-pulse-dot" style={{ background: '#ef4444', marginRight: 4 }}></span> PEN
        </span>
      );
    } else {
      statusBadge = (
        <span className="zoka-status live-s">
          <span className="live-pulse-dot" style={{ background: '#ef4444', marginRight: 4 }}></span> 
          {minute != null ? `${minute}'` : 'LIVE'}
        </span>
      );
    }
  } else if (isStarted) {
    statusBadge = <span className="zoka-status started-s"><Clock size={10} /> STARTED</span>;
  } else if (isSched) {
    statusBadge = <span className="zoka-status time-s">{m.kickoff}</span>;
  }

  // ★ Compact Stats Logic
  const hasStats = m.stats && (m.stats.possession || m.stats.shots || m.stats.corners);

  return (
    <div className={cls} style={{ animationDelay: i * 15 + 'ms', paddingLeft: (isLive || isStarted || isFt) ? 18 : 16, position: 'relative' }}>
      
      {/* ★ Goal Replay Confetti Burst */}
      {goalFlash && (
        <div className="confetti-burst">
          <span>🎉</span><span>⚽</span><span>🎉</span>
        </div>
      )}

      {(isLive || isStarted || isFt) && <div className="zoka-left-bar" style={{ background: barColor }} />}
      
      <div className="zoka-card-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {m.category === 'FEATURED' && isSched && (
            <span className="zoka-status" style={{ color: '#fbbf24', background: 'rgba(251,191,36,.12)', border: '1px solid rgba(251,191,36,.2)' }}>★ TOP</span>
          )}
          {statusBadge}
        </div>
        <div className="zoka-card-actions">
          {isLive && (
            <button className={`zoka-icon-btn pin ${isPinned ? 'active' : ''}`} onClick={() => togglePinMatch(m.id)} title="Pin to Screen" aria-label="Pin to Screen">
              <Pin size={16} fill={isPinned ? '#10b981' : 'none'} color={isPinned ? '#10b981' : '#475569'} />
            </button>
          )}
          <button className={`zoka-icon-btn fav ${isFav ? 'active' : ''}`} onClick={() => toggleFavorite(m.id)} title="Favourite" aria-label="Toggle favourite">
            <Star size={16} fill={isFav ? '#fbbf24' : 'none'} color={isFav ? '#fbbf24' : '#475569'} />
          </button>
        </div>
      </div>
      
      <Link to={matchLink} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        <div className="zoka-teams">
          <div className="zoka-team-col home">
            <div className="zoka-team-row">
              {m.homeLogo && <img className="zoka-crest" src={m.homeLogo} alt="" width="24" height="24" loading="lazy" style={{objectFit:'contain'}} />}
              <span className="zoka-team-name">{m.homeName}</span>
            </div>
          </div>
          <div className="zoka-score-box">
            {(isLive || isHT || isFt) ? (
              <div className="zoka-scores">
                {/* ★ Added scoreFlash class to animate score changes */}
                <span className={`zoka-score-num ${isLive ? 'live-score' : ''} ${isFt ? 'ft-score' : ''} ${scoreFlash ? 'flash' : ''}`}>{m.homeScore != null ? m.homeScore : '--'}</span>
                <span className="zoka-sep">–</span>
                <span className={`zoka-score-num ${isLive ? 'live-score' : ''} ${isFt ? 'ft-score' : ''} ${scoreFlash ? 'flash' : ''}`}>{m.awayScore != null ? m.awayScore : '--'}</span>
              </div>
            ) : <span className="zoka-vs">{isStarted ? '--' : 'VS'}</span>}
          </div>
          <div className="zoka-team-col away">
            <div className="zoka-team-row">
              {m.awayLogo && <img className="zoka-crest" src={m.awayLogo} alt="" width="24" height="24" loading="lazy" style={{objectFit:'contain'}} />}
              <span className="zoka-team-name">{m.awayName}</span>
            </div>
          </div>
        </div>
        <div className="zoka-comp-row">
          {m.leagueLogo && <img src={m.leagueLogo} alt="" width="14" height="14" loading="lazy" style={{objectFit:'contain'}} />}
          <span>{m.leagueName}</span>
        </div>
      </Link>

      {/* ★ Compact Stats Row */}
      {hasStats && (
        <div className="zoka-mc-stats">
          {m.stats.possession && (
            <div className="zoka-stat-item">
              <span>{m.stats.possession.home}%</span>
              <div className="bar"><div style={{ width: `${m.stats.possession.home}%` }}></div></div>
              <span>{m.stats.possession.away}%</span>
            </div>
          )}
          {m.stats.shots && (
            <div className="zoka-stat-item">
              <span>Shots {m.stats.shots.home}</span>
              <span>{m.stats.shots.away}</span>
            </div>
          )}
        </div>
      )}

      <div style={{ padding: '8px 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => handleReactNow(m)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)', padding: '4px 10px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
          <Camera size={12} /> React
        </button>
      </div>
    </div>
  );
});

export default MatchCard;