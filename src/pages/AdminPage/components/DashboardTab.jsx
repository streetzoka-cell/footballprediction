import React, { useState, memo } from 'react';
import { Activity, RotateCcw, CalendarDays, Crown, Timer, BarChart3, Sparkles, Loader2, Brain, Cpu, TrendingUp } from 'lucide-react';
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

  // ★ NEW: State for AI Feature Generation
  const [aiRunning, setAiRunning] = useState(false);

  const handleRunAI = async () => {
    setAiRunning(true);
    try {
      await footballApi.adminTriggerFeatureGen();
      toast('AI Feature generation started in background! Check server logs.', 'ok');
    } catch (e) {
      toast('Failed to start AI job: ' + (e.friendlyMessage || e.message), 'er');
    } finally {
      // Allow UI to reset after a short delay, even though script runs in background
      setTimeout(() => setAiRunning(false), 2000);
    }
  };

  return (
    <div className="flex-col gap-16">
      {/* AI LAB CONTROL PANEL */}
      <div className="glass-card p-16 flex-col gap-12" style={{ borderColor: 'rgba(var(--primary-rgb), 0.2)', background: 'linear-gradient(135deg, rgba(var(--primary-rgb), 0.03), var(--bg-card))' }}>
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
        <div className="grid gap-8 mt-8" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="glass-card p-8 flex-col items-center gap-4 text-center">
            <TrendingUp size={14} className="text-primary" />
            <span className="text-muted text-xs">Model V1 Status</span>
            <span className="text-danger font-bold text-xs">NOT DEPLOYED (-9% ROI)</span>
          </div>
          <div className="glass-card p-8 flex-col items-center gap-4 text-center">
            <Activity size={14} className="text-accent" />
            <span className="text-muted text-xs">Historical DB</span>
            <span className="text-primary font-bold text-xs">~227,000 Matches</span>
          </div>
        </div>
      </div>

      {/* OVERVIEW STATS */}
      <div className="glass-card p-16 flex-col gap-12">
        <h3 className="text-primary font-bold flex-center gap-8"><Activity size={15} /> Overview — {dateLabel(date)}</h3>
        <div className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))' }}>
          <div className="glass-card p-8 flex-col items-center"><span className="font-extrabold text-accent">{fxCount}</span><span className="text-muted text-xs">Fixtures</span></div>
          <div className="glass-card p-8 flex-col items-center"><span className="font-extrabold text-danger">{liveCount}</span><span className="text-muted text-xs">Live</span></div>
          <div className="glass-card p-8 flex-col items-center"><span className="font-extrabold text-primary">{finCount}</span><span className="text-muted text-xs">Finished</span></div>
          <div className="glass-card p-8 flex-col items-center"><span className="font-extrabold text-gold">{preds.length}</span><span className="text-muted text-xs">Featured</span></div>
          <div className="glass-card p-8 flex-col items-center"><span className="font-extrabold text-gold">{zT}</span><span className="text-muted text-xs">Zoka</span></div>
          <div className="glass-card p-8 flex-col items-center"><span className="font-extrabold text-primary">{zAcc}%</span><span className="text-muted text-xs">Zoka Acc</span></div>
        </div>
      </div>
      
      {/* LEADERBOARD REBUILDS */}
      <div className="glass-card p-16 flex-col gap-12">
        <h3 className="text-primary font-bold flex-center gap-8"><RotateCcw size={15} /> Rebuild Data & Leaderboards</h3>
        <div className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
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