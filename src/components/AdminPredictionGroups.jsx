// src/components/AdminPredictionGroups.jsx
import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Share2, Copy, Camera, Rocket, RefreshCw, Calendar, AlertTriangle } from 'lucide-react';
import { footballApi } from '../services/footballApi';
import { shareText, screenshotNode } from '../utils/shareUtils';
import { todayStr } from '../utils/dates';

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

/* Defensive accessors — locked to pipeline keys once you paste a real tier */
const pickLabel = (p) => p.pick || p.label || p.market || p.prediction || '—';
const pickTeams = (p) => p.teams || (p.home && p.away ? `${p.home} v ${p.away}` : p.match || p.fixture || '—');
const pickProb = (p) => p.probability ?? p.prob ?? p.confidence ?? null;
const pickQuality = (p) => String(p.quality || p.grade || 'STANDARD').toUpperCase();
const pickLeague = (p) => p.league || p.competition || '';
const pickResult = (p) => String(p.result || 'PENDING').toUpperCase();
const pickFinal = (p) => p.finalScore || null;
const tierPicks = (t) => t.picks || t.matches || t.items || [];
const tierShare = (t) => t.share_text || t.shareText || null;
const tierShareResolved = (t) => t.share_text_resolved || tierShare(t);
const tierResults = (t) => t.results || null;

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

export default function AdminPredictionGroups() {
  const [date, setDate] = useState(todayStr());
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState('');
  const shotRefs = useRef(new Map());
  const setShotRef = (id) => (el) => { el ? shotRefs.current.set(id, el) : shotRefs.current.delete(id); };

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['adminPickGroups', date],
    queryFn: () => footballApi.getAdminPickGroups(date),
    enabled: !!date,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000, // tracks Step 50 refresh + FT resolution automatically
  });

  const familyOrder = data?.familyOrder || [];
  const groups = data?.groups || {};
  const overall = data?.results || null;
  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2200); };

  const doShare = async (key, tier, resolved) => {
    const text = resolved ? tierShareResolved(tier) : tierShare(tier);
    if (!text) return flash('No share text on this tier');
    setBusy(`${key}:${tier.tier}:share${resolved ? 'R' : ''}`);
    try {
      const r = await shareText(`ZOKASCORE ${key}`, text);
      flash(r === 'copied' ? 'Copied ✓' : 'Shared ✓');
    } finally { setBusy(null); }
  };

  const doCopy = async (key, tier, resolved) => {
    const text = resolved ? tierShareResolved(tier) : tierShare(tier);
    if (!text) return flash('No share text on this tier');
    setBusy(`${key}:${tier.tier}:copy${resolved ? 'R' : ''}`);
    try { await navigator.clipboard.writeText(text); flash('Copied ✓'); }
    finally { setBusy(null); }
  };

  const doShot = async (key, tier) => {
    setBusy(`${key}:${tier.tier}:shot`);
    try {
      await screenshotNode(shotRefs.current.get(`${key}:${tier.tier}`), `zokascore-${key}-g${tier.tier}-${date}.png`);
      flash('Screenshot saved ✓');
    } catch { flash('Screenshot failed'); }
    finally { setBusy(null); }
  };

  const doPublish = async (families) => {
    setBusy('publish');
    try {
      const r = await footballApi.publishAdminPickGroups(date, families);
      flash(`Published: ${r.families?.join(', ') || date} ✓`);
      refetch();
    } catch { flash('Publish failed'); }
    finally { setBusy(null); }
  };

  return (
    <div className="zoka-page">
      <div className="zoka-wrap">
        {/* ── toolbar ── */}
        <div className="glass-card p-16 mb-16 flex-center gap-12 flex-wrap">
          <Calendar size={18} />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
          <button className="btn btn-ghost btn-sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={isFetching ? 'spin' : ''} /> Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => doPublish(null)} disabled={!!busy}>
            {busy === 'publish' ? 'Publishing…' : <><Rocket size={14} /> Publish all</>}
          </button>
          {data?.source && <span className="text-xs muted">source: {data.source}{data.fallback ? ' ⚠ fallback' : ''}</span>}
          {overall && overall.settled > 0 && (
            <span className="text-xs">
              ✅ {overall.won}W · ❌ {overall.lost}L{overall.pending ? ` · ⏳ ${overall.pending}` : ''}
              {overall.accuracy != null ? ` · ${overall.accuracy}%` : ''}
            </span>
          )}
        </div>

        {toast && <div className="glass-card p-8 mb-12 text-center text-sm">{toast}</div>}

        {isLoading ? (
          <div className="glass-card p-20"><p className="empty-loading">Loading pick groups…</p></div>
        ) : familyOrder.length === 0 ? (
          <div className="glass-card p-20"><p className="empty-loading">No groups for {date}. Run Step 50.</p></div>
        ) : (
          familyOrder.map((famKey) => {
            const meta = FAMILY_META[famKey] || { title: famKey };
            const fam = groups[famKey] || {};
            const tiers = fam.tiers || (tierPicks(fam).length ? [fam] : []);

            return (
              <div key={famKey} className="mb-24">
                <div className="flex-center gap-12 mb-12 flex-wrap">
                  <h2 className="section-h2 mb-0" style={meta.accent ? { color: meta.accent } : undefined}>{meta.title}</h2>
                  {meta.risky && <span className="badge flex-center gap-4" style={{ background: '#a02020', color: '#fff' }}><AlertTriangle size={12} /> risky</span>}
                  <button className="btn btn-ghost btn-sm" onClick={() => doPublish([famKey])} disabled={!!busy}>
                    <Rocket size={12} /> Publish this
                  </button>
                </div>

                {tiers.map((tier, tIdx) => {
                  const tierNum = tier.tier ?? tIdx + 1;
                  const id = `${famKey}:${tierNum}`;
                  const picks = tierPicks(tier);
                  const res = tierResults(tier);

                  return (
                    <div key={id} className="glass-card p-16 mb-12">
                      {/* shot area: no buttons inside — captures chips + results */}
                      <div ref={setShotRef(id)} style={{ padding: 8 }}>
                        <div className="flex-center gap-8 mb-8 flex-wrap">
                          <strong>Group {tierNum}</strong>
                          {tier.quality_summary && <span className="badge">{tier.quality_summary}</span>}
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

                      <div className="flex-center gap-8 mt-8 flex-wrap">
                        <button className="btn btn-primary btn-sm" onClick={() => doShare(famKey, tier, true)} disabled={!!busy} title="Share with results marked">
                          {busy === `${id}:shareR` ? '…' : <><Share2 size={14} /> Share{res?.settled > 0 ? ' (resulted)' : ''}</>}
                        </button>
                        {tierShare(tier) && (
                          <button className="btn btn-ghost btn-sm" onClick={() => doShare(famKey, tier, false)} disabled={!!busy} title="Share the original pre-match text">
                            {busy === `${id}:share` ? '…' : <><Share2 size={14} /> Share original</>}
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => doCopy(famKey, tier, true)} disabled={!!busy}>
                          {busy === `${id}:copyR` ? '…' : <><Copy size={14} /> Copy</>}
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
          })
        )}
      </div>
    </div>
  );
}