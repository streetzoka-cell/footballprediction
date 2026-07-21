import { useEffect, useState, useMemo, memo } from 'react';

/* ═══════════════════════════════════════════════════════════════
   STYLE INJECTION (Module-level - Runs once)
   ═══════════════════════════════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('mc-pro-v1')) return;
  const s = document.createElement('style');
  s.id = 'mc-pro-v1';
  s.textContent = `
    @keyframes mc_livePulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.15;transform:scale(2.5)}}
    @keyframes mc_liveGlow{0%,100%{border-color:rgba(239,68,68,.15);box-shadow:0 0 8px rgba(239,68,68,.02),inset 0 1px 0 rgba(239,68,68,.06)}50%{border-color:rgba(239,68,68,.4);box-shadow:0 0 22px rgba(239,68,68,.08),inset 0 1px 0 rgba(239,68,68,.12)}}
    @keyframes mc_koGlow{0%{border-color:rgba(0,230,118,.55);box-shadow:0 0 30px rgba(0,230,118,.15),inset 0 1px 0 rgba(0,230,118,.1)}100%{border-color:rgba(239,68,68,.15);box-shadow:0 0 8px rgba(239,68,68,.02),inset 0 1px 0 rgba(239,68,68,.06)}}
    @keyframes mc_koBadge{0%{opacity:0;transform:scale(.6) translateY(4px)}12%{opacity:1;transform:scale(1.1) translateY(0)}80%{opacity:1;transform:scale(1) translateY(0)}100%{opacity:0;transform:scale(.85) translateY(-4px)}}
    @keyframes mc_goalFlash{0%{background:rgba(0,230,118,.2)}100%{background:transparent}}
    @keyframes mc_scorePop{0%{transform:scale(.85);opacity:.5}50%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
    @keyframes mc_slideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    @keyframes mc_fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes mc_exactPop{0%{transform:scale(0) rotate(-8deg);opacity:0}55%{transform:scale(1.2) rotate(2deg)}100%{transform:scale(1) rotate(0);opacity:1}}
    @keyframes mc_confidenceSlide{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:translateX(0)}}
    @keyframes mc_oddsHover{from{transform:translateY(0)}to{transform:translateY(-2px)}}
    @keyframes mc_shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}

    .mc-goal-flash{animation:mc_goalFlash 2.2s ease-out both}
    .mc-score-pop{animation:mc_scorePop .35s cubic-bezier(.22,1,.36,1) both}
    .mc-exact-pop{animation:mc_exactPop .5s cubic-bezier(.22,1,.36,1) both}
    .mc-ko-glow{animation:mc_koGlow 5s ease-out forwards}
    .mc-ko-badge{animation:mc_koBadge 5s ease-out forwards;pointer-events:none}
    .mc-live-border{animation:mc_liveGlow 2s ease-in-out infinite}
    .mc-conf-slide{animation:mc_confidenceSlide .25s ease both}
    .mc-skel{background:linear-gradient(90deg,var(--bg-surface,#0a0d14) 25%,var(--bg-card,#111827) 50%,var(--bg-surface,#0a0d14) 75%);background-size:200% 100%;animation:mc_shimmer 1.5s ease-in-out infinite;border-radius:6px}

    .mc-card{
      position:relative;background:var(--bg-card,#0a0d14);border:1px solid var(--border,#151b26);
      border-radius:12px;overflow:hidden;min-width:0;
      transition:all .22s cubic-bezier(.22,1,.36,1);cursor:default;
    }
    .mc-card:hover{border-color:rgba(16,185,129,.15);transform:translateY(-1px);box-shadow:0 8px 24px rgba(0,0,0,.3)}
    .mc-card.mc-interactive{cursor:pointer}
    .mc-card.mc-interactive:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(0,0,0,.4)}

    .mc-header{display:flex;align-items:center;justify-content:space-between;padding:10px 16px 0;gap:8px;flex-wrap:wrap}
    .mc-league{display:inline-flex;align-items:center;gap:6px;font-size:.7rem;font-weight:600;color:var(--text-muted,#64748b);min-width:0}
    .mc-league-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
    .mc-league-logo{width:14px;height:14px;border-radius:3px;object-fit:contain;flex-shrink:0}
    .mc-league span {white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

    .mc-body{display:flex;align-items:center;padding:14px 16px;gap:12px}
    .mc-team{flex:1;min-width:0;display:flex;align-items:center;gap:10px}
    .mc-team.away{flex-direction:row-reverse;text-align:right}
    .mc-team-badge{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:.68rem;font-weight:800;color:#fff;flex-shrink:0;overflow:hidden;position:relative}
    .mc-team-badge img{width:100%;height:100%;object-fit:contain;position:absolute;inset:0;z-index:1}
    .mc-team-badge .abbr{position:relative;z-index:0}
    .mc-team-name{font-size:.84rem;font-weight:600;color:var(--text-primary,#f8fafc);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2;min-width:0}

    .mc-score-area{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:80px;flex-shrink:0}
    .mc-score-row{display:flex;align-items:center;gap:6px}
    .mc-score-box{
      width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;
      font-family:var(--font-display,system-ui);font-size:1rem;font-weight:800;line-height:1;
      border:1.5px solid var(--border,#151b26);background:rgba(255,255,255,.02);
      transition:all .3s cubic-bezier(.22,1,.36,1);
    }
    .mc-score-sep{color:var(--text-muted,#64748b);font-size:.8rem;font-weight:700}
    .mc-score-label{font-size:.6rem;font-weight:600;color:var(--text-muted,#64748b);text-transform:uppercase;letter-spacing:.04em}

    .mc-time-display{font-family:var(--font-display,system-ui);font-size:.95rem;font-weight:700;color:var(--text-muted,#64748b);text-align:center;padding:6px 0}

    .mc-status-badge{display:inline-flex;align-items:center;gap:4px;font-size:.64rem;font-weight:700;padding:2px 8px;border-radius:5px;letter-spacing:.02em;flex-shrink:0}
    .mc-status-badge.live{color:#ef4444;background:rgba(239,68,68,.1)}
    .mc-status-badge.upcoming{color:var(--text-muted,#64748b);background:rgba(255,255,255,.04)}
    .mc-status-badge.finished{color:#10b981;background:rgba(16,185,129,.08)}
    .mc-live-dot{width:6px;height:6px;border-radius:50%;background:#ef4444;animation:mc_livePulse 1.2s ease-in-out infinite;flex-shrink:0}
    .mc-minute{font-family:var(--font-display,system-ui);font-size:.68rem;font-weight:700;color:#ef4444}

    .mc-pred-row{display:flex;align-items:center;gap:5px;font-size:.64rem;color:var(--text-muted,#64748b);font-weight:500}
    .mc-exact-tag{color:#10b981;font-weight:700;letter-spacing:.03em}

    .mc-probs{padding:0 16px 12px;display:flex;flex-direction:column;gap:5px}
    .mc-prob-row{display:flex;align-items:center;gap:8px}
    .mc-prob-label{width:36px;font-size:.66rem;font-weight:600;text-align:right;flex-shrink:0}
    .mc-prob-track{flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,.04);overflow:hidden;min-width:0}
    .mc-prob-fill{height:100%;border-radius:3px;transition:width .9s cubic-bezier(.22,1,.36,1)}
    .mc-prob-fill.home{background:#10b981}
    .mc-prob-fill.draw{background:#fbbf24}
    .mc-prob-fill.away{background:#60a5fa}
    .mc-prob-value{width:34px;font-size:.68rem;font-weight:700;text-align:left;font-family:var(--font-display,system-ui);flex-shrink:0}

    .mc-odds{display:flex;gap:6px;padding:0 16px 14px}
    .mc-odds-chip{
      flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0;
      padding:8px 4px;border-radius:8px;border:1px solid var(--border,#151b26);
      background:rgba(255,255,255,.015);transition:all .2s cubic-bezier(.22,1,.36,1);cursor:default;
    }
    .mc-odds-chip:hover{border-color:rgba(16,185,129,.25);background:rgba(16,185,129,.04);transform:translateY(-1px)}
    .mc-odds-chip-label{font-size:.6rem;font-weight:600;color:var(--text-muted,#64748b);text-transform:uppercase;letter-spacing:.04em}
    .mc-odds-chip-value{font-family:var(--font-display,system-ui);font-size:.92rem;font-weight:800;color:var(--text-primary,#f8fafc)}

    .mc-meta{padding:0 16px 12px;display:flex;gap:16px;font-size:.66rem;color:var(--text-muted,#64748b);font-weight:500}
    .mc-confidence{display:inline-flex;align-items:center;gap:4px;font-size:.64rem;font-weight:700;padding:2px 8px;border-radius:8px;letter-spacing:.03em}
  `;
  document.head.appendChild(s);
};
// Execute immediately at module level
injectStyles();

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

const TeamBadge = ({ logo, name, color, abbr }) => {
  const fallback = color || '#1a1f2b';
  const initials = abbr || (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
  return (
    <div className="mc-team-badge" style={{ background: fallback }}>
      {logo ? <img src={logo} alt="" loading="lazy" /> : <span className="abbr">{initials}</span>}
    </div>
  );
};

const ScoreDisplay = ({ match, predicted, actual, isLive, isFinished, isScheduled, timeStr, goalFlash, scoreKey }) => {
  if (isScheduled) return <div className="mc-time-display">{timeStr || '--:--'}</div>;

  const h = actual ? actual.home : (predicted?.home ?? '?');
  const a = actual ? actual.away : (predicted?.away ?? '?');
  const hOk = actual && predicted && predicted.home === actual.home;
  const aOk = actual && predicted && predicted.away === actual.away;
  const bothOk = hOk && aOk;
  const isFlash = goalFlash;
  const isPredOnly = !actual && predicted;

  return (
    <div className={`mc-score-area ${isFlash ? 'mc-goal-flash' : ''}`}>
      <div className={`mc-score-row ${scoreKey === 'changed' ? 'mc-score-pop' : ''}`}>
        <div className="mc-score-box" style={{ borderColor: hOk ? '#10b981' : isPredOnly ? 'rgba(16,185,129,.25)' : '#151b26', color: isLive ? '#ef4444' : isFinished ? '#f8fafc' : isPredOnly ? '#10b981' : '#64748b', boxShadow: hOk ? '0 0 10px rgba(16,185,129,.2)' : 'none' }}>{h}</div>
        <span className="mc-score-sep">-</span>
        <div className="mc-score-box" style={{ borderColor: aOk ? '#10b981' : isPredOnly ? 'rgba(16,185,129,.25)' : '#151b26', color: isLive ? '#ef4444' : isFinished ? '#f8fafc' : isPredOnly ? '#10b981' : '#64748b', boxShadow: aOk ? '0 0 10px rgba(16,185,129,.2)' : 'none' }}>{a}</div>
      </div>
      {predicted && (
        <div className="mc-pred-row">
          <span>Pred: {predicted.home}-{predicted.away}</span>
          {bothOk && <span className="mc-exact-tag mc-exact-pop">✓ EXACT</span>}
        </div>
      )}
      {!predicted && !isScheduled && <div className="mc-score-label">{isLive ? 'LIVE' : isFinished ? 'FT' : ''}</div>}
    </div>
  );
};

const ProbBar = ({ label, value, type, delay = 0 }) => {
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
};

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT (Memoized)
   ═══════════════════════════════════════════════════════════════ */
