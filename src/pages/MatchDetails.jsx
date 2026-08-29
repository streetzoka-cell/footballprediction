// src/pages/MatchDetails.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Calendar, Zap, TrendingUp, Clock, Trophy,
  BarChart3, MapPin, Shield, Users, Activity, Brain, ChevronRight,
} from 'lucide-react';

import SEO from '../components/SEO';
import MatchIntelligence from '../components/MatchIntelligence';
import { useFixtures, useStandings } from '../hooks/useFixtures';
import { todayStr, getLocalDateStr, formatTime } from '../utils/dates';
import { buildMatchRoute, buildTeamRoute, buildLeagueRoute } from '../utils/routes';
import { applySmartMinute, normalizeMatch } from '../engine/matchEngine';
import { seoGenerators, buildSEO, howToSchema } from '../utils/seoBuilder';
import { footballApi } from '../services/footballApi';

function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

const useCountdown = (targetDate) => {
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    if (!targetDate) return;
    const calc = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) return setTimeLeft('Starting soon...');
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h}h ${m}m ${s}s`);
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [targetDate]);
  return timeLeft;
};

const StatBar = ({ label, home, away, isPercentage = false }) => {
  if (home == null && away == null) return null;
  const h = Number(home) || 0;
  const a = Number(away) || 0;
  const total = h + a || 1;
  const hPct = (h / total) * 100;
  return (
    <div className="stat-bar-wrap">
      <div className="stat-bar-label">
        <span className="stat-val">{isPercentage ? `${h}%` : h}</span>
        <span className="stat-name">{label}</span>
        <span className="stat-val">{isPercentage ? `${a}%` : a}</span>
      </div>
      <div className="stat-bar-track">
        <div className="stat-bar-home" style={{ width: `${hPct}%` }} />
        <div className="stat-bar-away" style={{ width: `${100 - hPct}%` }} />
      </div>
    </div>
  );
};

/* ★ TBD detector — 'TBD' is truthy, so naive || never replaces it */
const isMissing = (v) => v == null || v === '' || v === 'TBD' || v === 'Unknown';
const pickReal = (canonicalVal, listVal) =>
  isMissing(canonicalVal) ? (listVal ?? canonicalVal ?? null) : canonicalVal;

export default function MatchDetails() {
  const { matchId } = useParams();
  const now = useNow(1000);

  // ── Canonical match endpoint (intelligence + markets + live-synced prediction) ──
  const { data: canonical, isLoading: canonicalLoading } = useQuery({
    queryKey: ['canonicalMatch', matchId],
    queryFn: () => footballApi.getMatch(matchId).then((res) => res?.data || null),
    enabled: !!matchId,
    staleTime: 30 * 1000,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && !['FT', 'AET', 'PEN', 'FINISHED', 'NS'].includes(status) ? 30000 : false;
    },
    retry: 1,
  });

  // ── Fast path: today/tomorrow/yesterday fixture lists (instant render, canonical refines) ──
  const { data: todayFx = [] } = useFixtures(todayStr());
  const { data: tomFx = [] } = useFixtures(getLocalDateStr(1));
  const { data: yestFx = [] } = useFixtures(getLocalDateStr(-1));

  const listMatch = useMemo(() => {
    const all = [...todayFx, ...tomFx, ...yestFx];
    const found = all.find(
      (m) =>
        String(m.id) === String(matchId) ||
        (m.ids && Object.values(m.ids).some((v) => String(v) === String(matchId)))
    );
    return found ? applySmartMinute(normalizeMatch(found, true, now, true), now) : null;
  }, [todayFx, tomFx, yestFx, matchId, now]);

  /*
   * ★ THE TBD FIX — gap-fill merge.
   * Canonical is source of truth for LIVE state: status, score, markets,
   * intelligence. But when its identity fields are TBD/empty (old backend,
   * sparse snapshot entry), the list match — which always had real names —
   * backfills them. 'TBD' can no longer win over real data.
   */
  const match = useMemo(() => {
    if (!canonical) return listMatch;

    const canonicalMapped = applySmartMinute(
      normalizeMatch(
        {
          id: canonical.identity?.id || matchId,
          status: canonical.status,
          utcDate: canonical.kickoff,
          date: canonical.kickoff,
          leagueId: canonical.competition?.id,
          leagueName: canonical.competition?.name,
          leagueLogo: canonical.competition?.logo,
          homeTeamName: canonical.teams?.home?.name,
          awayTeamName: canonical.teams?.away?.name,
          homeTeamId: canonical.teams?.home?.id,
          awayTeamId: canonical.teams?.away?.id,
          homeLogo: canonical.teams?.home?.logo,
          awayLogo: canonical.teams?.away?.logo,
          homeScore: canonical.score?.home,
          awayScore: canonical.score?.away,
          odds: canonical.odds,
          mlPredictions: canonical.markets || canonical.mlPredictions || null,
          pickGroups: canonical.pickGroups || null,
          intelData: canonical.intelligence
            ? {
                elo: canonical.intelligence.elo,
                form: canonical.intelligence.form,
                h2h: canonical.intelligence.h2h,
                goalPatterns: canonical.intelligence.goalPatterns,
                zokaPick: canonical.zokaPrediction,
              }
            : null,
        },
        true,
        now,
        true
      ),
      now
    );

    if (!listMatch) return canonicalMapped;

    return {
      ...canonicalMapped,
      // identity: real values win over TBD/empty
      homeName: pickReal(canonicalMapped.homeName, listMatch.homeName),
      awayName: pickReal(canonicalMapped.awayName, listMatch.awayName),
      homeLogo: canonicalMapped.homeLogo || listMatch.homeLogo,
      awayLogo: canonicalMapped.awayLogo || listMatch.awayLogo,
      homeTeamId: canonicalMapped.homeTeamId || listMatch.homeTeamId,
      awayTeamId: canonicalMapped.awayTeamId || listMatch.awayTeamId,
      homeTeam: {
        ...canonicalMapped.homeTeam,
        name: pickReal(canonicalMapped.homeTeam?.name, listMatch.homeTeam?.name),
        crest: canonicalMapped.homeTeam?.crest || listMatch.homeTeam?.crest,
        id: canonicalMapped.homeTeam?.id || listMatch.homeTeam?.id,
      },
      awayTeam: {
        ...canonicalMapped.awayTeam,
        name: pickReal(canonicalMapped.awayTeam?.name, listMatch.awayTeam?.name),
        crest: canonicalMapped.awayTeam?.crest || listMatch.awayTeam?.crest,
        id: canonicalMapped.awayTeam?.id || listMatch.awayTeam?.id,
      },
      // league enrichment
      leagueId: isMissing(canonicalMapped.leagueId) ? listMatch.leagueId : canonicalMapped.leagueId,
      leagueName: pickReal(canonicalMapped.leagueName, listMatch.leagueName),
      leagueLogo: canonicalMapped.leagueLogo || listMatch.leagueLogo,
      league: {
        ...canonicalMapped.league,
        name: pickReal(canonicalMapped.league?.name, listMatch.league?.name),
        emblem: canonicalMapped.league?.emblem || listMatch.league?.emblem,
        id: canonicalMapped.league?.id || listMatch.league?.id,
      },
      competition: {
        ...canonicalMapped.competition,
        name: pickReal(canonicalMapped.competition?.name, listMatch.competition?.name),
        emblem: canonicalMapped.competition?.emblem || listMatch.competition?.emblem,
        id: canonicalMapped.competition?.id || listMatch.competition?.id,
      },
      // context + grouping data the canonical payload may not carry
      venue: canonicalMapped.venue || listMatch.venue,
      referee: canonicalMapped.referee || listMatch.referee,
      dateStr: canonicalMapped.dateStr || listMatch.dateStr,
      mustHave: canonicalMapped.mustHave || listMatch.mustHave,
      category: canonicalMapped.category !== 'NORMAL' ? canonicalMapped.category : listMatch.category,
      pickGroups: canonicalMapped.pickGroups || listMatch.pickGroups,
      pickGroupBadge: canonicalMapped.pickGroupBadge || listMatch.pickGroupBadge,
      ids: canonicalMapped.ids || listMatch.ids,
    };
  }, [canonical, listMatch, now, matchId]);

  const injectedPrediction = useMemo(() => match?.mlPredictions || null, [match]);

  // Daily predictions fallback only when canonical had none
  const { data: dailyPredictions = [] } = useQuery({
    queryKey: ['mlPredictions', match?.dateStr],
    queryFn: () => footballApi.getDailyPredictions(match.dateStr).then((res) => res?.data || []),
    enabled: !!match?.dateStr && !injectedPrediction,
    staleTime: 60 * 60 * 1000,
  });

  const finalPrediction = useMemo(() => {
    if (injectedPrediction) return injectedPrediction;
    if (!dailyPredictions || !match) return null;
    const found = dailyPredictions.find((p) => String(p.matchId) === String(match.id));
    return found ? found.markets : null;
  }, [injectedPrediction, dailyPredictions, match]);

  // ── Intelligence: fallback now runs whenever intel is MISSING —
  //    including when canonical exists but returned intelligence: null.
  //    ★ Passes BOTH ids and names so the backend's two-stage resolver
  //    can use whichever succeeds (id misses map → name resolves).
  const homeTeamId = match?.homeTeamId || match?.homeTeam?.id;
  const awayTeamId = match?.awayTeamId || match?.awayTeam?.id;
  const homeName = match?.homeName;
  const awayName = match?.awayName;
  const intelMissing = !!match && (!match.intelData || match.intelData.elo?.home == null);

  const { data: fallbackIntel } = useQuery({
    queryKey: ['match-intel', homeTeamId, awayTeamId, homeName, awayName],
    queryFn: () =>
      footballApi
        .getMatchIntelligence(homeName, awayName, homeTeamId, awayTeamId)
        .then((r) => r?.data || null),
    enabled: intelMissing && !!(homeTeamId || homeName) && !!(awayTeamId || awayName),
    staleTime: 10 * 60 * 1000,
  });

  const intelData = useMemo(() => {
    if (match?.intelData && match.intelData.elo?.home != null) return match.intelData;
    if (fallbackIntel) {
      return {
        elo: { home: fallbackIntel.home?.elo, away: fallbackIntel.away?.elo },
        form: { home: fallbackIntel.home?.form, away: fallbackIntel.away?.form },
        h2h: fallbackIntel.h2h,
        goalPatterns: {
          home: fallbackIntel.home?.goalPatterns || {},
          away: fallbackIntel.away?.goalPatterns || {},
        },
        zokaPick: fallbackIntel.zokaPick || null,
      };
    }
    return match?.intelData || null;
  }, [match, fallbackIntel]);

  // ── Standings (fixed shape: data.rows) ──
  const standingsLeagueId = match?.leagueId;
  const { data: standingsData } = useStandings(standingsLeagueId);
  const standingsRows = standingsData?.rows || [];

  // ── Recent results per team ──
  const { data: homeResults = [] } = useQuery({
    queryKey: ['team-results', homeTeamId],
    queryFn: () => footballApi.getResults({ teamId: homeTeamId, limit: 5 }).then((res) => res.data || []),
    enabled: !!homeTeamId,
    staleTime: 60 * 60 * 1000,
  });

  const { data: awayResults = [] } = useQuery({
    queryKey: ['team-results', awayTeamId],
    queryFn: () => footballApi.getResults({ teamId: awayTeamId, limit: 5 }).then((res) => res.data || []),
    enabled: !!awayTeamId,
    staleTime: 60 * 60 * 1000,
  });

  const [goalFlash, setGoalFlash] = useState(false);
  const prevScore = useRef({ home: undefined, away: undefined });

  useEffect(() => {
    if (match && match.homeScore != null && match.awayScore != null) {
      if (
        match.homeScore !== prevScore.current.home ||
        match.awayScore !== prevScore.current.away
      ) {
        if (prevScore.current.home !== undefined) setGoalFlash(true);
        const timer = setTimeout(() => setGoalFlash(false), 2000);
        prevScore.current = { home: match.homeScore, away: match.awayScore };
        return () => clearTimeout(timer);
      }
    } else if (match) {
      prevScore.current = { home: match.homeScore, away: match.awayScore };
    }
  }, [match]);

  const matchLink = match
    ? buildMatchRoute(match.id, match.homeName, match.awayName)
    : `/match/${matchId}`;
  const countdown = useCountdown(match?.isScheduled ? match.utcDate : null);

  const seo = useMemo(() => {
    if (!match) {
      return buildSEO({
        title: 'Match Details',
        description: 'Loading match details...',
        path: `/match/${matchId}`,
      });
    }
    const howTo = howToSchema({
      title: `How to Predict & Analyze ${match.homeName} vs ${match.awayName}`,
      description: `Step-by-step guide to analyzing the ${match.leagueName} match between ${match.homeName} and ${match.awayName}.`,
      image: match.homeLogo || match.awayLogo,
      steps: [
        { name: 'Check Head-to-Head', text: `Review historical results of ${match.homeName} and ${match.awayName}.` },
        { name: 'Analyze Tactics', text: 'Use Zoka AI to generate tactical breakdown.' },
        { name: 'Monitor Live Stats', text: 'Track possession, shots, momentum live.' },
        { name: 'Lock Your Prediction', text: 'Submit prediction and earn leaderboard points.' },
      ],
    });
    const baseSeo = seoGenerators.matchPage({
      homeName: match.homeName,
      awayName: match.awayName,
      leagueName: match.leagueName,
      date: match.date,
      venue: match.venue,
      isLive: match.isLive,
      isFinished: match.isFinished,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      path: matchLink,
      homeLogo: match.homeLogo,
      awayLogo: match.awayLogo,
      leagueLogo: match.leagueLogo,
      referee: match.referee,
      homeId: homeTeamId,
      awayId: awayTeamId,
      leagueId: match.leagueId,
    });
    baseSeo.structuredData = [...(baseSeo.structuredData || []), howTo];
    const scorePart = match.isLive || match.isFinished ? ` [${match.homeScore ?? 0}-${match.awayScore ?? 0}]` : '';
    baseSeo.title = `${match.homeName} vs ${match.awayName}${scorePart} — ${match.leagueName} Live Score & Stats | ZOKASCORE`;
    return baseSeo;
  }, [match, matchId, matchLink, homeTeamId, awayTeamId]);

  return (
    <div className="md-page">
      <SEO {...seo} />
      {match && (
        <h1 className="sr-only">
          {match.homeName} vs {match.awayName} - {match.leagueName} Live Score & Statistics
        </h1>
      )}

      {match?.isHidden ? (
        <div className="zoka-page flex-center">
          <div className="glass-card empty-card">
            <Clock size={32} className="gold" />
            <h2>Match Temporarily Unavailable</h2>
            <p className="text-muted">Waiting for final confirmation.</p>
            <Link to="/fixtures" className="btn btn-ghost">
              <ArrowLeft size={14} /> Back to Fixtures
            </Link>
          </div>
        </div>
      ) : !match && canonicalLoading ? (
        <div className="zoka-page flex-center">
          <div className="flex-col gap-16 w-full max-w-800">
            <div className="skeleton" style={{ height: 200, borderRadius: 24 }} />
            <div className="skeleton" style={{ height: 100, borderRadius: 16 }} />
          </div>
        </div>
      ) : !match ? (
        <div className="zoka-page flex-center">
          <div className="glass-card empty-card">
            <Clock size={32} className="gold" />
            <h2>Match Not Found</h2>
            <Link to="/fixtures" className="btn btn-ghost">
              <ArrowLeft size={14} /> Back to Fixtures
            </Link>
          </div>
        </div>
      ) : (
        <div className="md-container">
          <Link to="/fixtures" className="btn btn-ghost btn-sm mb-12">
            <ArrowLeft size={14} /> Back
          </Link>

          <div className={`md-header-card ${goalFlash ? 'goal-flash' : ''}`}>
            {goalFlash && <div className="md-confetti">🎉</div>}
            <div className="flex-center gap-8 mb-16">
              {match.leagueLogo && <img src={match.leagueLogo} alt="" width="16" height="16" />}
              <Link
                to={buildLeagueRoute(match.leagueId, match.leagueName)}
                className="text-muted font-bold text-xs hover-primary"
              >
                {match.leagueName}
              </Link>
              {(match.category === 'FEATURED' || match.mustHave) && (
                <span className="badge badge-gold">★ TOP</span>
              )}
            </div>
            <div className="md-teams">
              <Link to={buildTeamRoute(homeTeamId, match.homeName)} className="md-team">
                {match.homeLogo && <img src={match.homeLogo} alt={match.homeName} />}
                <h2 className="md-team-name">{match.homeName}</h2>
              </Link>
              <div className="md-score-block">
                <div className={`md-score ${match.isLive ? 'live' : ''} ${goalFlash ? 'pop' : ''}`}>
                  {(match.isLive || match.isHT || match.isFinished)
                    ? `${match.homeScore ?? '-'} : ${match.awayScore ?? '-'}`
                    : 'VS'}
                </div>
                <div className={`status-badge ${match.statusClass || 'status-upcoming'}`}>
                  {match.isLive && !match.isHT && <span className="zk-live-pulse-dot mr-2" />}
                  {match.isScheduled ? countdown : match.statusLabel}
                </div>
              </div>
              <Link to={buildTeamRoute(awayTeamId, match.awayName)} className="md-team">
                {match.awayLogo && <img src={match.awayLogo} alt={match.awayName} />}
                <h2 className="md-team-name">{match.awayName}</h2>
              </Link>
            </div>
            {(match.isLive || match.isFinished) && (
              <div className="md-timeline">
                <div className="md-timeline-fill" style={{ width: `${match.timelineProgress}%` }} />
              </div>
            )}
          </div>

          {match.aiPreview && (
            <div className="glass-card ai-preview-card">
              <h2 className="ai-preview-title"><Brain size={16} /> Zoka AI Tactical Preview</h2>
              <p className="text-muted text-sm">{match.aiPreview}</p>
            </div>
          )}

          <div className="md-pro-grid">
            <div className="glass-card p-12">
              <h3 className="md-mini-title"><MapPin size={12} /> Context</h3>
              <div className="md-mini-list">
                {match.date && (
                  <div className="md-mini-row">
                    <span className="text-muted flex-center gap-4"><Calendar size={12} /> Kickoff</span>
                    <span className="font-bold">
                      {new Date(match.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {formatTime(match.date)}
                    </span>
                  </div>
                )}
                {match.venue?.name && (
                  <div className="md-mini-row">
                    <span className="text-muted flex-center gap-4"><MapPin size={12} /> Venue</span>
                    <span className="font-bold">{match.venue.name}</span>
                  </div>
                )}
                {match.referee && (
                  <div className="md-mini-row">
                    <span className="text-muted flex-center gap-4"><Shield size={12} /> Referee</span>
                    <span className="font-bold">{match.referee}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="glass-card p-12">
              <h3 className="md-mini-title"><Users size={12} /> Top 3 Standings</h3>
              {standingsRows.length > 0 ? (
                standingsRows.slice(0, 3).map((team, i) => (
                  <Link
                    key={team.teamId || i}
                    to={buildTeamRoute(team.teamId, team.teamName)}
                    className="md-mini-row hover-primary"
                  >
                    <span className="rank">{team.rank || i + 1}</span>
                    <span className="flex-center gap-4 flex-1 truncate">{team.teamName}</span>
                    <span className="font-extrabold">{team.points} pts</span>
                  </Link>
                ))
              ) : (
                <div className="text-muted text-xs">N/A</div>
              )}
            </div>
          </div>

          {match.hasRealStats ? (
            <div className="glass-card p-16 mt-12">
              <h2 className="md-section-title"><BarChart3 size={16} /> Statistics</h2>
              {match.stats?.possession && <StatBar label="Possession" home={match.stats.possession.home} away={match.stats.possession.away} isPercentage />}
              {match.stats?.shotsOnTarget && <StatBar label="Shots on Target" home={match.stats.shotsOnTarget.home} away={match.stats.shotsOnTarget.away} />}
              {match.stats?.shots && <StatBar label="Total Shots" home={match.stats.shots.home} away={match.stats.shots.away} />}
              {match.stats?.corners && <StatBar label="Corners" home={match.stats.corners.home} away={match.stats.corners.away} />}
              {match.stats?.fouls && <StatBar label="Fouls" home={match.stats.fouls.home} away={match.stats.fouls.away} />}
            </div>
          ) : (
            <div className="glass-card pending-card">
              <Activity size={20} className="primary" />
              <h3>Tactical Insight Pending</h3>
              <p className="text-muted text-xs">
                {match.isLive ? 'Live stats tracking — ask AI for insights!' : 'Stats appear once match begins.'}
              </p>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('openZokaAI', { detail: { message: `Give me tactical breakdown for ${match.homeName} vs ${match.awayName} in ${match.leagueName}.` } }))}
                className="btn btn-primary btn-sm"
              >
                <Zap size={14} /> Ask Zoka AI
              </button>
            </div>
          )}

          <MatchIntelligence
            data={intelData}
            homeName={match.homeName}
            awayName={match.awayName}
            mlPredictions={finalPrediction}
          />

          <div className="glass-card p-16 mt-12">
            <h2 className="md-section-title"><Shield size={16} /> Odds & Markets</h2>
            {match.odds && (match.odds.home || match.odds.away) ? (
              <div className="odds-grid">
                <div className="odd-box home"><div className="lbl">Home</div><div className="val">{match.odds.home || '-'}</div></div>
                <div className="odd-box draw"><div className="lbl">Draw</div><div className="val gold">{match.odds.draw || '-'}</div></div>
                <div className="odd-box away"><div className="lbl">Away</div><div className="val danger">{match.odds.away || '-'}</div></div>
              </div>
            ) : (
              <div className="text-muted text-xs text-center py-8 flex-center gap-8">
                <Shield size={16} /> Odds unavailable.
              </div>
            )}
          </div>

          <div className="glass-card p-16 mt-12">
            <h2 className="md-section-title"><TrendingUp size={16} /> H2H & Recent Form</h2>
            <div className="h2h-grid">
              <div>
                <h3 className="h2h-team-title"><img src={match.homeLogo} alt="" width="12" height="12" />{match.homeName}</h3>
                <ul className="h2h-list">
                  {homeResults.length ? homeResults.map((m) => (
                    <li key={m.id}>
                      <Link to={buildMatchRoute(m.id, m.homeName || m.homeTeam?.name, m.awayName || m.awayTeam?.name)} className="h2h-link">
                        <ChevronRight size={12} />
                        {m.homeName || m.homeTeam?.name} vs {m.awayName || m.awayTeam?.name}
                        <span className="font-extrabold">{m.homeScore} - {m.awayScore}</span>
                      </Link>
                    </li>
                  )) : <li className="text-muted text-xs">No recent results.</li>}
                </ul>
              </div>
              <div>
                <h3 className="h2h-team-title"><img src={match.awayLogo} alt="" width="12" height="12" />{match.awayName}</h3>
                <ul className="h2h-list">
                  {awayResults.length ? awayResults.map((m) => (
                    <li key={m.id}>
                      <Link to={buildMatchRoute(m.id, m.homeName || m.homeTeam?.name, m.awayName || m.awayTeam?.name)} className="h2h-link">
                        <ChevronRight size={12} />
                        {m.homeName || m.homeTeam?.name} vs {m.awayName || m.awayTeam?.name}
                        <span className="font-extrabold">{m.homeScore} - {m.awayScore}</span>
                      </Link>
                    </li>
                  )) : <li className="text-muted text-xs">No recent results.</li>}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}