import { Link } from 'react-router-dom';
import { ArrowLeft, Loader, Zap, TrendingUp, Camera, Clock, Sparkles, Flame, Star, BarChart3, Target, Trophy, Brain } from 'lucide-react';
import SEO from '../components/SEO';
import { useFixtures } from '../hooks/useFixtures';
import { todayStr, getLocalDateStr, formatTime } from '../utils/dates';
import { buildMatchRoute, buildTeamRoute, buildLeagueRoute } from '../utils/routes';
import { applySmartMinute } from '../engine/matchEngine';
import { useState, useEffect, useMemo } from 'react';

function useNow(interval = 10000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

export default function MasterGames() {
  const now = useNow(10000);
  const { data: todayFx = [], isLoading } = useFixtures(todayStr());
  const { data: tomFx = [] } = useFixtures(getLocalDateStr(1));
  const { data: yestFx = [] } = useFixtures(getLocalDateStr(-1));

  const all = useMemo(() => [...yestFx, ...todayFx, ...tomFx], [yestFx, todayFx, tomFx]);
  const enriched = useMemo(() => all.map(m => applySmartMinute(m, now)), [all, now]);

  const todayMatches = useMemo(
    () => enriched.filter(m => m?.date && todayStr() === (m.date?.slice(0, 10))),
    [enriched]
  );

  const { elitePicks, featuredMatches, moreMatches } = useMemo(() => {
    const isElite = (m) => {
      const c = String(m?.category || '').toUpperCase();
      const conf = String(m?.confidence || '').toUpperCase();
      const rating = Number(m?.rating ?? m?.matchRating ?? 0);
      return c === 'FEATURED' || c === 'HIGH' || c === 'ELITE' || conf === 'HIGH' || rating >= 80;
    };
    const isFeatured = (m) => {
      const c = String(m?.category || '').toUpperCase();
      const conf = String(m?.confidence || '').toUpperCase();
      const rating = Number(m?.rating ?? m?.matchRating ?? 0);
      return c === 'MEDIUM' || conf === 'MEDIUM' || (rating >= 60 && rating < 80);
    };

    const elite = [];
    const featured = [];
    const more = [];

    todayMatches.forEach(m => {
      if (!m || m.isHidden) return;
      if (isElite(m)) elite.push(m);
      else if (isFeatured(m)) featured.push(m);
      else more.push(m);
    });

    return { elitePicks: elite, featuredMatches: featured, moreMatches: more };
  }, [todayMatches]);

  const smartMatchesCount = todayMatches.filter(m => !m.isHidden).length;
  const elitePicksCount = elitePicks.length;
  const featuredCount = featuredMatches.length;

  const avgRating = useMemo(() => {
    const rated = todayMatches
      .map(m => Number(m?.rating ?? m?.matchRating ?? 0))
      .filter(r => !isNaN(r) && r > 0);
    if (!rated.length) return 0;
    return Math.round(rated.reduce((a, b) => a + b, 0) / rated.length);
  }, [todayMatches]);

  const isEmpty = smartMatchesCount === 0 && !isLoading;

  const itemListSchema = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "ZOKASCORE Elite Football Picks & Featured Matches",
    "itemListElement": [...elitePicks, ...featuredMatches].slice(0, 20).map((m, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": `${m.homeName} vs ${m.awayName}`,
      "url": `${window.location.origin}${buildMatchRoute(m.id, m.homeName, m.awayName)}`
    }))
  }), [elitePicks, featuredMatches]);

  return (
    <div className="mg-page">
      <SEO
        title="ZOKASCORE Intelligence — Smart Football Picks & Featured Matches"
        description="Discover today's most important football matches, carefully selected for fans who want more than just fixtures. Elite picks, featured games and match ratings from ZOKASCORE Intelligence."
        keywords="ZOKASCORE Intelligence, smart matches, elite picks, featured fixtures, football match rating, today's football, premium fixtures"
        path="/mastergames"
        robots="index,follow"
        structuredData={itemListSchema}
        breadcrumbs={[
          { name: 'Home', path: '/' },
          { name: 'Master Games', path: '/mastergames' }
        ]}
      />

      <div className="mg-container">
        <Link to="/fixtures" className="mg-back-btn">
          <ArrowLeft size={14} /> Back to Fixtures
        </Link>

        <header className="mg-hero">
          <div className="mg-hero-glow-1" />
          <div className="mg-hero-glow-2" />
          <div className="mg-hero-content">
            <div className="mg-hero-kicker">
              <Sparkles size={16} /> ZOKASCORE · Master Games
            </div>
            <h1 className="mg-hero-title">ZOKASCORE Intelligence</h1>
            <p className="mg-hero-subtitle">
              The home of football's biggest matches, premium opportunities, and the strongest fixtures selected for today's action.
            </p>
          </div>
        </header>

        <section className="mg-stats-grid">
          <StatCard icon={<Zap size={18} />} label="Smart Matches" value={smartMatchesCount} accent="var(--accent)" delay={0} />
          <StatCard icon={<Flame size={18} />} label="Top Picks" value={elitePicksCount} accent="var(--danger)" delay={80} />
          <StatCard icon={<Star size={18} />} label="Featured Games" value={featuredCount} accent="var(--gold)" delay={160} />
          <StatCard icon={<BarChart3 size={18} />} label="Match Rating" value={avgRating ? `${avgRating}%` : '—'} accent="var(--primary)" delay={240} />
        </section>

        {/* ★ SEO GOLD: Proprietary Algorithm Explanation */}
        <section className="mg-info-card">
          <h2 className="mg-info-title flex-center gap-8" style={{justifyContent: 'flex-start'}}><Brain size={20} /> The ZOKASCORE Intelligence Rating System</h2>
          <p className="mg-info-text">
            Not every football match deserves your attention. Our proprietary algorithm scans hundreds of daily global fixtures and assigns a <strong>Match Rating (0-100%)</strong> based on five critical pillars:
          </p>
          <ul className="flex-col gap-8 text-secondary text-sm pl-20 mt-12 mb-12">
            <li><strong className="text-primary">League Importance:</strong> Champions League and Title Deciders score higher than mid-table friendlies.</li>
            <li><strong className="text-primary">Team Momentum:</strong> Matches involving teams on winning streaks or in relegation battles.</li>
            <li><strong className="text-primary">Derby Factor:</strong> Historical rivalries (e.g., El Clásico, North London Derby) receive automatic boosts.</li>
            <li><strong className="text-primary">Statistical Variance:</strong> Games featuring high-scoring teams or volatile defensive records.</li>
            <li><strong className="text-primary">Global Interest:</strong> Real-time search volume and community prediction engagement.</li>
          </ul>
          <p className="mg-info-text muted">Our goal is simple—help you discover the games that matter most, filtering out the noise so you can focus on elite football.</p>
        </section>

        {isLoading && (
          <div className="mg-loading-state">
            <div className="skeleton-card" style={{ width: '100%', height: 100 }} />
          </div>
        )}

        {isEmpty && (
          <div className="mg-empty-state">
            <Clock size={32} className="mg-empty-icon" />
            <h3 className="mg-empty-title">No featured matches available for this day.</h3>
            <p className="mg-empty-text">Check another date or return later as new fixtures become available.</p>
          </div>
        )}

        {elitePicks.length > 0 && <MatchSection title="🔥 Elite Picks (80%+ Rating)" matches={elitePicks} accent="var(--danger)" />}
        {featuredMatches.length > 0 && <MatchSection title="⭐ Featured Matches (60-79% Rating)" matches={featuredMatches} accent="var(--gold)" />}
        {moreMatches.length > 0 && <MatchSection title="📈 More Matches to Watch" matches={moreMatches} accent="var(--primary)" />}

        <footer className="mg-bottom-cta">
          <h3>Football is better when you never miss the biggest moments.</h3>
          <p>
            ZOKASCORE Intelligence helps you discover the matches worth following every day—from title races and derby clashes to hidden gems across leagues around the world.
          </p>
        </footer>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, accent, delay }) {
  return (
    <div className="mg-stat-card" style={{ borderColor: `${accent}30`, animationDelay: `${delay}ms` }}>
      <div className="mg-stat-icon" style={{ background: `${accent}15`, color: accent }}>{icon}</div>
      <div className="mg-stat-val">{value}</div>
      <div className="mg-stat-lbl">{label}</div>
    </div>
  );
}