const MatchCardBase = ({
  match, showOdds = true, showProb = true, compact = false,
  goalFlash = false, kickOff = false, scoreKey = null,
  onClick, index = 0,
}) => {
  const [hovered, setHovered] = useState(false);

  const live = isMatchLive(match);
  const finished = isMatchFinished(match);
  const scheduled = isMatchScheduled(match);
  const timeStr = match.kickoff || (match.date ? new Date(match.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
  const dateStr = match.date ? new Date(match.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
  const lc = match.league?.color || '#10b981';
  const hasProbs = showProb && match.homeWinProb != null;
  const hasOdds = showOdds && match.homeOdds;
  const cf = hasProbs ? getConfidence(match.homeWinProb, match.drawProb, match.awayWinProb) : null;

  const predicted = match.predictedHomeScore != null ? { home: match.predictedHomeScore, away: match.predictedAwayScore } : undefined;
  const actual = (finished && match.actualHomeScore != null) ? { home: match.actualHomeScore, away: match.actualAwayScore } : (finished && match.homeScore != null) ? { home: match.homeScore, away: match.awayScore } : undefined;

  const oddsData = useMemo(() => [
    { label: 'Home', value: match.homeOdds, key: 'home' },
    { label: 'Draw', value: match.drawOdds, key: 'draw' },
    { label: 'Away', value: match.awayOdds, key: 'away' },
  ], [match.homeOdds, match.drawOdds, match.awayOdds]);

  const borderClass = kickOff ? 'mc-ko-glow' : live ? 'mc-live-border' : '';
  const statusLabel = live ? 'LIVE' : finished ? 'FT' : scheduled ? '' : match.status || '';
  const statusCls = live ? 'live' : finished ? 'finished' : 'upcoming';

  const handleClick = () => { if (onClick) onClick(match); };
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
          <ScoreDisplay match={match} predicted={predicted} actual={actual} isLive={live} isFinished={finished} isScheduled={scheduled} timeStr={timeStr} goalFlash={goalFlash} scoreKey={scoreKey} />
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
          {!live && !finished && <span style={{ fontSize: '.68rem', color: '#64748b', fontWeight: 500 }}>{dateStr} · {timeStr}</span>}
          {hovered && cf && <span className="mc-confidence mc-conf-slide" style={{ color: cf.color, background: `${cf.color}15` }}>{cf.label}</span>}
        </div>
      </div>

      <div className="mc-body">
        <div className="mc-team">
          <TeamBadge logo={match.homeTeam?.logo} name={match.homeTeam?.name} color={match.homeTeam?.color} abbr={match.homeTeam?.abbr} />
          <span className="mc-team-name">{match.homeTeam?.name || 'TBD'}</span>
        </div>
        <ScoreDisplay match={match} predicted={predicted} actual={actual} isLive={live} isFinished={finished} isScheduled={scheduled} timeStr={timeStr} goalFlash={goalFlash} scoreKey={scoreKey} />
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