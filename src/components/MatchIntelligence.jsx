// frontend/src/components/MatchIntelligence.jsx
import React from 'react';
import { Brain, TrendingUp, Swords, Zap, Activity, Loader, ChevronRight } from 'lucide-react';

const FormGuide = ({ form }) => {
  if (!form || form.length === 0) return <span className="text-muted text-xs">N/A</span>;
  return (
    <div className="flex gap-4 flex-wrap">
      {form.map((m, i) => {
        const color = m === 'W' ? 'var(--primary)' : m === 'D' ? 'var(--text-muted)' : 'var(--danger)';
        return (
          <div key={i} style={{ background: color, width: '20px', height: '20px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '10px', fontWeight: 'bold' }}>
            {m}
          </div>
        );
      })}
    </div>
  );
};

const ProbBar = ({ label, homeProb, drawProb, awayProb }) => (
  <div className="flex-col gap-4 mt-4">
    <div className="text-muted text-xs font-bold uppercase">{label}</div>
    <div className="flex h-6 rounded-md overflow-hidden bg-elevated" role="progressbar">
      {homeProb > 0 && <div style={{ width: `${homeProb}%`, background: 'var(--primary)' }} title={`Home ${homeProb}%`} />}
      {drawProb > 0 && <div style={{ width: `${drawProb}%`, background: 'var(--text-muted)' }} title={`Draw ${drawProb}%`} />}
      {awayProb > 0 && <div style={{ width: `${awayProb}%`, background: 'var(--danger)' }} title={`Away ${awayProb}%`} />}
    </div>
  </div>
);

export default function MatchIntelligence({ data, homeName, awayName, mlPredictions }) {
  const { home, away, h2h } = data || {};
  
  const p1X2 = mlPredictions?.["1x2"]?.probabilities;
  const pOU = mlPredictions?.["ou_2_5"]?.probabilities;
  const pBTTS = mlPredictions?.["btts"]?.probabilities;
  const csMatrix = mlPredictions?.["correct_scores"];

  const overVal = pOU?.OVER ? Number(pOU.OVER).toFixed(0) + '%' : '-';
  const underVal = pOU?.UNDER ? Number(pOU.UNDER).toFixed(0) + '%' : '-';
  const yesVal = pBTTS?.YES ? Number(pBTTS.YES).toFixed(0) + '%' : '-';
  const noVal = pBTTS?.NO ? Number(pBTTS.NO).toFixed(0) + '%' : '-';

  const totalElo = (home?.elo || 1500) + (away?.elo || 1500);
  const homeWinProb = totalElo > 0 ? Math.round(((home?.elo || 1500) / totalElo) * 100) : 50;
  const awayWinProb = 100 - homeWinProb;

  // Get top 3 correct scores
  const topScores = csMatrix ? Object.entries(csMatrix).slice(0, 3) : [];

  return (
    <section className="glass-card flex-col gap-12 p-16 mt-12" aria-labelledby="match-intel-title">
      <div className="flex-center gap-8 mb-4">
        <Brain size={18} className="text-primary" aria-hidden="true" />
        <h3 id="match-intel-title" className="text-primary font-bold text-sm">Match Intelligence</h3>
      </div>

      {mlPredictions ? (
        <div className="glass-card p-12 flex-col gap-8" style={{ background: 'linear-gradient(135deg, rgba(var(--primary-rgb), 0.08), rgba(var(--accent-rgb), 0.05))', border: '1px solid rgba(var(--primary-rgb), 0.2)' }}>
          <div className="flex-center gap-8 text-primary font-bold text-xs uppercase">
            <Zap size={12} fill="currentColor" /> Zoka AI Predictions
          </div>
          
          {p1X2 && <ProbBar label="1X2 Probability" homeProb={p1X2.HOME_WIN || 0} drawProb={p1X2.DRAW || 0} awayProb={p1X2.AWAY_WIN || 0} />}
          
          <div className="grid grid-cols-2 gap-8 mt-8">
            {pOU && (
              <div className="glass-card p-8 flex-col gap-4">
                <div className="text-muted text-xs font-bold uppercase">O/U 2.5</div>
                <div className="flex-between text-xs font-bold">
                  <span className="text-primary">O: {overVal}</span>
                  <span className="text-danger">U: {underVal}</span>
                </div>
              </div>
            )}
            {pBTTS && (
              <div className="glass-card p-8 flex-col gap-4">
                <div className="text-muted text-xs font-bold uppercase">BTTS</div>
                <div className="flex-between text-xs font-bold">
                  <span className="text-success">Y: {yesVal}</span>
                  <span className="text-muted">N: {noVal}</span>
                </div>
              </div>
            )}
          </div>

          {/* ★ NEW: Correct Score Matrix */}
          {topScores.length > 0 && (
            <div className="mt-8 pt-8 border-t border-border">
              <div className="text-muted text-xs font-bold uppercase mb-4">Top Correct Scores</div>
              <div className="flex gap-8 flex-wrap">
                {topScores.map(([score, prob], i) => (
                  <div key={score} className="flex-col items-center p-8 rounded-lg" style={{ background: i === 0 ? 'rgba(var(--accent-rgb), 0.1)' : 'var(--bg-elevated)', border: `1px solid ${i === 0 ? 'rgba(var(--accent-rgb), 0.3)' : 'var(--border)'}` }}>
                    <span className="font-extrabold text-sm" style={{ color: i === 0 ? 'var(--accent)' : 'var(--text-primary)' }}>{score}</span>
                    <span className="text-muted text-xs font-bold">{prob}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="glass-card p-12 flex-col gap-8 items-center text-center" style={{ border: '1px dashed rgba(var(--primary-rgb), 0.3)' }}>
          <Activity size={18} className="text-muted" />
          <div className="text-muted text-xs font-bold uppercase">ML Prediction Pending</div>
        </div>
      )}

      <div className="flex-col gap-4 mt-4">
        <div className="text-muted text-xs font-bold uppercase">Strength (Elo)</div>
        {home && away ? (
          <>
            <div className="flex h-6 rounded-md overflow-hidden bg-elevated" role="progressbar">
              <div style={{ width: `${homeWinProb}%`, background: 'var(--primary)', transition: 'width 1s ease' }} aria-label={`${homeName} strength`} />
              <div style={{ width: `${awayWinProb}%`, background: 'var(--danger)', transition: 'width 1s ease' }} aria-label={`${awayName} strength`} />
            </div>
            <div className="flex-between text-xs font-bold mt-4">
              <span className="text-primary">{home.elo || 'N/A'} ({homeWinProb}%)</span>
              <span className="text-danger">{away.elo || 'N/A'} ({awayWinProb}%)</span>
            </div>
          </>
        ) : (
          <div className="text-muted text-xs text-center py-4 flex-center gap-8">
            <Loader size={12} className="animate-spin" /> Calculating Elo...
          </div>
        )}
      </div>

      <div className="grid gap-8 mt-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="glass-card p-8 flex-col gap-4" style={{ background: 'rgba(var(--primary-rgb), 0.03)' }}>
          <div className="flex-center gap-4 text-muted text-xs font-bold uppercase">
            <TrendingUp size={10} /> {homeName}
          </div>
          <FormGuide form={home?.form} />
        </div>
        <div className="glass-card p-8 flex-col gap-4" style={{ background: 'rgba(var(--danger-rgb), 0.03)' }}>
          <div className="flex-center gap-4 text-muted text-xs font-bold uppercase">
            <TrendingUp size={10} /> {awayName}
          </div>
          <FormGuide form={away?.form} />
        </div>
      </div>

      <div className="glass-card p-8 flex-col gap-4 mt-4">
        <div className="flex-center gap-4 text-muted text-xs font-bold uppercase">
          <Swords size={10} /> Head-to-Head (All Time)
        </div>
        {h2h && h2h.meetings > 0 ? (
          <div className="flex-between text-xs font-bold">
            <span className="text-primary">{h2h.teamA_wins}W</span>
            <span className="text-muted">{h2h.draws}D</span>
            <span className="text-danger">{h2h.teamB_wins}W</span>
          </div>
        ) : (
          <div className="text-muted text-xs text-center py-4 flex-center gap-8">
            <Loader size={12} className="animate-spin" /> Loading H2H...
          </div>
        )}
      </div>
    </section>
  );
}