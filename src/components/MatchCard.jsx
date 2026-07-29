import React, { useState, memo } from 'react';
import { Link } from 'react-router-dom';
import { buildMatchRoute } from '../utils/routes';

const TeamBadge = memo(({ logo, name }) => {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
  return (
    <div className="mc-team-badge" style={{ background: '#1a1f2b' }}>
      {logo ? <img src={logo} alt="" loading="lazy" /> : <span className="abbr">{initials}</span>}
    </div>
  );
});

const MatchCardBase = ({ match, showProb = true, goalFlash = false, kickOff = false, onClick, index = 0 }) => {
  const [hovered, setHovered] = useState(false);

  if (!match) return null;

  // ★ Read pre-calculated fields directly from the backend payload
  const { id, homeName, awayName, homeLogo, awayLogo, leagueName, leagueLogo, leagueCountry, display, time, homeWinProb, drawProb, awayWinProb, homeOdds, drawOdds, awayOdds } = match;
  
  // Fallbacks for safety
  const isLive = match.isLive || display?.isLive || false;
  const isFinished = match.isFinished || display?.isFinished || false;
  const isScheduled = match.isScheduled || display?.isUpcoming || false;
  const isHT = match.isHT || display?.isHalfTime || false;
  
  const displayMinute = match.displayMinute || display?.minute || 0;
  const timeStr = match.kickoff || time?.kickoffLocal || 'TBD';
  const dateStr = match.dateStr || time?.weekday || '';
  
  const statusLabel = isFinished ? 'FT' : isScheduled ? '' : (display?.status || match.status || '');
  const statusCls = isLive ? 'live' : isFinished ? 'finished' : 'upcoming';
  const borderClass = kickOff ? 'mc-ko-glow' : isLive ? 'mc-live-border' : '';

  const handleClick = (e) => { if (onClick) { e.preventDefault(); onClick(match); } };

  return (
    <Link 
      to={buildMatchRoute(id, homeName, awayName)} 
      className={`mc-card mc-interactive ${borderClass} ${goalFlash ? 'mc-goal-flash' : ''}`}
      onClick={handleClick}
      style={{ animationDelay: `${index * 40}ms`, textDecoration: 'none', color: 'inherit' }}
    >
      {isLive && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, #ef4444, transparent)', opacity: .5, zIndex: 1 }} />}

      <div className="mc-header">
        <div className="mc-league">
          {leagueLogo && <img className="mc-league-logo" src={leagueLogo} alt="" />}
          {!leagueLogo && <span className="mc-league-dot" style={{ background: '#10b981' }} />}
          <span>{leagueName}</span>
          {leagueCountry && <span style={{ opacity: .5 }}>· {leagueCountry}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {statusLabel && (
            <span className={`mc-status-badge ${statusCls}`}>
              {isLive && <span className="mc-live-dot" />}
              {statusLabel}
            </span>
          )}
          {isLive && displayMinute != null && <span className="mc-minute">{displayMinute}&apos;</span>}
          {!isLive && !isFinished && <span style={{ fontSize: '.68rem', color: '#64748B', fontWeight: 500 }}>{dateStr} · {timeStr}</span>}
        </div>
      </div>

      <div className="mc-body">
        <div className="mc-team">
          <TeamBadge logo={homeLogo} name={homeName} />
          <span className="mc-team-name">{homeName}</span>
        </div>
        
        <div className="mc-score-area" style={{ minWidth: '70px', textAlign: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: isLive ? '#ef4444' : '#f8fafc' }}>
            {isLive || isFinished ? `${match.homeScore ?? '-'} - ${match.awayScore ?? '-'}` : 'VS'}
          </div>
        </div>

        <div className="mc-team away">
          <TeamBadge logo={awayLogo} name={awayName} />
          <span className="mc-team-name">{awayName}</span>
        </div>
      </div>
    </Link>
  );
};

export default memo(MatchCardBase);