import { useEffect, useState, useMemo, useCallback, memo } from 'react';

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════════════ */
const LIVE_SET = new Set(['1H','2H','HT','ET','BT','P','1Q','Q1','2Q','Q2','3Q','Q3','4Q','Q4','OT']);
const FINISHED_SET = new Set(['FT','AET','PEN','ABD','AWD','WO','completed','FINISHED']);

const isMatchLive = (m) => m.isLive || LIVE_SET.has(m.status) || LIVE_SET.has(m.rawStatus);
const isMatchFinished = (m) => m.isFinished || FINISHED_SET.has(m.status) || FINISHED_SET.has(m.rawStatus);
const isMatchScheduled = (m) => !isMatchLive(m) && !isMatchFinished(m) && (m.homeScore == null);

const getConfidence = (h, d, a) => {
  const m = Math.max(h, d, a);
  if (m >= 55) return { label: 'High', color: '#10b981' };
  if (m >= 40) return { label: 'Medium', color: '#fbbf24' };
  return { label: 'Low', color: '#ef4444' };
};

const TeamBadge = memo(({ logo, name, color, abbr }) => {
  const fallback = color || '#1a1f2b';
  const initials = abbr || (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
  return (
    <div className="mc-team-badge" style={{ background: fallback }}>
      {logo ? <img src={logo} alt="" loading="lazy" /> : <span className="abbr">{initials}</span>}
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════
   ★ FIXED SCORE DISPLAY — No more fake 0-0 or pred-as-result
   ═══════════════════════════════════════════════════════════════ */
const ScoreDisplay = memo(({ predicted, actual, isLive, isFinished, isScheduled, timeStr, goalFlash, scoreKey }) => {
  if (isScheduled) return <div className="mc-time-display">{timeStr || '--:--'}</div>;

  const hasActual = actual && actual.home != null && actual.away != null;
  const hasPredicted = predicted && predicted.home != null && predicted.away != null;

  // ★ FINISHED: Show actual scores ONLY if we have real data. Otherwise "- -".
  if (isFinished) {
    if (hasActual) {
      const hOk = hasPredicted && predicted.home === actual.home;
      const aOk = hasPredicted && predicted.away === actual.away;
      const bothOk = hOk && aOk;
      return (
        <div className={`mc-score-area ${goalFlash ? 'mc-goal-flash' : ''}`}>
          <div className={`mc-score-row ${scoreKey === 'changed' ? 'mc-score-pop' : ''}`}>
            <div className="mc-score-box" style={{ borderColor: hOk ? '#10b981' : '#151b26', color: '#f8fafc', boxShadow: hOk ? '0 0 10px rgba(16,185,129,.2)' : 'none' }}>{actual.home}</div>
            <span className="mc-score-sep">-</span>
            <div className="mc-score-box" style={{ borderColor: aOk ? '#10b981' : '#151b26', color: '#f8fafc', boxShadow: aOk ? '0 0 10px rgba(16,185,129,.2)' : 'none' }}>{actual.away}</div>
          </div>
          {hasPredicted && (
            <div className="mc-pred-row">
              <span>Pred: {predicted.home}-{predicted.away}</span>
              {bothOk && <span className="mc-exact-tag mc-exact-pop">&#10003; EXACT</span>}
            </div>
          )}
        </div>
      );
    }
    // No actual scores — show dashes, not "?-?" and not prediction
    return (
      <div className="mc-score-area">
        <div className="mc-score-row">
          <div className="mc-score-box" style={{ borderColor: '#151b26', color: '#475569' }}>-</div>
          <span className="mc-score-sep">-</span>
          <div className="mc-score-box" style={{ borderColor: '#151b26', color: '#475569' }}>-</div>
        </div>
        {hasPredicted && (
          <div className="mc-pred-row">
            <span>Pred: {predicted.home}-{predicted.away}</span>
          </div>
        )}
      </div>
    );
  }

  // ★ LIVE or UPCOMING: Show actual if available, prediction as secondary, or "?-?"
  const showScores = hasActual || hasPredicted;
  const h = hasActual ? actual.home : hasPredicted ? predicted.home : '?';
  const a = hasActual ? actual.away : hasPredicted ? predicted.away : '?';
  const isPredOnly = !hasActual && hasPredicted;

  return (
    <div className={`mc-score-area ${goalFlash ? 'mc-goal-flash' : ''}`}>
      {showScores && (
        <div className={`mc-score-row ${scoreKey === 'changed' ? 'mc-score-pop' : ''}`}>
          <div className="mc-score-box" style={{ borderColor: isPredOnly ? 'rgba(16,185,129,.25)' : '#151b26', color: isLive ? '#ef4444' : isPredOnly ? '#10b981' : '#64748b', boxShadow: isPredOnly ? '0 0 10px rgba(16,185,129,.15)' : 'none' }}>{h}</div>
          <span className="mc-score-sep">-</span>
          <div className="mc-score-box" style={{ borderColor: isPredOnly ? 'rgba(16,185,129,.25)' : '#151b26', color: isLive ? '#ef4444' : isPredOnly ? '#10b981' : '#64748b', boxShadow: isPredOnly ? '0 0 10px rgba(16,185,129,.15)' : 'none' }}>{a}</div>
        </div>
      )}
      {hasPredicted && !isPredOnly && (
        <div className="mc-pred-row">
          <span>Pred: {predicted.home}-{predicted.away}</span>
        </div>
      )}
      {!hasPredicted && !isScheduled && <div className="mc-score-label">{isLive ? 'LIVE' : ''}</div>}
    </div>
  );
});

const ProbBar = memo(({ label, value, type, delay = 0 }) => {
  const [w, setW] = useState(0);
  const isHigh = (type === 'home' && value >= 45) || (type === 'draw' && value >= 30) || (type === 'away' && value >= 45);

  useEffect(() => {
    const t = setTimeout(() => setW(value), 80 + delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return (
    <div className="mc-prob-row">
      <span className="mc-prob-label" style={{ color: isHigh ? '#f8fafc' : '#64748b', fontWeight: isHigh ? 700 : 600 }}>{label}</span>
      <div className="mc-prob-track">
        <div className={`mc-prob-fill ${type}`} style={{ width: `${w}%` }} />
      </div>
      <span className="mc-prob-value" style={{ color: isHigh ? '#f8fafc' : '#94a3b8' }}>{value}%</span>
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT (Memoized)
   ═══════════════════════════════════════════════════════════════ */
const MatchCardBase = ({
  match, showOdds = true, showProb = true, compact = false,
  goalFlash = false, kickOff = false, scoreKey = null,
  onClick, index = 0,
}) => {
  const [hovered, setHovered] = useState(false);

  const live = useMemo(() => isMatchLive(match), [match.status, match.rawStatus, match.isLive]);
  const finished = useMemo(() => isMatchFinished(match), [match.status, match.rawStatus, match.isFinished]);
  const scheduled = useMemo(() => isMatchScheduled(match), [match.homeScore, live, finished]);

  const timeStr = useMemo(() => match.kickoff || (match.date ? new Date(match.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''), [match.kickoff, match.date]);
  const dateStr = useMemo(() => match.date ? new Date(match.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '', [match.date]);
  
  const lc = match.league?.color || '#10b981';
  const hasProbs = showProb && match.homeWinProb != null;
  const hasOdds = showOdds && match.homeOdds;
  const cf = useMemo(() => hasProbs ? getConfidence(match.homeWinProb, match.drawProb, match.awayWinProb) : null, [hasProbs, match.homeWinProb, match.drawProb, match.awayWinProb]);

  // ★ FIXED: Guard against false 0-0 from API defaults.
  const predicted = useMemo(() => {
    if (match.predictedHomeScore != null && match.predictedAwayScore != null) {
      return { home: match.predictedHomeScore, away: match.predictedAwayScore };
    }
    return undefined;
  }, [match.predictedHomeScore, match.predictedAwayScore]);

  const actual = useMemo(() => {
    if (!finished) return undefined;
    // Priority 1: Explicit actual scores from prediction results
    if (match.actualHomeScore != null && match.actualAwayScore != null) {
      return { home: match.actualHomeScore, away: match.actualAwayScore };
    }
    // Priority 2: Match scores — but reject false 0-0 defaults
    if (match.homeScore != null && match.awayScore != null) {
      const bothZero = match.homeScore === 0 && match.awayScore === 0;
      const hasMinute = match.minute != null || match.elapsed != null;
      // 0-0 with no minute data = likely an API default, not a real result
      if (bothZero && !hasMinute) return undefined;
      return { home: match.homeScore, away: match.awayScore };
    }
    return undefined;
  }, [finished, match.actualHomeScore, match.actualAwayScore, match.homeScore, match.awayScore, match.minute, match.elapsed]);

  const oddsData = useMemo(() => [
    { label: 'Home', value: match.homeOdds, key: 'home' },
    { label: 'Draw', value: match.drawOdds, key: 'draw' },
    { label: 'Away', value: match.awayOdds, key: 'away' },
  ], [match.homeOdds, match.drawOdds, match.awayOdds]);

  const borderClass = kickOff ? 'mc-ko-glow' : live ? 'mc-live-border' : '';
  const statusLabel = live ? 'LIVE' : finished ? 'FT' : scheduled ? '' : match.status || '';
  const statusCls = live ? 'live' : finished ? 'finished' : 'upcoming';

  const handleClick = useCallback(() => { 
    if (onClick) onClick(match); 
  }, [onClick, match]);

  const interactive = !!onClick;

  if (compact) {
    return (
      <div className={`mc-card mc-interactive ${borderClass} ${goalFlash ? 'mc-goal-flash' : ''}`} onClick={handleClick} style={{ animationDelay: `${index * 30}ms` }}>
        {live && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, #ef4444, transparent)', opacity: .5 }} />}
        <div className="mc-header" style={{ paddingBottom: 6 }}>
          <div className="mc-league">
            {match.league?.emblem && <img className="mc-league-logo" src={match.league.emblem} alt="" />}
            {!match.league?.emblem && <span className="mc-league-dot" style={{ background: lc }} />}
            <span>{match.league?.name || 'Other'}</span>
          </div>
          {statusLabel && (
            <span className={`mc-status-badge ${statusCls}`}>
              {live && <span className="mc-live-dot" />}
              {statusLabel}
            </span>
          )}
          {!live && !finished && <span style={{ fontSize: '.76rem', color: '#64748b', fontWeight: 600 }}>{timeStr}</span>}
        </div>
        <div className="mc-body" style={{ padding: '10px 16px 12px' }}>
          <div className="mc-team">
            <TeamBadge logo={match.homeTeam?.logo} name={match.homeTeam?.name} color={match.homeTeam?.color} abbr={match.homeTeam?.abbr} />
            <span className="mc-team-name" style={{ fontSize: '.82rem' }}>{match.homeTeam?.name || 'TBD'}</span>
          </div>
          <ScoreDisplay predicted={predicted} actual={actual} isLive={live} isFinished={finished} isScheduled={scheduled} timeStr={timeStr} goalFlash={goalFlash} scoreKey={scoreKey} />
          <div className="mc-team away">
            <TeamBadge logo={match.awayTeam?.logo} name={match.awayTeam?.name} color={match.awayTeam?.color} abbr={match.awayTeam?.abbr} />
            <span className="mc-team-name" style={{ fontSize: '.82rem' }}>{match.awayTeam?.name || 'TBD'}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`mc-card ${interactive ? 'mc-interactive' : ''} ${borderClass} ${goalFlash ? 'mc-goal-flash' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {live && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, #ef4444, transparent)', opacity: .5, zIndex: 1 }} />}

      {kickOff && (
        <div style={{ position: 'absolute', top: 8, right: 12, zIndex: 2 }}>
          <span className="mc-ko-badge" style={{ fontSize: '.58rem', fontWeight: 800, color: '#10b981', background: 'rgba(16,185,129,.12)', padding: '2px 8px', borderRadius: 5, letterSpacing: '.05em' }}>
            KICK OFF
          </span>
        </div>
      )}

      <div className="mc-header">
        <div className="mc-league">
          {match.league?.emblem && <img className="mc-league-logo" src={match.league.emblem} alt="" />}
          {!match.league?.emblem && <span className="mc-league-dot" style={{ background: lc }} />}
          <span>{match.league?.name || 'Other'}</span>
          {match.leagueCountry && <span style={{ opacity: .5 }}>· {match.leagueCountry}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {statusLabel && (
            <span className={`mc-status-badge ${statusCls}`}>
              {live && <span className="mc-live-dot" />}
              {statusLabel}
            </span>
          )}
          {live && match.minute != null && <span className="mc-minute">{match.minute}&apos;</span>}
          {!live && !finished && <span style={{ fontSize: '.68rem', color: '#64748B', fontWeight: 500 }}>{dateStr} · {timeStr}</span>}
          {hovered && cf && <span className="mc-confidence mc-conf-slide" style={{ color: cf.color, background: `${cf.color}15` }}>{cf.label}</span>}
        </div>
      </div>

      <div className="mc-body">
        <div className="mc-team">
          <TeamBadge logo={match.homeTeam?.logo} name={match.homeTeam?.name} color={match.homeTeam?.color} abbr={match.homeTeam?.abbr} />
          <span className="mc-team-name">{match.homeTeam?.name || 'TBD'}</span>
        </div>
        <ScoreDisplay predicted={predicted} actual={actual} isLive={live} isFinished={finished} isScheduled={scheduled} timeStr={timeStr} goalFlash={goalFlash} scoreKey={scoreKey} />
        <div className="mc-team away">
          <TeamBadge logo={match.awayTeam?.logo} name={match.awayTeam?.name} color={match.awayTeam?.color} abbr={match.awayTeam?.abbr} />
          <span className="mc-team-name">{match.awayTeam?.name || 'TBD'}</span>
        </div>
      </div>

      {hasProbs && (
        <div className="mc-probs">
          <ProbBar label="Home" value={match.homeWinProb} type="home" delay={0} />
          <ProbBar label="Draw" value={match.drawProb} type="draw" delay={80} />
          <ProbBar label="Away" value={match.awayWinProb} type="away" delay={160} />
        </div>
      )}

      {hasOdds && (
        <div className="mc-odds">
          {oddsData.map((o) => (
            <div key={o.key} className="mc-odds-chip">
              <div className="mc-odds-chip-label">{o.label}</div>
              <div className="mc-odds-chip-value">{o.value}</div>
            </div>
          ))}
        </div>
      )}

      {finished && match.referee && (
        <div className="mc-meta">
          <span>⚽ {match.referee}</span>
        </div>
      )}
    </div>
  );
};

// ★ Export as memo to prevent unnecessary re-renders
export default memo(MatchCardBase);