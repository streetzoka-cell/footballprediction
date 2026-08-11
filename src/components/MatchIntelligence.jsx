import React from 'react';
import { Brain, TrendingUp, BarChart2, Swords, Shield } from 'lucide-react';

const FormGuide = ({ form }) => {
  if (!form || form.length === 0) return <span className="text-muted text-sm">No recent form</span>;
  return (
    <div className="flex gap-4">
      {form.map((m, i) => {
        const color = m.res === 'W' ? 'var(--success)' : m.res === 'D' ? 'var(--gold)' : 'var(--danger)';
        return (
          <div key={i} style={{ background: color, width: '20px', height: '20px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '10px', fontWeight: 'bold' }}>
            {m.res}
          </div>
        );
      })}
    </div>
  );
};

export default function MatchIntelligence({ data, homeName, awayName }) {
  if (!data) {
    return (
      <section className="glass-card flex-col gap-20 p-20 mt-20">
        <div className="flex-center gap-8">
          <Brain size={20} className="text-primary" aria-hidden="true" />
          <h3 className="text-primary font-bold text-md">Match Intelligence</h3>
        </div>
        <div className="text-muted text-sm text-center p-12">
          Deep tactical stats (Elo, H2H, Goal Patterns) will populate here once the match begins or is scheduled.
        </div>
      </section>
    );
  }

  const { home, away, h2h } = data;

  // Calculate Win Probability Bar (Simple Elo conversion for visual)
  const totalElo = (home?.elo || 1500) + (away?.elo || 1500);
  const homeWinProb = totalElo > 0 ? Math.round(((home?.elo || 1500) / totalElo) * 100) : 50;
  const awayWinProb = 100 - homeWinProb;

  return (
    <section className="glass-card flex-col gap-20 p-20 mt-20" aria-labelledby="match-intel-title">
      <div className="flex-center gap-8">
        <Brain size={20} className="text-primary" aria-hidden="true" />
        <h3 id="match-intel-title" className="text-primary font-bold text-md">Match Intelligence</h3>
      </div>

      {/* Elo & Win Probability */}
      <div className="flex-col gap-8">
        <div className="text-muted text-xs font-bold uppercase">Strength (Elo)</div>
        <div className="flex h-8 rounded-md overflow-hidden bg-elevated" role="progressbar">
          <div style={{ width: `${homeWinProb}%`, background: 'var(--primary)', transition: 'width 1s ease' }} aria-label={`${homeName} strength`} />
          <div style={{ width: `${awayWinProb}%`, background: 'var(--danger)', transition: 'width 1s ease' }} aria-label={`${awayName} strength`} />
        </div>
        <div className="flex-between text-xs font-bold mt-4">
          <span className="text-primary">{home?.elo || 'N/A'} ({homeWinProb}%)</span>
          <span className="text-muted">Elo Rating</span>
          <span className="text-danger">{away?.elo || 'N/A'} ({awayWinProb}%)</span>
        </div>
      </div>

      {/* Recent Form */}
      <div className="grid gap-12" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="glass-card p-12 flex-col gap-8" style={{ background: 'rgba(var(--primary-rgb), 0.03)' }}>
          <div className="flex-center gap-4 text-muted text-xs font-bold uppercase">
            <TrendingUp size={12} /> {homeName} Form
          </div>
          <FormGuide form={home?.form} />
        </div>
        <div className="glass-card p-12 flex-col gap-8" style={{ background: 'rgba(var(--danger-rgb), 0.03)' }}>
          <div className="flex-center gap-4 text-muted text-xs font-bold uppercase">
            <TrendingUp size={12} /> {awayName} Form
          </div>
          <FormGuide form={away?.form} />
        </div>
      </div>

      {/* Goal Patterns */}
      <div className="grid gap-12" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="glass-card p-12 flex-col gap-4">
          <div className="flex-center gap-4 text-muted text-xs font-bold uppercase">
            <BarChart2 size={12} /> {homeName} Stats
          </div>
          <div className="text-secondary text-sm flex-between"><span>Over 2.5:</span> <span className="font-bold">{home?.goalPatterns?.overall?.over_2_5_pct || '-'}%</span></div>
          <div className="text-secondary text-sm flex-between"><span>BTTS:</span> <span className="font-bold">{home?.goalPatterns?.overall?.btts_pct || '-'}%</span></div>
        </div>
        <div className="glass-card p-12 flex-col gap-4">
          <div className="flex-center gap-4 text-muted text-xs font-bold uppercase">
            <BarChart2 size={12} /> {awayName} Stats
          </div>
          <div className="text-secondary text-sm flex-between"><span>Over 2.5:</span> <span className="font-bold">{away?.goalPatterns?.overall?.over_2_5_pct || '-'}%</span></div>
          <div className="text-secondary text-sm flex-between"><span>BTTS:</span> <span className="font-bold">{away?.goalPatterns?.overall?.btts_pct || '-'}%</span></div>
        </div>
      </div>

      {/* H2H Summary */}
      {h2h && h2h.meetings > 0 && (
        <div className="glass-card p-12 flex-col gap-8">
          <div className="flex-center gap-4 text-muted text-xs font-bold uppercase">
            <Swords size={12} /> Head-to-Head (All Time)
          </div>
          <div className="flex-between text-sm font-bold">
            <span className="text-primary">{h2h.teamA_wins} Wins</span>
            <span className="text-muted">{h2h.draws} Draws</span>
            <span className="text-danger">{h2h.teamB_wins} Wins</span>
          </div>
          <div className="text-muted text-xs text-center mt-4">
            Total Meetings: {h2h.meetings} | Last 5: {h2h.last_5?.slice(0,3).map(m => `${m.teamA_score}-${m.teamB_score}`).join(', ')}
          </div>
        </div>
      )}
    </section>
  );
}