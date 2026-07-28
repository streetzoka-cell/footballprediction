import React, { useState, useEffect, useMemo, memo } from 'react';
import { Link } from 'react-router-dom';
import { Brain, Flame, Target, TrendingUp, Loader, ChevronRight } from 'lucide-react';
import { useFixtures } from '../hooks/useFixtures';
import { todayStr, yesterdayStr, tomorrowStr } from '../utils/dates';
import { isLiveStatus, isFinishedStatus, SPORT } from '../utils/constants';
import SEO from '../components/SEO';
import { ListSkeleton, ErrorState } from '../components/StateFeedback';
import EmptyState from '../components/EmptyState';

// Helper functions directly related to UI display only
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

const ScoreDisplay = memo(({ predicted, actual, isLive, isFinished, isScheduled, timeStr, goalFlash, scoreKey }) => {
  if (isScheduled) return <div className="mc-time-display">{timeStr || '--:--'}</div>;

  const hasActual = actual && actual.home != null && actual.away != null;
  const hasPredicted = predicted && predicted.home != null && predicted.away != null;

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

const MatchCardBase = memo(({ match, showOdds = true, showProb = true, compact = false, goalFlash = false, kickOff = false, scoreKey = null, onClick, index = 0 }) => {
  const [hovered, setHovered] = useState(false);

  // ★ Clean usage of normalized properties from matchEngine
  const live = useMemo(() => isLiveStatus(match.status, SPORT.FOOTBALL) || !!match.isLive, [match.status, match.isLive]);
  const finished = useMemo(() => isFinishedStatus(match.status, SPORT.FOOTBALL) || !!match.isFinished, [match.status, match.isFinished]);
  const scheduled = useMemo(() => !live && !finished && (match.homeScore == null), [match.homeScore, live, finished]);

  const displayMinute = match.displayMinute || 0;
  const timeStr = match.kickoff;
  const dateStr = match.dateStr; 

  const lc = '#10b981';
  const hasProbs = showProb && match.homeWinProb != null;
  const hasOdds = showOdds && match.homeOdds;
  const cf = useMemo(() => hasProbs ? getConfidence(match.homeWinProb, match.drawProb, match.awayWinProb) : null, [hasProbs, match.homeWinProb, match.drawProb, match.awayWinProb]);

  const predicted = useMemo(() => {
    if (match.predictedHomeScore != null && match.predictedAwayScore != null) return { home: match.predictedHomeScore, away: match.predictedAwayScore };
    return undefined;
  }, [match.predictedHomeScore, match.predictedAwayScore]);

  const actual = useMemo(() => {
    const rawHomeScore = match.homeScore;
    const rawAwayScore = match.awayScore;

    if (finished && rawHomeScore != null && rawAwayScore != null) return { home: rawHomeScore, away: rawAwayScore };
    if (live || match.isStarted) return { home: rawHomeScore ?? 0, away: rawAwayScore ?? 0 };
    return undefined;
  }, [finished, live, match.isStarted, match.homeScore, match.awayScore]);

  const oddsData = useMemo(() => [
    { label: '1', value: match.homeOdds, key: 'home' },
    { label: 'X', value: match.drawOdds, key: 'draw' },
    { label: '2', value: match.awayOdds, key: 'away' },
  ], [match.homeOdds, match.drawOdds, match.awayOdds]);

  const borderClass = kickOff ? 'mc-ko-glow' : live ? 'mc-live-border' : '';
  const statusLabel = finished ? 'FT' : scheduled ? '' : match.status || '';
  const statusCls = live ? 'live' : finished ? 'finished' : 'upcoming';

  const handleClick = () => { if (onClick) onClick(match); };
  const interactive = !!onClick;

  const homeTeamName = match.homeName;
  const awayTeamName = match.awayName;
  const homeTeamLogo = match.homeLogo;
  const awayTeamLogo = match.awayLogo;

  return (
    <div
      className={`mc-card ${interactive ? 'mc-interactive' : ''} ${borderClass} ${goalFlash ? 'mc-goal-flash' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {live && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, #ef4444, transparent)', opacity: .5, zIndex: 1 }} />}

      <div className="mc-header">
        <div className="mc-league">
          {match.leagueLogo && <img className="mc-league-logo" src={match.leagueLogo} alt="" />}
          {!match.leagueLogo && <span className="mc-league-dot" style={{ background: lc }} />}
          <span>{match.leagueName}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {statusLabel && (
            <span className={`mc-status-badge ${statusCls}`}>
              {live && <span className="mc-live-dot" />}
              {statusLabel}
            </span>
          )}
          {live && displayMinute != null && <span className="mc-minute">{displayMinute}&apos;</span>}
          {!live && !finished && <span style={{ fontSize: '.68rem', color: '#64748B', fontWeight: 500 }}>{dateStr} · {timeStr}</span>}
          {hovered && cf && <span className="mc-confidence mc-conf-slide" style={{ color: cf.color, background: `${cf.color}15` }}>{cf.label}</span>}
        </div>
      </div>

      <div className="mc-body">
        <div className="mc-team">
          <TeamBadge logo={homeTeamLogo} name={homeTeamName} color={match.homeTeam?.color} abbr={match.homeTeam?.abbr} />
          <span className="mc-team-name">{homeTeamName}</span>
        </div>
        <ScoreDisplay predicted={predicted} actual={actual} isLive={live} isFinished={finished} isScheduled={scheduled} timeStr={timeStr} goalFlash={goalFlash} scoreKey={scoreKey} />
        <div className="mc-team away">
          <TeamBadge logo={awayTeamLogo} name={awayTeamName} color={match.awayTeam?.color} abbr={match.awayTeam?.abbr} />
          <span className="mc-team-name">{awayTeamName}</span>
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
    </div>
  );
});

export default function MasterGames() {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const { data: rawFixtures = [], isLoading, error } = useFixtures(selectedDate);
  
  // ★ Hooks return normalized data directly. No mapping needed here.
  const allMatches = useMemo(() => rawFixtures.filter(m => m.dateStr === selectedDate), [rawFixtures, selectedDate]);

  // Smart Filtering: Only include matches that are Featured OR have AI Probabilities OR High MatchScore
  const smartMatches = useMemo(() => {
    return allMatches.filter(m => 
      m.category === 'FEATURED' || 
      m.homeWinProb != null || 
      m.matchScore > 50
    ).sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  }, [allMatches]);

  // Categorize for display
  const highConf = smartMatches.filter(m => Math.max(m.homeWinProb || 0, m.awayWinProb || 0) >= 55);
  const medConf = smartMatches.filter(m => {
    const max = Math.max(m.homeWinProb || 0, m.awayWinProb || 0);
    return max >= 40 && max < 55;
  });
  const otherSmart = smartMatches.filter(m => Math.max(m.homeWinProb || 0, m.awayWinProb || 0) < 40);

  const isToday = selectedDate === todayStr();
  const isYesterday = selectedDate === yesterdayStr();
  const isTomorrow = selectedDate === tomorrowStr();

  if (error && smartMatches.length === 0) {
    return (
      <div className="zoka-page">
        <SEO title="Football AI Predictions" />
        <div className="zoka-wrap" style={{ paddingTop: '20px' }}>
          <ErrorState error={error} />
        </div>
      </div>
    );
  }

  return (
    <div className="zoka-page">
      <SEO 
        title="Football AI Predictions, Smart Value Picks & Match Intelligence" 
        description="Discover high-value football matches, AI predictions, and deep statistical insights on ZOKA. Filter out the noise and focus on the smartest matches today." 
        keywords="AI football predictions, smart value bets, match intelligence, ZOKA predictions" 
        robots="index,follow" 
      />

      <div className="zoka-wrap">
        <div className="zoka-hdr">
          <div className="zoka-hdr-title">
            <h1><Brain size={18} style={{ color: '#10b981' }} /> Zoka <span>Intelligence</span></h1>
            <div className="zoka-hdr-sub">{smartMatches.length} Smart Matches Found</div>
          </div>
        </div>

        <div className="zoka-datenav">
          <button className={`zoka-nav-btn ${isYesterday ? 'active' : ''}`} onClick={() => setSelectedDate(yesterdayStr())}>Yesterday</button>
          <button className={`zoka-nav-btn ${isToday ? 'active' : ''}`} onClick={() => setSelectedDate(todayStr())}>Today</button>
          <button className={`zoka-nav-btn ${isTomorrow ? 'active' : ''}`} onClick={() => setSelectedDate(tomorrowStr())}>Tomorrow</button>
        </div>

        {isLoading && smartMatches.length === 0 ? (
          <ListSkeleton count={5} />
        ) : smartMatches.length === 0 ? (
          <EmptyState 
            icon={Brain} 
            title="No smart matches or AI predictions available for this date." 
            hint="Check back later or view all standard fixtures." 
            action={
              <Link to="/fixtures" className="zoka-cta" style={{ display: 'inline-block', marginTop: 16, padding: '10px 20px', borderRadius: 8, background: 'rgba(16,185,129,.1)', color: '#10b981', textDecoration: 'none', fontWeight: 700, fontSize: '.85rem' }}>
                View All Fixtures <ChevronRight size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
              </Link>
            }
          />
        ) : (
          <>
            {highConf.length > 0 && (
              <div className="zoka-section">
                <div className="zoka-league-hd">
                  <Flame size={18} style={{ color: '#ef4444' }} />
                  <span className="zoka-league-name">High Confidence Value</span>
                </div>
                {highConf.map((m, i) => <MatchCardBase key={m.id} match={m} index={i} />)}
              </div>
            )}

            {medConf.length > 0 && (
              <div className="zoka-section">
                <div className="zoka-league-hd">
                  <Target size={18} style={{ color: '#fbbf24' }} />
                  <span className="zoka-league-name">Medium Confidence</span>
                </div>
                {medConf.map((m, i) => <MatchCardBase key={m.id} match={m} index={i} />)}
              </div>
            )}

            {otherSmart.length > 0 && (
              <div className="zoka-section">
                <div className="zoka-league-hd">
                  <TrendingUp size={18} style={{ color: '#3b82f6' }} />
                  <span className="zoka-league-name">Smart Featured Matches</span>
                </div>
                {otherSmart.map((m, i) => <MatchCardBase key={m.id} match={m} index={i} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}