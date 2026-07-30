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
    <div className="ae">
      <div className="asec">
        <h3 className="ast"><Activity size={15} /> Overview — {dateLabel(date)}</h3>
        <div className="asg">
          <div className="astat"><span className="n bl">{fxCount}</span><span className="l">Fixtures</span></div>
          <div className="astat"><span className="n rd">{liveCount}</span><span className="l">Live</span></div>
          <div className="astat"><span className="n gn">{finCount}</span><span className="l">Finished</span></div>
          <div className="astat"><span className="n gd">{preds.length}</span><span className="l">Featured</span></div>
          <div className="astat"><span className="n gd">{zT}</span><span className="l">Zoka</span></div>
          <div className="astat"><span className="n gn">{zAcc}%</span><span className="l">Zoka Acc</span></div>
        </div>
        {zT > 0 && (
          <div className="azs">
            <span className="abdg ex"><CheckCircle2 size={9} /> {zE} Exact</span>
            <span className="abdg rs"><TrendingUp size={9} /> {zR} Result</span>
            <span className="abdg ms"><XCircle size={9} /> {zM} Miss</span>
            {zP > 0 && <span className="abdg pn">{zP} Pending</span>}
          </div>
        )}
      </div>
      <div className="asec">
        <h3 className="ast"><RotateCcw size={15} /> Rebuild Leaderboards</h3>
        <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', margin: '0 0 12px', fontWeight: 600, lineHeight: 1.4 }}>
          Manually trigger the backend to recalculate points and update ranks.
          <br /><span style={{ fontSize: '.68rem', opacity: 0.7 }}>Leaderboards usually update automatically when matches finish.</span>
        </p>
        <div className="arg">
          {[['daily','Daily ('+dateLabel(date)+')',CalendarDays],['goat','GOAT',Crown],['weekly','Weekly',Timer],['monthly','Monthly',BarChart3]].map(([k,l,Ic]) => (
            <button key={k} className="arb" onClick={() => onRebuild(k)} disabled={rebuilding === k}>
              {rebuilding === k ? <Loader2 size={13} className="asp" /> : <Ic size={13} />}{l}
            </button>
          ))}
          <button className="arb" onClick={() => onRebuild('all')} disabled={rebuilding === 'all'} style={{ gridColumn: '1 / -1' }}>
            {rebuilding === 'all' ? <Loader2 size={13} className="asp" /> : <Sparkles size={13} />}Rebuild All
          </button>
        </div>
      </div>
    </div>
  );
});

export default DashboardTab;