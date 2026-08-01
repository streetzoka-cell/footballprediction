import React from 'react';
import { Brain, TrendingUp, BarChart2 } from 'lucide-react';

export default function MatchIntelligence({ data }) {
  if (!data) return null;

  const { xG, winProbability, form, story } = data;

  return (
    <div className="glass-card flex-col gap-20 p-20 mt-20">
      <div className="flex-center gap-8">
        <Brain size={20} className="text-primary" />
        <h3 className="text-primary font-bold text-md">Match Intelligence</h3>
      </div>

      {/* AI Story */}
      {story && (
        <div className="glass-card p-16" style={{ background: 'rgba(var(--primary-rgb), 0.05)', borderColor: 'rgba(var(--primary-rgb), 0.15)' }}>
          <p className="text-secondary text-sm" style={{ lineHeight: 1.5 }}>{story}</p>
        </div>
      )}

      {/* Win Probability Bars */}
      {winProbability && (
        <div className="flex-col gap-8">
          <div className="text-muted text-xs font-bold uppercase">Win Probability</div>
          <div className="flex h-8 rounded-md overflow-hidden bg-elevated">
            <div style={{ width: `${winProbability.home || 0}%`, background: 'var(--primary)', transition: 'width 1s ease' }} />
            <div style={{ width: `${winProbability.draw || 0}%`, background: 'var(--text-muted)', transition: 'width 1s ease' }} />
            <div style={{ width: `${winProbability.away || 0}%`, background: 'var(--danger)', transition: 'width 1s ease' }} />
          </div>
          <div className="flex-between text-xs font-bold mt-4">
            <span className="text-primary">{winProbability.home || 0}%</span>
            <span className="text-muted">{winProbability.draw || 0}%</span>
            <span className="text-danger">{winProbability.away || 0}%</span>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid gap-12" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {xG && (
          <div className="glass-card p-16 flex-col gap-8">
            <div className="flex-center gap-4 text-muted text-xs font-bold uppercase">
              <BarChart2 size={14} /> Expected Goals (xG)
            </div>
            <div className="text-primary font-bold text-md">{xG.home || '-'} <span className="text-muted text-sm font-normal">vs</span> {xG.away || '-'}</div>
          </div>
        )}
        {form && (
          <div className="glass-card p-16 flex-col gap-8">
            <div className="flex-center gap-4 text-muted text-xs font-bold uppercase">
              <TrendingUp size={14} /> Recent Form
            </div>
            <div className="text-primary font-bold text-sm" style={{ letterSpacing: '2px' }}>
              {form.home || '-'} <span className="text-muted font-normal">/</span> {form.away || '-'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}