// src/components/MatchCard.jsx
import React, { memo, useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Star, Pin, Camera, Clock, Zap, ChevronRight } from 'lucide-react';
import { buildMatchRoute } from '../utils/routes';
import { formatMinute } from '../engine/matchEngine';

const MatchCard = memo(({ m, i, isFav, isPinned, togglePinMatch, toggleFavorite, handleReactNow }) => {
  // ★ HOOKS FIRST — your original called hooks after `if (!m) return null`,
  //   which breaks React's Rules of Hooks (crash on any null entry).
  const prevScoreRef = useRef({ home: m?.homeScore, away: m?.awayScore });
  const [scoreFlash, setScoreFlash] = useState(false);
  const [goalFlash, setGoalFlash] = useState(false);

  useEffect(() => {
    if (m?.isLive && (prevScoreRef.current.home !== m.homeScore || prevScoreRef.current.away !== m.awayScore)) {
      setScoreFlash(true);
      setGoalFlash(true);
      const t1 = setTimeout(() => setScoreFlash(false), 500);
      const t2 = setTimeout(() => setGoalFlash(false), 2000);
      prevScoreRef.current = { home: m.homeScore, away: m.awayScore };
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [m?.homeScore, m?.awayScore, m?.isLive]);

  if (!m) return null; // guard moved AFTER hooks — same behavior, legal hooks

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
    statusBadge = <span className="status-badge pst">PST</span>;
  } else if (matchStatus === 'CANC' || matchStatus === 'ABD') {
    statusBadge = <span className="status-badge canc">CANC</span>;
  } else if (matchStatus === 'INT' || matchStatus === 'SUSP') {
    statusBadge = <span className="status-badge pst">INT</span>;
  } else if (isHT) {
    statusBadge = <span className="status-badge status-ht">HT</span>;
  } else if (isLive) {
    if (matchStatus === 'ET') statusBadge = <span className="status-badge status-live"><span className="zk-live-pulse-dot" /> {formatMinute(minute, 'ET')}</span>;
    else if (matchStatus === 'P') statusBadge = <span className="status-badge status-live"><span className="zk-live-pulse-dot" /> PEN</span>;
    else statusBadge = <span className="status-badge status-live"><span className="zk-live-pulse-dot" /> {formatMinute(minute, matchStatus)}</span>;
  } else if (isStarted) {
    statusBadge = <span className="status-badge status-upcoming"><Clock size={10} /> STARTED</span>;
  } else if (isSched) {
    statusBadge = <span className="status-badge status-upcoming">{m.kickoff}</span>;
  }

  const hasStats = m.stats && (m.stats.possession || m.stats.shots || m.stats.corners);
  const aiPick = m.mlPredictions?.["1x2"]?.pick;
  const aiProb = m.mlPredictions?.["1x2"]?.pick_probability;
  // Fake-confidence guardrails:
  // - "a pick exists" is not the same as "the backend's strong-pick engine
  //   thinks it's strong" — trust strong_pick.eligible, don't infer it.
  // - "estimated" means the backend had no real data for at least one team
  //   (see fallback_state_from_hash / team_state in the prediction engine).
  //   Say so instead of presenting it identically to a resolved fixture.
  const aiStrong = m.mlPredictions?.strong_pick?.eligible === true;
  const aiEstimated = m.mlPredictions?.team_state === 'estimated';
  const formatPick = (pick) => {
    if (!pick) return null;
    if (pick === 'HOME_WIN') return m.homeName?.split(' ')[0] || 'HOME';
    if (pick === 'AWAY_WIN') return m.awayName?.split(' ')[0] || 'AWAY';
    return pick;
  };

  return (
    <article className={cls} style={{ animationDelay: `${i * 15}ms` }} aria-label={`${m.homeName} vs ${m.awayName}`}>
      {goalFlash && <div className="card-confetti" aria-hidden="true">🎉</div>}
      <header className="zoka-card-top">
        <div className="flex-center gap-4">
          {(m.category === 'FEATURED' || m.mustHave) && isSched && <span className="badge badge-gold">★ TOP</span>}
          {m.pickGroupBadge && <span className="badge">{m.pickGroupBadge}</span>}
          {statusBadge}
        </div>
        <div className="zoka-card-actions">
          {isLive && <button className={`btn-icon-sm ${isPinned ? 'active' : ''}`} onClick={() => togglePinMatch(m.id)} title="Pin"><Pin size={14} fill={isPinned ? 'var(--primary)' : 'none'} /></button>}
          <button className={`btn-icon-sm ${isFav ? 'active' : ''}`} onClick={() => toggleFavorite(m.id)} title="Favourite"><Star size={14} fill={isFav ? 'var(--gold)' : 'none'} /></button>
        </div>
      </header>
      <Link to={matchLink} className="card-link">
        <div className="zoka-teams">
          <div className="zoka-team-col home">
            <div className="zoka-team-row">
              {m.homeLogo && <img className="zoka-crest" src={m.homeLogo} alt="" width="20" height="20" loading="lazy" />}
              <span className="zoka-team-name">{m.homeName}</span>
            </div>
          </div>
          <div className="zoka-score-box">
            {(isLive || isHT || isFt) ? (
              <div className="zoka-scores">
                <span className={`zoka-score-num ${scoreFlash ? 'anim-score-pop' : ''}`}>{m.homeScore ?? '--'}</span>
                <span className="zoka-sep">–</span>
                <span className={`zoka-score-num ${scoreFlash ? 'anim-score-pop' : ''}`}>{m.awayScore ?? '--'}</span>
              </div>
            ) : <span className="zoka-vs">{isStarted ? '--' : 'VS'}</span>}
          </div>
          <div className="zoka-team-col away">
            <div className="zoka-team-row">
              {m.awayLogo && <img className="zoka-crest" src={m.awayLogo} alt="" width="20" height="20" loading="lazy" />}
              <span className="zoka-team-name">{m.awayName}</span>
            </div>
          </div>
          <ChevronRight size={18} className="text-muted ml-4" />
        </div>
        <div className="zoka-comp-row">
          <div className="flex-center gap-4 truncate">
            {m.leagueLogo && <img src={m.leagueLogo} alt="" width="12" height="12" />}
            <span className="truncate">{m.leagueName}</span>
          </div>
          {aiPick && (
            <div
              className={`ai-pick-badge${aiStrong ? ' strong' : ''}`}
              title={aiEstimated ? 'Estimated — limited data for one or both teams' : undefined}
            >
              <Zap size={10} fill="currentColor" />
              {formatPick(aiPick)}{typeof aiProb === 'number' ? ` (${aiProb.toFixed(0)}%)` : ''}
              {aiEstimated && <span className="ai-pick-estimated">~</span>}
            </div>
          )}
        </div>
      </Link>
      {hasStats && (
        <div className="card-stats">
          <div className="flex-between text-muted text-xs">
            <span>{m.stats.possession.home}%</span>
            <div className="stats-bar"><div className="stats-fill" style={{ width: `${m.stats.possession.home}%` }} /></div>
            <span>{m.stats.possession.away}%</span>
          </div>
        </div>
      )}
      <footer className="card-footer">
        <button onClick={() => handleReactNow(m)} className="btn btn-ghost btn-sm"><Camera size={12} /> React</button>
      </footer>
    </article>
  );
});

export default MatchCard;