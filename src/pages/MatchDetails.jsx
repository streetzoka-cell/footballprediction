import { Link } from 'react-router-dom';
import { ArrowLeft, Calendar, Loader, Zap, TrendingUp, Camera, Clock, Sparkles, Flame, Star, BarChart3, Target, Trophy } from 'lucide-react';
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

  // Apply smart minute to live matches
  const enriched = useMemo(
    () => all.map(m => applySmartMinute(m, now)),
    [all, now]
  );

  // Only today's matches are considered for the Master Games board
  const todayMatches = useMemo(
    () => enriched.filter(m => m?.date && todayStr() === (m.date?.slice(0, 10))),
    [enriched]
  );

  // Categorization: Elite Picks / Featured Matches / More Matches to Watch
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

  // Statistics Cards values
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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)', color: '#fff' }} className="zoka-page">
      <SEO
        title="ZOKASCORE Intelligence — Smart Football Picks & Featured Matches"
        description="Discover today's most important football matches, carefully selected for fans who want more than just fixtures. Elite picks, featured games and match ratings from ZOKASCORE Intelligence."
        keywords="ZOKASCORE Intelligence, smart matches, elite picks, featured fixtures, football match rating, today's football, premium fixtures"
        path="/mastergames"
        robots="index,follow"
        breadcrumbs={[
          { name: 'Home', path: '/' },
          { name: 'Master Games', path: '/mastergames' }
        ]}
      />

      <div className="zoka-wrap" style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 80px' }}>
        <Link
          to="/fixtures"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--text-muted)',
            textDecoration: 'none',
            fontSize: '.85rem',
            marginBottom: 20,
            background: 'var(--bg-card)',
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid var(--border)'
          }}
        >
          <ArrowLeft size={14} /> Back to Fixtures
        </Link>

        {/* ───────────── HERO ───────────── */}
        <header
          className="mg-hero"
          style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(16,185,129,0.08))',
            border: '1px solid var(--border)',
            borderRadius: 18,
            padding: '34px 26px',
            marginBottom: 22,
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -60,
              right: -60,
              width: 220,
              height: 220,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(251,191,36,0.12), transparent 70%)',
              pointerEvents: 'none'
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Sparkles size={16} style={{ color: '#fbbf24' }} />
            <span style={{ fontSize: '.7rem', fontWeight: 800, letterSpacing: 1.5, color: '#fbbf24', textTransform: 'uppercase' }}>
              ZOKASCORE · Master Games
            </span>
          </div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, letterSpacing: -0.5, marginBottom: 10, lineHeight: 1.1 }}>
            ZOKASCORE Intelligence
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.6, maxWidth: 640 }}>
            The home of football's biggest matches, premium opportunities, and the strongest fixtures selected for today's action.
          </p>
        </header>

        {/* ───────────── STATISTICS CARDS ───────────── */}
        <section
          className="mg-stats-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 24
          }}
        >
          <StatCard icon={<Zap size={16} />} label="Smart Matches" value={smartMatchesCount} accent="#6366f1" />
          <StatCard icon={<Flame size={16} />} label="Top Picks" value={elitePicksCount} accent="#ef4444" />
          <StatCard icon={<Star size={16} />} label="Featured Games" value={featuredCount} accent="#fbbf24" />
          <StatCard icon={<BarChart3 size={16} />} label="Match Rating" value={avgRating ? `${avgRating}%` : '—'} accent="#10b981" />
        </section>

        {/* ───────────── INFORMATION CARD ───────────── */}
        <section
          className="mg-info-card"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            padding: 22,
            marginBottom: 28
          }}
        >
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Trophy size={18} style={{ color: '#fbbf24' }} /> Why ZOKASCORE Intelligence?
          </h2>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 10 }}>
            Not every football match deserves your attention.
          </p>
          <p style={{ color: 'var(--text-primary)', lineHeight: 1.7, marginBottom: 10 }}>
            ZOKASCORE Intelligence highlights the most exciting fixtures based on match quality, current form, league importance, team momentum, and overall football interest.
          </p>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
            Our goal is simple—help you discover the games that matter most.
          </p>
        </section>

        {/* ───────────── LOADING ───────────── */}
        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
            <Loader size={28} className="animate-spin" style={{ color: '#fbbf24' }} />
          </div>
        )}

        {/* ───────────── EMPTY STATE ───────────── */}
        {isEmpty && (
          <div
            className="mg-empty-state"
            style={{
              background: 'var(--bg-card)',
              border: '1px dashed var(--border)',
              borderRadius: 16,
              padding: '40px 24px',
              textAlign: 'center',
              marginBottom: 28
            }}
          >
            <Clock size={28} style={{ color: '#fbbf24', marginBottom: 12 }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 8 }}>No featured matches available for this day.</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '.9rem', maxWidth: 420, margin: '0 auto' }}>
              Check another date or return later as new fixtures become available.
            </p>
          </div>
        )}

        {/* ───────────── ELITE PICKS ───────────── */}
        {elitePicks.length > 0 && (
          <MatchSection title="🔥 Elite Picks" matches={elitePicks} accent="#ef4444" />
        )}

        {/* ───────────── FEATURED MATCHES ───────────── */}
        {featuredMatches.length > 0 && (
          <MatchSection title="⭐ Featured Matches" matches={featuredMatches} accent="#fbbf24" />
        )}

        {/* ───────────── MORE MATCHES TO WATCH ───────────── */}
        {moreMatches.length > 0 && (
          <MatchSection title="📈 More Matches to Watch" matches={moreMatches} accent="#10b981" />
        )}

        {/* ───────────── BOTTOM SECTION ───────────── */}
        <footer
          className="mg-bottom"
          style={{
            marginTop: 36,
            padding: '26px 22px',
            borderRadius: 16,
            border: '1px solid var(--border)',
            background:
              'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(16,185,129,0.04))',
            textAlign: 'center'
          }}
        >
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 10 }}>
            Football is better when you never miss the biggest moments.
          </h3>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 640, margin: '0 auto', fontSize: '.95rem' }}>
            ZOKASCORE Intelligence helps you discover the matches worth following every day—from title races and derby clashes to hidden gems across leagues around the world.
          </p>
        </footer>
      </div>

      <style>{`
        @keyframes flashBg { 0% { opacity: 1 } 100% { opacity: 0 } }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .4 } }
      `}</style>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */

function StatCard({ icon, label, value, accent }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '16px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: accent }}>
        {icon}
        <span style={{ fontSize: '.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fff' }}>{value}</div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */

function MatchSection({ title, matches, accent }) {
  return (
    <section style={{ marginBottom: 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ width: 4, height: 18, background: accent, borderRadius: 2 }} />
        <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>{title}</h2>
        <span
          style={{
            fontSize: '.7rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            padding: '3px 8px',
            borderRadius: 6,
            marginLeft: 4
          }}
        >
          {matches.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {matches.map(m => (
          <MasterMatchCard key={m.id} match={m} accent={accent} />
        ))}
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────── */

function MasterMatchCard({ match, accent }) {
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
  let statusColor = 'var(--text-muted)';
  if (isLive && !isHT && !isSpecialStatus) {
    statusLabel = `LIVE ${displayMinute || minute || 0}'`;
    statusColor = '#ef4444';
  } else if (isHT) {
    statusLabel = 'HT';
    statusColor = '#fbbf24';
  } else if (isFinished) {
    statusLabel = 'FT';
    statusColor = '#10b981';
  } else if (isPostponed) {
    statusLabel = 'POSTPONED';
    statusColor = '#fbbf24';
  } else if (isCanceled) {
    statusLabel = 'CANCELED';
    statusColor = '#ef4444';
  } else if (isSuspended) {
    statusLabel = 'SUSPENDED';
    statusColor = '#fbbf24';
  }

  return (
    <Link
      to={matchLink}
      style={{
        display: 'block',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '14px 16px',
        textDecoration: 'none',
        color: '#fff',
        transition: 'transform .15s ease, border-color .15s ease',
      }}
      className="mg-match-card"
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        {/* League + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
          {leagueLogo && <img src={leagueLogo} alt="" width="16" height="16" style={{ objectFit: 'contain' }} />}
          <Link
            to={buildLeagueRoute(leagueId, leagueName)}
            onClick={e => e.stopPropagation()}
            style={{
              color: 'var(--text-muted)',
              fontSize: '.7rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {leagueName}
          </Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {ratingVal > 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '.7rem',
                fontWeight: 800,
                color: accent,
                background: `${accent}1a`,
                padding: '3px 8px',
                borderRadius: 6
              }}
            >
              <Target size={11} /> {ratingVal}%
            </span>
          )}
          <span style={{ fontSize: '.7rem', fontWeight: 700, color: statusColor, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {isLive && !isHT && !isSpecialStatus && (
              <span style={{ width: 6, height: 6, background: '#ef4444', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
            )}
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Teams + score */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 10 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {homeLogo && <img src={homeLogo} alt={homeName} width="22" height="22" style={{ objectFit: 'contain' }} />}
          <span style={{ fontWeight: 700, fontSize: '.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{homeName}</span>
        </div>

        <div style={{ fontSize: '1rem', fontWeight: 900, color: isLive ? '#ef4444' : isFinished ? '#10b981' : 'var(--text-muted)' }}>
          {(isLive || isHT || isFinished) ? `${homeScore ?? 0} - ${awayScore ?? 0}` : 'VS'}
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, justifyContent: 'flex-end' }}>
          <span style={{ fontWeight: 700, fontSize: '.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right' }}>{awayName}</span>
          {awayLogo && <img src={awayLogo} alt={awayName} width="22" height="22" style={{ objectFit: 'contain' }} />}
        </div>
      </div>

      {/* Date row */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
        {date && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.7rem', color: 'var(--text-muted)' }}>
            <Calendar size={11} /> {new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {formatTime(date)}
          </span>
        )}
      </div>
    </Link>
  );
}