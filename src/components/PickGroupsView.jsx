// src/components/PickGroupsView.jsx
import { useState, useRef } from 'react';
import { Share2, Copy, Camera, AlertTriangle, Sparkles } from 'lucide-react';
import { shareText, screenshotNode } from '../utils/shareUtils';
import { useToast } from '../core/ToastManager';

const CHIP = {
  PURE: { bg: '#b8860b', fg: '#0b0e14', label: '🟨 PURE' },
  STRONG: { bg: '#1f7a3d', fg: '#fff', label: '🟩 STRONG' },
  STANDARD: { bg: '#555', fg: '#fff', label: 'STANDARD' },
  RISKY: { bg: '#a02020', fg: '#fff', label: '🟥 RISKY' },
};
const RESULT_STYLE = {
  WON: { bg: '#1f7a3d', fg: '#fff', icon: '✅' },
  LOST: { bg: '#a02020', fg: '#fff', icon: '❌' },
  PENDING: { bg: '#444', fg: '#ddd', icon: '⏳' },
};
const FAMILY_META = {
  TOP10_DAILY: { title: '🔥 TOP 10 DAILY', accent: '#b8860b' },
  PURE_1X2: { title: '🔒 1X2' },
  GG_BTTS: { title: '⚽ GG / BTTS' },
  OVER_UNDER: { title: '📈 OVER / UNDER' },
  SCORE: { title: '🎯 CORRECT SCORE' },
  LOW_CONFIDENCE: { title: '⚠️ RISKY ZONE', risky: true },
};

/* ★ LOCKED to pipeline contract §3 — no more defensive chains */
const pickLabel = (p) => p.pick || '—';
const pickTeams = (p) => `${p.home || 'Home'} v ${p.away || 'Away'}`;
const pickProb = (p) => (p.probability != null ? Math.round(p.probability * 10) / 10 : null);
const pickQuality = (p) => String(p.quality || 'STANDARD').toUpperCase();
const pickLeague = (p) => p.league || '';
const pickResult = (p) => String(p.result || 'PENDING').toUpperCase();
const pickFinal = (p) => p.finalScore || null;
const tierPicks = (t) => t.picks || [];
const tierShare = (t) => t.share_text || null;
const tierShareResolved = (t) => t.share_text_resolved || t.share_text || null;
const tierResults = (t) => t.results || null;
const tierLabel = (t) => (t.tier === 1 ? 'TOP 10' : `Group ${t.tier}`);

function Chip({ q }) {
  const c = CHIP[q] || CHIP.STANDARD;
  return <span style={{ background: c.bg, color: c.fg, borderRadius: 8, fontSize: 10, padding: '2px 6px', fontWeight: 700 }}>{c.label}</span>;
}

