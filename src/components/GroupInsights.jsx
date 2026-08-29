// src/components/GroupInsights.jsx
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Flame, TrendingUp, ChevronDown, ChevronUp, Share2, Zap } from 'lucide-react';
import { footballApi } from '../services/footballApi';
import { shareText } from '../utils/shareUtils';
import { useToast } from '../core/ToastManager';

const FAM_LABEL = {
  TOP10_DAILY: '🔥 TOP10', PURE_1X2: '🔒 1X2', GG_BTTS: '⚽ GG',
  OVER_UNDER: '📈 O/U', SCORE: '🎯 CS',
};

/* Pure-SVG bar chart — zero dependencies */
function StreakChart({ series }) {
  if (!series?.length) return null;
  const W = 340, H = 130, PAD_B = 18, PAD_T = 14, GAP = 5;
  const n = series.length;
  const bw = (W - GAP * (n - 1)) / n;
  const usable = H - PAD_B - PAD_T;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label="Daily hit-rate chart">
      {/* 50% baseline */}
      <line x1="0" x2={W} y1={PAD_T + usable * 0.5} y2={PAD_T + usable * 0.5} stroke="rgba(128,128,128,.35)" strokeDasharray="3 3" strokeWidth="1" />
      {series.map((d, i) => {
        const x = i * (bw + GAP);
        const hasData = d.accuracy != null;
        const h = hasData ? Math.max(3, (d.accuracy / 100) * usable) : 3;
        const y = hasData ? PAD_T + usable - h : PAD_T + usable - 3;
        const fill = !hasData ? '#444' : d.accuracy >= 50 ? '#1f7a3d' : '#a02020';
        return (
          <g key={d.date}>
            <rect x={x} y={y} width={bw} height={h} rx={3} fill={fill} opacity={d.final ? 1 : 0.75}>
              <title>{`${d.date}: ${d.accuracy != null ? `${d.accuracy}% (${d.won}W-${d.lost}L)` : 'no settled picks'}${d.final ? ' · final' : ''}`}</title>
            </rect>
            {d.hot && <text x={x + bw / 2} y={y - 3} textAnchor="middle" fontSize="9">🔥</text>}
            <text x={x + bw / 2} y={H - 5} textAnchor="middle" fontSize="8" fill="var(--text-muted, #888)">{d.date.slice(8)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function GroupInsights() {
  const toast = useToast();
  const [expandedDay, setExpandedDay] = useState(null);
  const [famFilter, setFamFilter] = useState('ALL');

  const { data } = useQuery({
    queryKey: ['groupHistory', 10],
    queryFn: () => footballApi.getGroupHistory(10).then((r) => r?.data || null),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  const families = useMemo(() => Object.keys(data?.families || {}), [data]);
  const series = data?.series || [];
  const streaks = data?.streaks || { current: 0, best: 0 };
  const totals = data?.totals || { accuracy: null, settled: 0, won: 0, lost: 0 };

  const shareRecord = async () => {
    if (!totals.accuracy) return;
    const bestFam = Object.entries(data?.families || {})
      .filter(([, f]) => f.accuracy != null && f.settled >= 5)
      .sort((a, b) => b[1].accuracy - a[1].accuracy)[0];
    const famLine = bestFam
      ? ` ${FAM_LABEL[bestFam[0]] || bestFam[0]} hit ${bestFam[1].accuracy}% over ${bestFam[1].days} days.`
      : '';
    const text = `⚡ ZOKASCORE Expert Groups: ${totals.accuracy}% hit rate over the last ${totals.days} days (${totals.won}W-${totals.lost}L).${famLine} Think you can beat the model? Play: ${window.location.origin}/predictions`;
    const r = await shareText('ZOKASCORE Record', text);
    toast.success(r === 'copied' ? 'Copied ✓' : 'Shared ✓');
  };

  if (!data || totals.days === 0) return null; // silently absent until archive has ≥1 day

  const famTotals = famFilter !== 'ALL' ? data.families[famFilter] : null;

  return (
    <div className="glass-card p-16 mb-16">
      <div className="flex-between mb-8 flex-wrap gap-8">
        <h2 className="section-h2 mb-0 flex-center gap-6"><TrendingUp size={16} /> Group Performance</h2>
        {streaks.current > 1 && (
          <span className="badge flex-center gap-4" style={{ background: '#b8860b', color: '#0b0e14', fontWeight: 800 }}>
            <Flame size={12} /> {streaks.current}-day hot streak
          </span>
        )}
      </div>

      {/* headline numbers */}
      <div className="v21-stats mb-12">
        <div className="v21-stat"><div className="n primary">{totals.accuracy ?? '—'}%</div><div className="l">Hit rate</div></div>
        <div className="v21-stat"><div className="n gold">✅ {totals.won}</div><div className="l">Won</div></div>
        <div className="v21-stat"><div className="n" style={{ color: '#a02020' }}>❌ {totals.lost}</div><div className="l">Lost</div></div>
        <div className="v21-stat"><div className="n accent">🔥 {streaks.best}</div><div className="l">Best streak</div></div>
      </div>

      {/* family filter chips */}
      {families.length > 0 && (
        <div className="flex-center gap-6 mb-10 flex-wrap">
          <button className={`v21-fbtn${famFilter === 'ALL' ? ' on' : ''}`} style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setFamFilter('ALL')}>ALL</button>
          {families.map((f) => (
            <button key={f} className={`v21-fbtn${famFilter === f ? ' on' : ''}`} style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setFamFilter(f)}>
              {FAM_LABEL[f] || f}{data.families[f].accuracy != null ? ` ${data.families[f].accuracy}%` : ''}
            </button>
          ))}
        </div>
      )}

      {/* chart */}
      <StreakChart series={series} />

      {/* viral CTA */}
      {totals.accuracy != null && totals.settled >= 10 && (
        <div className="flex-center gap-8 mt-10 flex-wrap" style={{ justifyContent: 'center' }}>
          <span className="text-xs muted">
            {famTotals
              ? `${FAM_LABEL[famFilter] || famFilter}: ${famTotals.accuracy}% over ${famTotals.days} days`
              : `The model hit ${totals.accuracy}% over ${totals.days} days`}
          </span>
          <button className="btn btn-primary btn-sm" onClick={shareRecord}><Share2 size={12} /> Share our record</button>
          <a className="btn btn-ghost btn-sm" href="/predictions?tab=mine"><Zap size={12} /> Beat the model</a>
        </div>
      )}

      {/* last 10 days list */}
      <div className="mt-12">
        <div className="text-xs muted mb-6" style={{ fontWeight: 700 }}>LAST {series.length} DAYS — tap to expand</div>
        {[...series].reverse().map((d) => {
          const day = data.days.find((x) => x.date === d.date);
          const open = expandedDay === d.date;
          return (
            <div key={d.date} className="mb-6">
              <button
                className="md-mini-row hover-primary"
                style={{ display: 'flex', width: '100%', gap: 8, alignItems: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}
                onClick={() => setExpandedDay(open ? null : d.date)}
              >
                {d.hot && <Flame size={12} className="gold" />}
                <span className="font-bold" style={{ minWidth: 86 }}>{d.date.slice(5)}</span>
                <span className="flex-1 text-xs muted">{d.won}W - {d.lost}L{d.picks ? ` · ${d.picks} picks` : ''}</span>
                <strong style={{ color: d.accuracy >= 50 ? '#1f7a3d' : '#a02020' }}>{d.accuracy != null ? `${d.accuracy}%` : '—'}</strong>
                {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {open && day && (
                <div className="flex-col gap-4 mt-4" style={{ padding: '0 10px' }}>
                  {Object.entries(day.families || {}).map(([f, s]) => (
                    <div key={f} className="flex-center gap-8 text-xs" style={{ justifyContent: 'space-between' }}>
                      <span>{FAM_LABEL[f] || f}</span>
                      <span className="muted">{s.won}W - {s.lost}L</span>
                      <strong style={{ color: s.accuracy >= 50 ? '#1f7a3d' : '#a02020' }}>{s.accuracy != null ? `${s.accuracy}%` : '—'}</strong>
                    </div>
                  ))}
                  {day.bestDay && (
                    <div className="text-xs gold" style={{ paddingTop: 4 }}>⭐ Best tier: {day.bestDay.title} — {day.bestDay.accuracy}% ({day.bestDay.won}W-{day.bestDay.lost}L)</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}