function MatchSection({ title, matches, accent }) {
  return (
    <section className="mg-section">
      <div className="mg-section-head">
        <span className="mg-section-accent" style={{ background: accent }}></span>
        <h2 className="mg-section-title">{title}</h2>
        <span className="mg-section-count">{matches.length}</span>
      </div>
      <div className="mg-match-list">
        {matches.map((m, i) => <MasterMatchCard key={m.id} match={m} accent={accent} index={i} />)}
      </div>
    </section>
  );
}

function MasterMatchCard({ match, accent, index }) {
  const {
    id, homeName, awayName, homeLogo, awayLogo,
    leagueName, leagueLogo, leagueId, date, kickoff,
    status, isLive, isFinished, isHT, displayMinute, minute,
    homeScore, awayScore, rating, matchRating
  } = match;

  const matchLink = buildMatchRoute(id, homeName, awayName);
  const ratingVal = Number(rating ?? matchRating ?? 0);

  const matchStatus = (status || '').toUpperCase();
  const isPostponed = matchStatus === 'PST' || matchStatus === 'POSTP';
  const isCanceled = matchStatus === 'CANC' || matchStatus === 'ABD';
  const isSuspended = matchStatus === 'SUSP' || matchStatus === 'INT';
  const isSpecialStatus = isPostponed || isCanceled || isSuspended;

  let statusLabel = kickoff || (date ? formatTime(date) : '');
  let statusClass = 'sched';
  
  if (isLive && !isHT && !isSpecialStatus) {
    statusLabel = `LIVE ${displayMinute || minute || 0}'`;
    statusClass = 'live';
  } else if (isHT) {
    statusLabel = 'HT';
    statusClass = 'ht';
  } else if (isFinished) {
    statusLabel = 'FT';
    statusClass = 'ft';
  } else if (isPostponed) {
    statusLabel = 'POSTPONED';
    statusClass = 'warn';
  } else if (isCanceled) {
    statusLabel = 'CANCELED';
    statusClass = 'danger';
  } else if (isSuspended) {
    statusLabel = 'SUSPENDED';
    statusClass = 'warn';
  }

  return (
    <Link to={matchLink} className="mg-match-card" style={{ animationDelay: `${index * 40}ms` }}>
      <div className="mg-card-top">
        <div className="mg-card-league">
          {leagueLogo && <img src={leagueLogo} alt="" />}
          <Link to={buildLeagueRoute(leagueId, leagueName)} onClick={e => e.stopPropagation()} className="mg-league-link">
            {leagueName}
          </Link>
        </div>
        <div className="mg-card-meta">
          {ratingVal > 0 && (
            <span className="mg-rating-badge" style={{ background: `${accent}15`, color: accent, border: `1px solid ${accent}30` }}>
              <Target size={11} /> {ratingVal}%
            </span>
          )}
          <span className={`mg-status-badge ${statusClass}`}>
            {isLive && !isHT && !isSpecialStatus && <span className="mg-live-dot"></span>}
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="mg-card-teams">
        <div className="mg-team-col">
          {homeLogo && <img src={homeLogo} alt={homeName} />}
          <span className="mg-team-name">{homeName}</span>
        </div>
        
        <div className={`mg-score-box ${(isLive || isHT || isFinished) ? 'active' : ''}`}>
          {(isLive || isHT || isFinished) ? `${homeScore ?? 0} : ${awayScore ?? 0}` : 'VS'}
        </div>

        <div className="mg-team-col aw">
          <span className="mg-team-name">{awayName}</span>
          {awayLogo && <img src={awayLogo} alt={awayName} />}
        </div>
      </div>

      <div className="mg-card-footer">
        {date && (
          <span className="mg-date-text">
            <Calendar size={11} /> {new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {formatTime(date)}
          </span>
        )}
      </div>
    </Link>
  );
}