function ResultChip({ r, finalScore }) {
  const s = RESULT_STYLE[r] || RESULT_STYLE.PENDING;
  return (
    <span style={{ background: s.bg, color: s.fg, borderRadius: 8, fontSize: 10, padding: '2px 6px', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {s.icon} {r}{finalScore && r !== 'PENDING' ? ` ${finalScore}` : ''}
    </span>
  );
}

/* ★ React #31 FIX: quality_summary is an OBJECT { PURE: 4, STRONG: 5 } —
   never render it as a raw child */
function QualitySummary({ qs }) {
  if (!qs || typeof qs !== 'object' || Array.isArray(qs)) return null;
  const parts = ['PURE', 'STRONG', 'STANDARD', 'RISKY'].filter((q) => qs[q]).map((q) => `${q} ${qs[q]}`);
  if (!parts.length) return null;
  return <span className="badge">{parts.join(' · ')}</span>;
}

export default function PickGroupsView({ data, date }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const shotRefs = useRef(new Map());
  const setShotRef = (id) => (el) => { el ? shotRefs.current.set(id, el) : shotRefs.current.delete(id); };

  const familyOrder = data?.familyOrder || Object.keys(data?.groups || {});
  const groups = data?.groups || {};
  const overall = data?.results || null;

  const flash = (m, err = false) => (err ? toast.error(m) : toast.success(m));

  const doShare = async (key, tier) => {
    const res = tierResults(tier);
    const text = res?.settled > 0 ? tierShareResolved(tier) : tierShare(tier);
    if (!text) return flash('Sharing soon', true);
    setBusy(`${key}:${tier.tier}:share`);
    try {
      const r = await shareText('ZOKASCORE', text);
      flash(r === 'copied' ? 'Copied to clipboard ✓' : 'Shared ✓');
    } finally { setBusy(null); }
  };

  const doCopy = async (key, tier) => {
    const res = tierResults(tier);
    const text = res?.settled > 0 ? tierShareResolved(tier) : tierShare(tier);
    if (!text) return flash('Nothing to copy yet', true);
    setBusy(`${key}:${tier.tier}:copy`);
    try { await navigator.clipboard.writeText(text); flash('Copied ✓'); }
    finally { setBusy(null); }
  };

  const doShot = async (key, tier) => {
    setBusy(`${key}:${tier.tier}:shot`);
    try {
      await screenshotNode(shotRefs.current.get(`${key}:${tier.tier}`), `zokascore-${key}-g${tier.tier}-${date}.png`);
      flash('Image saved ✓');
    } catch { flash('Screenshot failed', true); }
    finally { setBusy(null); }
  };

  if (!familyOrder.length) return null;

  return (
    <div className="pg-view">
      {overall && overall.settled > 0 && (
        <div className="glass-card p-12 mb-16 flex-center gap-10 text-xs" style={{ justifyContent: 'center' }}>
          <Sparkles size={14} className="gold" />
          <span>Today's groups so far:</span>
          <strong style={{ color: '#1f7a3d' }}>✅ {overall.won}W</strong>
          <strong style={{ color: '#a02020' }}>❌ {overall.lost}L</strong>
          {overall.pending > 0 && <span className="muted">⏳ {overall.pending}</span>}
          {overall.accuracy != null && <span className="badge">{overall.accuracy}% hit rate</span>}
        </div>
      )}

      {familyOrder.map((famKey) => {
        const meta = FAMILY_META[famKey] || { title: famKey };
        const fam = groups[famKey] || {};
        const tiers = fam.tiers || (tierPicks(fam).length ? [fam] : []);

        return (
          <div key={famKey} className="mb-20">
            <div className="flex-center gap-8 mb-10 flex-wrap">
              <h2 className="section-h2 mb-0" style={meta.accent ? { color: meta.accent } : undefined}>{meta.title}</h2>
              {meta.risky && <span className="badge flex-center gap-4" style={{ background: '#a02020', color: '#fff' }}><AlertTriangle size={12} /> risky</span>}
            </div>

            {tiers.map((tier, tIdx) => {
              const tierNum = tier.tier ?? tIdx + 1;
              const id = `${famKey}:${tierNum}`;
              const picks = tierPicks(tier);
              const res = tierResults(tier);
              return (
                <div key={id} className="glass-card p-14 mb-12">
                  <div ref={setShotRef(id)} style={{ padding: 4 }}>
                    <div className="flex-center gap-8 mb-8 flex-wrap">
                      <strong>{tierLabel(tier)}</strong>
                      <QualitySummary qs={tier.quality_summary} />
                      {res && (
                        <span className="badge" style={{ background: res.complete ? '#1f7a3d' : '#444', color: '#fff' }}>
                          {res.complete ? 'FINAL ' : ''}✅ {res.won}W ❌ {res.lost}L{res.pending ? ` ⏳ ${res.pending}` : ''}{res.accuracy != null ? ` · ${res.accuracy}%` : ''}
                        </span>
                      )}
                      <span className="text-xs muted">{picks.length} picks</span>
                    </div>
                    <div className="flex-col gap-6">
                      {picks.map((p, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span className="rank">{i + 1}</span>
                          <Chip q={pickQuality(p)} />
                          <span className="flex-1 truncate">
                            <strong>{pickLabel(p)}</strong> — {pickTeams(p)}
                            <span className="text-xs muted">{pickLeague(p) ? ` · ${pickLeague(p)}` : ''}</span>
                          </span>
                          {pickProb(p) != null && <strong className="primary">{pickProb(p)}%</strong>}
                          <ResultChip r={pickResult(p)} finalScore={pickFinal(p)} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex-center gap-8 mt-8">
                    <button className="btn btn-primary btn-sm" onClick={() => doShare(famKey, tier)} disabled={!!busy}>
                      {busy === `${id}:share` ? '…' : <><Share2 size={14} /> Share{res?.settled > 0 ? ' (results)' : ''}</>}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => doCopy(famKey, tier)} disabled={!!busy}>
                      {busy === `${id}:copy` ? '…' : <><Copy size={14} /> Copy</>}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => doShot(famKey, tier)} disabled={!!busy}>
                      {busy === `${id}:shot` ? '…' : <><Camera size={14} /> Image</>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}