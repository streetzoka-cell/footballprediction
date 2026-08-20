import React from 'react';
import { Brain, TrendingUp, BarChart2, Swords, Shield, Zap, Target, Activity, Loader } from 'lucide-react';

const FormGuide = ({ form }) => {
  if (!form || form.length === 0) return <span className="text-muted text-sm">No recent form data</span>;
  return (
    <div className="flex gap-4 flex-wrap">
      {form.map((m, i) => {
        const color = m === 'W' ? 'var(--success)' : m === 'D' ? 'var(--gold)' : 'var(--danger)';
        return (
          <div key={i} style={{ background: color, width: '24px', height: '24px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 'bold' }}>
            {m}
          </div>
        );
      })}
    </div>
  );
};

// Helper component for probability bars
const ProbBar = ({ label, homeProb, drawProb, awayProb }) => (
  <div className="flex-col gap-8 mt-8">
    <div className="text-muted text-xs font-bold uppercase">{label}</div>
    <div className="flex h-8 rounded-md overflow-hidden bg-elevated" role="progressbar">
      {homeProb > 0 && <div style={{ width: `${homeProb}%`, background: 'var(--primary)' }} title={`Home ${homeProb}%`} />}
      {drawProb > 0 && <div style={{ width: `${drawProb}%`, background: 'var(--text-muted)' }} title={`Draw ${drawProb}%`} />}
      {awayProb > 0 && <div style={{ width: `${awayProb}%`, background: 'var(--danger)' }} title={`Away ${awayProb}%`} />}
    </div>
  </div>
);

export default function MatchIntelligence({ data, homeName, awayName, mlPredictions }) {
  const { home, away, h2h } = data || {};
  
  // Extract ML Probabilities safely
  const p1X2 = mlPredictions?.["1x2"]?.probabilities;
  const pOU = mlPredictions?.["ou_2_5"]?.probabilities;
  const pBTTS = mlPredictions?.["btts"]?.probabilities;

  const totalElo = (home?.elo || 1500) + (away?.elo || 1500);
  const homeWinProb = totalElo > 0 ? Math.round(((home?.elo || 1500) / totalElo) * 100) : 50;
  const awayWinProb = 100 - homeWinProb;

  return (
    <section className="glass-card flex-col gap-20 p-20 mt-20" aria-labelledby="match-intel-title">
      <div className="flex-center gap-8">
        <Brain size={20} className="text-primary" aria-hidden="true" />
        <h3 id="match-intel-title" className="text-primary font-bold text-md">Match Intelligence</h3>
      </div>

      {/* ZOKASCORE V2 ML PREDICTIONS */}
      {mlPredictions ? (
        <div className="glass-card p-16 flex-col gap-8" style={{ background: 'linear-gradient(135deg, rgba(var(--primary-rgb), 0.08), rgba(var(--accent-rgb), 0.05))', border: '1px solid rgba(var(--primary-rgb), 0.2)' }}>
          <div className="flex-center gap-8 text-primary font-bold text-sm uppercase">
            <Zap size={14} fill="currentColor" /> Zoka AI Predictions
          </div>
          
          {p1X2 && (
            <ProbBar 
              label="1X2 Probability" 
              homeProb={p1X2.HOME_WIN || 0} 
              drawProb={p1X2.DRAW || 0} 
              awayProb={p1X2.AWAY_WIN || 0} 
            />
          )}
          
          <div className="grid grid-cols-2 gap-12 mt-12">
            {pOU && (
              <div className="glass-card p-12 flex-col gap-4">
                <div className="text-muted text-xs font-bold uppercase">Over/Under 2.5</div>
                <div className="flex-between text-sm font-bold">
                  <span className="text-primary">Over: {pOU.OVER ? pOU.OVER.toFixed(1) : '-'}%</span>
                  <span className="text-danger">Under: {pOU.UNDER ? pOU.UNDER.toFixed(1) : '-'}%</span>
                </div>
              </div>
            )}
            {pBTTS && (
              <div className="glass-card p-12 flex-col gap-4">
                <div className="text-muted text-xs font-bold uppercase">BTTS</div>
                <div className="flex-between text-sm font-bold">
                  <span className="text-success">Yes: {pBTTS.YES ? pBTTS.YES.toFixed(1) : '-'}%</span>
                  <span className="text-muted">No: {pBTTS.NO ? pBTTS.NO.toFixed(1) : '-'}%</span>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="glass-card p-16 flex-col gap-8 items-center text-center" style={{ border: '1px dashed rgba(var(--primary-rgb), 0.3)' }}>
          <Activity size={20} className="text-muted" />
          <div className="text-muted text-sm font-bold uppercase">ML Prediction Pending</div>
          <p className="text-muted text-xs">Our AI models are still analyzing this match. Check back closer to kickoff!</p>
        </div>
      )}

      {/* Elo & Win Probability (Historical) */}
      <div className="flex-col gap-8">
        <div className="text-muted text-xs font-bold uppercase">Strength (Elo)</div>
        {home && away ? (
          <>
            <div className="flex h-8 rounded-md overflow-hidden bg-elevated" role="progressbar">
              <div style={{ width: `${homeWinProb}%`, background: 'var(--primary)', transition: 'width 1s ease' }} aria-label={`${homeName} strength`} />
              <div style={{ width: `${awayWinProb}%`, background: 'var(--danger)', transition: 'width 1s ease' }} aria-label={`${awayName} strength`} />
            </div>
            <div className="flex-between text-xs font-bold mt-4">
              <span className="text-primary">{home.elo || 'N/A'} ({homeWinProb}%)</span>
              <span className="text-muted">Elo Rating</span>
              <span className="text-danger">{away.elo || 'N/A'} ({awayWinProb}%)</span>
            </div>
          </>
        ) : (
          <div className="text-muted text-sm text-center py-8 flex-center gap-8">
            <Loader size={14} className="animate-spin" /> Calculating Elo Ratings...
          </div>
        )}
      </div>

      {/* Recent Form (Historical) */}
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

      {/* H2H Summary (Historical) */}
      <div className="glass-card p-12 flex-col gap-8">
        <div className="flex-center gap-4 text-muted text-xs font-bold uppercase">
          <Swords size={12} /> Head-to-Head (All Time)
        </div>
        {h2h && h2h.meetings > 0 ? (
          <div className="flex-between text-sm font-bold">
            <span className="text-primary">{h2h.teamA_wins} Wins</span>
            <span className="text-muted">{h2h.draws} Draws</span>
            <span className="text-danger">{h2h.teamB_wins} Wins</span>
          </div>
        ) : (
          <div className="text-muted text-sm text-center py-8 flex-center gap-8">
            <Loader size={14} className="animate-spin" /> Loading H2H History...
          </div>
        )}
      </div>
    </section>
  );
}