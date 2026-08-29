// src/pages/components/DashboardTab.jsx
import React, { useState, useMemo, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, RotateCcw, CalendarDays, Crown, Timer, BarChart3, Sparkles, Loader2, Brain, Cpu, TrendingUp, Flame, Rocket } from 'lucide-react';
import { dateLabel } from './common';
import { footballApi } from '../../../services/footballApi';

const DashboardTab = memo(function DashboardTab({ preds, pubPicks, fxCount, liveCount, finCount, date, onRebuild, rebuilding, toast }) {
  const pr = pubPicks?.matches || [];
  let zE = 0, zR = 0, zM = 0, zP = 0;

  pr.forEach(p => {
    if (p.status !== 'finished' || p.homeScore == null) { zP++; return; }
    const h = p.adminPick?.home, a = p.adminPick?.away;
    if (h === p.homeScore && a === p.awayScore) { zE++; return; }
    if ((h > a ? 'H' : h < a ? 'A' : 'D') === (p.homeScore > p.awayScore ? 'H' : p.homeScore < p.awayScore ? 'A' : 'D')) { zR++; return; }
    zM++;
  });

  const zT = pr.length, res = Math.max(zT - zP, 1);
  const zAcc = zT > 0 ? Math.round(((zE + zR) / res) * 100) : 0;

  const [aiRunning, setAiRunning] = useState(false);
  const [backfillRunning, setBackfillRunning] = useState(false);

  const handleRunAI = async () => {
    setAiRunning(true);
    try {
      await footballApi.adminTriggerFeatureGen();
      toast('AI Feature generation started in background! Check server logs.', 'ok');
    } catch (e) {
      toast('Failed to start AI job: ' + (e.friendlyMessage || e.message), 'er');
    } finally {
      setTimeout(() => setAiRunning(false), 2000);
    }
  };

  const handleBackfill = async () => {
    setBackfillRunning(true);
    try {
      await footballApi.adminBackfillResults();
      toast('14-day backfill started! This uses 14 API calls and runs in background.', 'ok');
    } catch (e) {
      toast('Failed to start backfill: ' + (e.friendlyMessage || e.message), 'er');
    } finally {
      setTimeout(() => setBackfillRunning(false), 2000);
    }
  };

  /* ── ★ NEW: Pick Groups status (graceful on unpublished days) ── */
  const { data: groupsData } = useQuery({
    queryKey: ['adminPickGroups', date, 'dashboard'],
    queryFn: () => footballApi.getAdminPickGroups(date),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: publishedData } = useQuery({
    queryKey: ['publishedPickGroups', date, 'dashboard'],
    queryFn: () => footballApi.getPublishedPickGroups(date),
    staleTime: 2 * 60 * 1000,
  });

  const { data: historyData } = useQuery({
    queryKey: ['groupHistory', 10, 'dashboard'],
    queryFn: () => footballApi.getGroupHistory(10).then((r) => r?.data || null),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  const groupsStatus = useMemo(() => {
    const families = groupsData?.familyOrder || [];
    const overall = groupsData?.results || null;
    return {
      loaded: !!groupsData,
      source: groupsData?.source || null,
      fallback: !!groupsData?.fallback,
      families: families.length,
      published: !!publishedData,
      publishedFamilies: publishedData?.familyOrder?.length || 0,
      won: overall?.won ?? null,
      lost: overall?.lost ?? null,
      pending: overall?.pending ?? null,
      accuracy: overall?.accuracy ?? null,
      streak: historyData?.streaks?.current ?? 0,
      rangeAccuracy: historyData?.totals?.accuracy ?? null,
      rangeDays: historyData?.totals?.days ?? 0,
    };
  }, [groupsData, publishedData, historyData]);

  return (
    <div className="flex flex-col gap-16">
      {/* AI LAB CONTROL PANEL */}
      <div className="glass-card p-16 flex flex-col gap-12" style={{ borderColor: 'rgba(var(--primary-rgb), 0.2)', background: 'linear-gradient(135deg, rgba(var(--primary-rgb), 0.03), var(--bg-card))' }}>
        <h3 className="text-primary font-bold flex-center gap-8">
          <Brain size={16} /> ZOKASCORE AI Lab
        </h3>
        <p className="text-muted text-sm">
          Run the Time Machine script to calculate Elo, Form, H2H, and Goal Patterns for newly finished matches. This feeds the deep intelligence data to the Match Details pages.
        </p>
        <button className="btn btn-primary w-full flex-center gap-8" onClick={handleRunAI} disabled={aiRunning}>
          {aiRunning ? (
            <><Loader2 size={14} className="anim-spin" /> Calculating Features...</>
          ) : (
            <><Cpu size={14} /> Update AI Features</>
          )}
        </button>

        {/* 14-DAY BACKFILL BUTTON */}
        <button className="btn btn-secondary w-full flex-center gap-8 mt-8" onClick={handleBackfill} disabled={backfillRunning}>
          {backfillRunning ? (
            <><Loader2 size={14} className="anim-spin" /> Backfilling 14 Days...</>
          ) : (
            <><RotateCcw size={14} /> Force 14-Day Results Backfill</>
          )}
        </button>

        {/* ★ UPDATED: V2 is the deployed champion (Step 49 V5.1, honest test numbers) */}
        <div className="admin-grid-100 mt-8">
          <div className="glass-card p-8 flex flex-col items-center gap-4 text-center">
            <TrendingUp size={14} className="text-primary" />
            <span className="text-muted text-xs">V2 1X2 (deployed)</span>
            <span className="text-primary font-bold text-xs">51.1% (+7.1 vs base)</span>
          </div>
          <div className="glass-card p-8 flex flex-col items-center gap-4 text-center">
            <Activity size={14} className="text-accent" />
            <span className="text-muted text-xs">V2 Markets</span>
            <span className="text-primary font-bold text-xs">OU2.5 55.7% · BTTS 54.4%</span>
          </div>
        </div>
      </div>

      {/* ★ NEW: PICK GROUPS STATUS */}
      <div className="glass-card p-16 flex flex-col gap-12">
        <h3 className="text-primary font-bold flex-center gap-8">
          <Sparkles size={15} /> Pick Groups — {dateLabel(date)}
        </h3>

        {!groupsStatus.loaded ? (
          <p className="text-muted text-xs">Loading groups status…</p>
        ) : groupsStatus.families === 0 ? (
          <p className="text-muted text-xs">
            No groups generated for this date yet — Step 50 runs every 15 min. Check the Pick Groups tab.
          </p>
        ) : (
          <>
            <div className="admin-grid-100">
              <div className="glass-card p-8 flex flex-col items-center gap-4 text-center">
                <span className={`font-extrabold text-xs ${groupsStatus.fallback ? 'text-gold' : 'text-primary'}`}>
                  {groupsStatus.fallback ? 'FALLBACK ⚠' : 'PIPELINE'}
                </span>
                <span className="text-muted text-xs">Source</span>
              </div>
              <div className="glass-card p-8 flex flex-col items-center gap-4 text-center">
                <span className="font-extrabold text-accent">{groupsStatus.families}</span>
                <span className="text-muted text-xs">Families built</span>
              </div>
              <div className="glass-card p-8 flex flex-col items-center gap-4 text-center">
                <span className={`font-extrabold text-xs ${groupsStatus.published ? 'text-primary' : 'text-muted'}`}>
                  {groupsStatus.published ? `LIVE (${groupsStatus.publishedFamilies})` : 'NOT PUBLISHED'}
                </span>
                <span className="text-muted text-xs">App surface</span>
              </div>
              <div className="glass-card p-8 flex flex-col items-center gap-4 text-center">
                {groupsStatus.accuracy != null && groupsStatus.settledAvailable ? null : null}
                <span className="text-danger font-extrabold">{groupsStatus.lost ?? '—'}</span>
                <span className="text-muted text-xs">Lost</span>
              </div>
              <div className="glass-card p-8 flex flex-col items-center gap-4 text-center">
                <span className="text-primary font-extrabold">{groupsStatus.won ?? '—'}</span>
                <span className="text-muted text-xs">Won</span>
              </div>
              <div className="glass-card p-8 flex flex-col items-center gap-4 text-center">
                <span className="text-gold font-extrabold">{groupsStatus.accuracy != null ? `${groupsStatus.accuracy}%` : '—'}</span>
                <span className="text-muted text-xs">Hit rate</span>
              </div>
            </div>
            <div className="flex-between flex-wrap gap-8 text-xs">
              <span className="text-muted">
                {groupsStatus.pending != null && groupsStatus.pending > 0
                  ? `⏳ ${groupsStatus.pending} pending FT · auto-marks every 10 min`
                  : 'All picks settled for this date'}
              </span>
              {groupsStatus.streak > 1 && (
                <span className="flex-center gap-4 text-gold font-bold">
                  <Flame size={12} /> {groupsStatus.streak}-day streak
                </span>
              )}
              {groupsStatus.rangeAccuracy != null && (
                <span className="text-muted">
                  10-day: {groupsStatus.rangeAccuracy}% over {groupsStatus.rangeDays} days
                </span>
              )}
            </div>
            {!groupsStatus.published && (
              <div className="flex-center gap-8">
                <Rocket size={12} className="text-gold" />
                <span className="text-xs text-muted">Publish from the <strong>Pick Groups</strong> tab to go live.</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* OVERVIEW STATS */}
      <div className="glass-card p-16 flex flex-col gap-12">
        <h3 className="text-primary font-bold flex-center gap-8"><Activity size={15} /> Overview — {dateLabel(date)}</h3>
        <div className="admin-grid-100">
          <div className="glass-card p-8 flex flex-col items-center"><span className="font-extrabold text-accent">{fxCount}</span><span className="text-muted text-xs">Fixtures</span></div>
          <div className="glass-card p-8 flex flex-col items-center"><span className="font-extrabold text-danger">{liveCount}</span><span className="text-muted text-xs">Live</span></div>
          <div className="glass-card p-8 flex flex-col items-center"><span className="font-extrabold text-primary">{finCount}</span><span className="text-muted text-xs">Finished</span></div>
          <div className="glass-card p-8 flex flex-col items-center"><span className="font-extrabold text-gold">{preds.length}</span><span className="text-muted text-xs">Featured</span></div>
          <div className="glass-card p-8 flex flex-col items-center"><span className="font-extrabold text-gold">{zT}</span><span className="text-muted text-xs">Zoka</span></div>
          <div className="glass-card p-8 flex flex-col items-center"><span className="font-extrabold text-primary">{zAcc}%</span><span className="text-muted text-xs">Zoka Acc</span></div>
        </div>
      </div>

      {/* LEADERBOARD REBUILDS */}
      <div className="glass-card p-16 flex flex-col gap-12">
        <h3 className="text-primary font-bold flex-center gap-8"><RotateCcw size={15} /> Rebuild Data & Leaderboards</h3>
        <div className="admin-grid-150">
          <button className="btn btn-secondary" onClick={() => onRebuild('fixtures')} disabled={rebuilding === 'fixtures'}>
            {rebuilding === 'fixtures' ? <Loader2 size={13} className="anim-spin" /> : <Sparkles size={13} />}Refresh Finished
          </button>
          <button className="btn btn-secondary" onClick={() => onRebuild('daily')} disabled={rebuilding === 'daily'}>
            {rebuilding === 'daily' ? <Loader2 size={13} className="anim-spin" /> : <CalendarDays size={13} />}Daily ({dateLabel(date)})
          </button>
          <button className="btn btn-secondary" onClick={() => onRebuild('goat')} disabled={rebuilding === 'goat'}>
            {rebuilding === 'goat' ? <Loader2 size={13} className="anim-spin" /> : <Crown size={13} />}GOAT
          </button>
          <button className="btn btn-secondary" onClick={() => onRebuild('weekly')} disabled={rebuilding === 'weekly'}>
            {rebuilding === 'weekly' ? <Loader2 size={13} className="anim-spin" /> : <Timer size={13} />}Weekly
          </button>
          <button className="btn btn-secondary" onClick={() => onRebuild('monthly')} disabled={rebuilding === 'monthly'}>
            {rebuilding === 'monthly' ? <Loader2 size={13} className="anim-spin" /> : <BarChart3 size={13} />}Monthly
          </button>
          <button className="btn btn-primary" onClick={() => onRebuild('all')} disabled={rebuilding === 'all'}>
            {rebuilding === 'all' ? <Loader2 size={13} className="anim-spin" /> : <Sparkles size={13} />}Rebuild All LBs
          </button>
        </div>
      </div>
    </div>
  );
});

export default DashboardTab;