import React, { memo } from 'react';
import { Activity, CheckCircle2, XCircle, TrendingUp, RotateCcw, CalendarDays, Crown, Timer, BarChart3, Sparkles, Loader2 } from 'lucide-react';
import { dateLabel } from './common';

const DashboardTab = memo(function DashboardTab({ preds, pubPicks, fxCount, liveCount, finCount, date, onRebuild, rebuilding }) {
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

  return (
    <div className="flex-col gap-16">
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
      <div className="glass-card p-16 flex-col gap-12">
        <h3 className="text-primary font-bold flex-center gap-8"><RotateCcw size={15} /> Rebuild Leaderboards</h3>
        <div className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {[['daily','Daily ('+dateLabel(date)+')',CalendarDays],['goat','GOAT',Crown],['weekly','Weekly',Timer],['monthly','Monthly',BarChart3]].map(([k,l,Ic]) => (
            <button key={k} className="btn btn-secondary" onClick={() => onRebuild(k)} disabled={rebuilding === k}>
              {rebuilding === k ? <Loader2 size={13} className="anim-spin" /> : <Ic size={13} />}{l}
            </button>
          ))}
          <button className="btn btn-primary" onClick={() => onRebuild('all')} disabled={rebuilding === 'all'}>
            {rebuilding === 'all' ? <Loader2 size={13} className="anim-spin" /> : <Sparkles size={13} />}Rebuild All
          </button>
        </div>
      </div>
    </div>
  );
});

export default DashboardTab;