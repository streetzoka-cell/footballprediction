import React from 'react';
import { Brain, TrendingUp, Swords, Zap, Activity, Loader } from 'lucide-react';

const FormGuide = ({ form }) => {
  if (!form?.length) return <span className="text-muted text-xs">N/A</span>;
  return (
    <div className="form-guide">
      {form.map((m, i) => {
        const cls = m === 'W' ? 'win' : m === 'D' ? 'draw' : 'loss';
        return <div key={i} className={`form-box ${cls}`}>{m}</div>;
      })}
    </div>
  );
};

const ProbBar = ({ label, homeProb, drawProb, awayProb }) => (
  <div className="prob-bar-wrap">
    <div className="prob-label">{label}</div>
    <div className="prob-track">
      {homeProb > 0 && <div className="prob-home" style={{ width: `${homeProb}%` }} />}
      {drawProb > 0 && <div className="prob-draw" style={{ width: `${drawProb}%` }} />}
      {awayProb > 0 && <div className="prob-away" style={{ width: `${awayProb}%` }} />}
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
  const topScores = csMatrix ? Object.entries(csMatrix).slice(0, 3) : [];

  return (
    <section className="glass-card intel-card" aria-labelledby="match-intel-title">
      <div className="intel-title"><Brain size={18} className="primary" /><h3 id="match-intel-title">Match Intelligence</h3></div>

      {mlPredictions ? (
        <div className="intel-ai-box">
          <div className="intel-ai-header"><Zap size={12} fill="currentColor" /> Zoka AI Predictions</div>
          {p1X2 && <ProbBar label="1X2 Probability" homeProb={p1X2.HOME_WIN || 0} drawProb={p1X2.DRAW || 0} awayProb={p1X2.AWAY_WIN || 0} />}
          <div className="intel-grid-2">
            {pOU && <div className="intel-mini-card"><div className="lbl">O/U 2.5</div><div className="flex-between font-bold text-xs"><span className="primary">O: {overVal}</span><span className="danger">U: {underVal}</span></div></div>}
            {pBTTS && <div className="intel-mini-card"><div className="lbl">BTTS</div><div className="flex-between font-bold text-xs"><span className="primary">Y: {yesVal}</span><span className="muted">N: {noVal}</span></div></div>}
          </div>
          {topScores.length > 0 && (
            <div className="intel-scores"><div className="lbl">Top Correct Scores</div><div className="flex gap-8 flex-wrap">{topScores.map(([score, prob], i) => <div key={score} className={`score-box ${i===0?'top':''}`}><span className="score">{score}</span><span className="prob">{prob}%</span></div>)}</div></div>
          )}
        </div>
      ) : (
        <div className="intel-pending"><Activity size={18} className="muted" /><div className="lbl">ML Prediction Pending</div></div>
      )}

      <div className="intel-elo"><div className="lbl">Strength (Elo)</div>
        {home && away ? (<><div className="elo-track"><div className="elo-home" style={{ width: `${homeWinProb}%` }} /><div className="elo-away" style={{ width: `${awayWinProb}%` }} /></div><div className="flex-between font-bold text-xs mt-4"><span className="primary">{home.elo} ({homeWinProb}%)</span><span className="danger">{away.elo} ({awayWinProb}%)</span></div></>) : <div className="flex-center gap-8 text-muted text-xs py-4"><Loader size={12} className="anim-spin" /> Calculating Elo...</div>}
      </div>

      <div className="intel-form-grid">
        <div className="intel-form-card home"><div className="lbl flex-center gap-4"><TrendingUp size={10} /> {homeName}</div><FormGuide form={home?.form} /></div>
        <div className="intel-form-card away"><div className="lbl flex-center gap-4"><TrendingUp size={10} /> {awayName}</div><FormGuide form={away?.form} /></div>
      </div>

      <div className="intel-h2h"><div className="lbl flex-center gap-4"><Swords size={10} /> Head-to-Head (All Time)</div>
        {h2h?.meetings > 0 ? <div className="flex-between font-bold text-xs"><span className="primary">{h2h.teamA_wins}W</span><span className="muted">{h2h.draws}D</span><span className="danger">{h2h.teamB_wins}W</span></div> : <div className="flex-center gap-8 text-muted text-xs py-4"><Loader size={12} className="anim-spin" /> Loading H2H...</div>}
      </div>
    </section>
  );
}