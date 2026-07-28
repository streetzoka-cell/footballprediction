import React from 'react';
import { Brain, TrendingUp, BarChart2 } from 'lucide-react';

export default function MatchIntelligence({ data }) {
  if (!data) return null;

  const { xG, winProbability, form, story } = data;

  return (
    <div className="zoka-card" style={{ padding: '20px', marginTop: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <Brain size={20} color="#10b981" />
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Match Intelligence</h3>
      </div>

      {/* AI Story */}
      {story && (
        <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '15px', borderRadius: '12px', marginBottom: '20px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
          <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.5, color: '#e2e8f0' }}>{story}</p>
        </div>
      )}

      {/* Win Probability Bars */}
      {winProbability && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.85rem', color: '#94a3b8' }}>
            <span>Win Probability</span>
          </div>
          <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', background: '#1e293b' }}>
            <div style={{ width: `${winProbability.home || 0}%`, background: '#10b981', transition: 'width 1s ease' }} />
            <div style={{ width: `${winProbability.draw || 0}%`, background: '#64748b', transition: 'width 1s ease' }} />
            <div style={{ width: `${winProbability.away || 0}%`, background: '#ef4444', transition: 'width 1s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.8rem', fontWeight: 700 }}>
            <span style={{ color: '#10b981' }}>{winProbability.home || 0}%</span>
            <span style={{ color: '#64748b' }}>{winProbability.draw || 0}%</span>
            <span style={{ color: '#ef4444' }}>{winProbability.away || 0}%</span>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
        {xG && (
          <div style={{ background: '#0f172a', padding: '15px', borderRadius: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#64748b', fontSize: '0.8rem' }}>
              <BarChart2 size={14} /> Expected Goals (xG)
            </div>
            <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{xG.home || '-'} <span style={{ color: '#64748b', fontSize: '0.9rem' }}>vs</span> {xG.away || '-'}</div>
          </div>
        )}
        {form && (
          <div style={{ background: '#0f172a', padding: '15px', borderRadius: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#64748b', fontSize: '0.8rem' }}>
              <TrendingUp size={14} /> Recent Form
            </div>
            <div style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '2px' }}>
              {form.home || '-'} <span style={{ color: '#64748b' }}>/</span> {form.away || '-'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}