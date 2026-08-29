// src/components/PickGroupsView.jsx
import { useState, useMemo, useRef } from 'react';
import { Share2, Copy, Camera, AlertTriangle, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { shareText, screenshotNode } from '../utils/shareUtils';
import { useToast } from '../core/ToastManager';

const CHIP = {
  PURE: { bg: '#b8860b', fg: '#0b0e14', label: 'PURE' },
  STRONG: { bg: '#1f7a3d', fg: '#fff', label: 'STRONG' },
  STANDARD: { bg: '#555', fg: '#fff', label: 'STD' },
  RISKY: { bg: '#a02020', fg: '#fff', label: 'RISKY' },
};
const RESULT_STYLE = {
  WON: { bg: '#1f7a3d', fg: '#fff', icon: '✅' },
  LOST: { bg: '#a02020', fg: '#fff', icon: '❌' },
  PENDING: { bg: '#3a3f4a', fg: '#cfd4dd', icon: '⏳' },
};
const FAMILY_META = {
  TOP10_DAILY: { title: 'Top 10 Daily', emoji: '🔥', accent: '#b8860b' },
  PURE_1X2: { title: '1X2', emoji: '🔒' },
  GG_BTTS: { title: 'GG / BTTS', emoji: '⚽' },
  OVER_UNDER: { title: 'Over / Under', emoji: '📈' },
  SCORE: { title: 'Correct Score', emoji: '🎯' },
  LOW_CONFIDENCE: { title: 'Risky Zone', emoji: '⚠', risky: true },
};

/* ★ Locked to pipeline contract §3 */
const pickLabel = (p) => p.pick || '—';
const pickHome = (p) => p.home || 'Home';
const pickAway = (p) => p.away || 'Away';
const pickProb = (p) => (p.probability != null ? `${Math.round(p.probability * 10) / 10}%` : null);
const pickQuality = (p) => String(p.quality || 'STANDARD').toUpperCase();
const pickLeague = (p) => p.league || '';
const pickResult = (p) => String(p.result || 'PENDING').toUpperCase();
const pickFinal = (p) => p.finalScore || null;
const tierPicks = (t) => t.picks || [];
const tierShare = (t) => t.share_text || null;
const tierShareResolved = (t) => t.share_text_resolved || t.share_text || null;
const tierResults = (t) => t.results || null;
const tierLabel = (t) => (t.tier === 1 ? 'Top 10' : `Group ${t.tier}`);

function Chip({ q }) {
  const c = CHIP[q] || CHIP.STANDARD;
  return <span className="pg-chip" style={{ background: c.bg, color: c.fg }}>{c.label}</span>;
}

function ResultDot({ r, finalScore }) {
  if (r === 'PENDING') return <span className="pg-res pg-res-pending" title="Awaiting FT">⏳</span>;
  const cls = r === 'WON' ? 'pg-res-won' : 'pg-res-lost';
  return <span className={`pg-res ${cls}`} title={`FT ${finalScore || ''}`}>{r === 'WON' ? '✓' : '✗'}</span>;
}

/* quality_summary is an OBJECT { PURE: 4, STRONG: 5 } — compact inline form */
function QualitySummary({ qs }) {
  if (!qs || typeof qs !== 'object' || Array.isArray(qs)) return null;
  const parts = ['PURE', 'STRONG', 'STANDARD', 'RISKY'].filter((q) => qs[q]).map((q) => `${q} ${qs[q]}`);
  if (!parts.length) return null;
  return <span className="pg-qs">{parts.join(' · ')}</span>;
}

function WLSummary({ res }) {
  if (!res) return null;
  return (
    <span className="pg-wl">
      <b className="pg-won">✅ {res.won}</b>
      <b className="pg-lost">❌ {res.lost}</b>
      {res.pending > 0 && <b className="pg-pend">⏳ {res.pending}</b>}
      {res.accuracy != null && <b className="pg-acc">{res.accuracy}%</b>}
      {res.complete && <b className="pg-final">FINAL</b>}
    </span>
  );
}

/* ── one pick row — mobile-first two-line grid ── */
function PickRow({ p, i }) {
  return (
    <div className="pg-row">
      <span className="pg-rank">{i + 1}</span>
      <div className="pg-row-main">
        <div className="pg-row-l1">
          <Chip q={pickQuality(p)} />
          <span className="pg-pick">{pickLabel(p)}</span>
          <span className="pg-prob">{pickProb(p)}</span>
          <ResultDot r={pickResult(p)} finalScore={pickFinal(p)} />
        </div>
        <div className="pg-row-l2">
          {pickHome(p)} <span className="pg-v">v</span> {pickAway(p)}
          {pickLeague(p) && <span className="pg-league"> · {pickLeague(p)}</span>}
        </div>
      </div>
    </div>
  );
}

/* ── one tier block: header + rows + share row ── */
function TierBlock({ famKey, tier, busy, onShare, onCopy, onShot, shotRef, isHero }) {
  const picks = tierPicks(tier);
  const res = tierResults(tier);
  const id = `${famKey}:${tier.tier}`;
  const shareText = res?.settled > 0 ? tierShareResolved(tier) : tierShare(tier);

  return (
    <div className={`pg-tier${isHero ? ' pg-tier-hero' : ''}`}>
      <div className="pg-tier-head">
        <strong className="pg-tier-name">{tierLabel(tier)}</strong>
        <QualitySummary qs={tier.quality_summary} />
        <WLSummary res={res} />
        <span className="pg-count">{picks.length}</span>
      </div>

      <div className="pg-rows" ref={shotRef}>
        {picks.map((p, i) => <PickRow key={i} p={p} i={i} />)}
      </div>

      <div className="pg-actions">
        <button className="pg-act pg-act-primary" onClick={() => onShare(famKey, tier)} disabled={!!busy}>
          <Share2 size={12} /> {res?.settled > 0 ? 'Share results' : 'Share'}
        </button>
        <button className="pg-act" onClick={() => onCopy(famKey, tier)} disabled={!!busy}>
          <Copy size={12} /> Copy
        </button>
        <button className="pg-act" onClick={() => onShot(famKey, tier)} disabled={!!busy}>
          <Camera size={12} /> Image
        </button>
      </div>
    </div>
  );
}

export default function PickGroupsView({ data, date }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [activeFam, setActiveFam] = useState(null);           // selected chip family
  const [expanded, setExpanded] = useState({});               // famKey -> bool (show tiers 2+)
  const shotRefs = useRef(new Map());
  const setShotRef = (id) => (el) => { el ? shotRefs.current.set(id, el) : shotRefs.current.delete(id); };

  const flash = (m, err = false) => (err ? toast.error(m) : toast.success(m));

  const groups = data?.groups || {};
  const overall = data?.results || null;

  /* families without TOP10 — the toggle chips */
  const otherFamilies = useMemo(
    () => Object.keys(groups).filter((f) => f !== 'TOP10_DAILY'),
    [groups]
  );

  /* default chip selection: first family with content */
  const selected = useMemo(() => {
    if (activeFam && groups[activeFam]) return activeFam;
    return otherFamilies.find((f) => (groups[f]?.tiers || groups[f]?.picks)) || null;
  }, [activeFam, groups, otherFamilies]);

  const doShare = async (key, tier) => {
    const res = tierResults(tier);
    const text = res?.settled > 0 ? tierShareResolved(tier) : tierShare(tier);
    if (!text) return flash('Sharing soon', true);
    setBusy(`${key}:${tier.tier}`);
    try {
      const r = await shareText('ZOKASCORE', text);
      flash(r === 'copied' ? 'Copied ✓' : 'Shared ✓');
    } finally { setBusy(null); }
  };
  const doCopy = async (key, tier) => {
    const res = tierResults(tier);
    const text = res?.settled > 0 ? tierShareResolved(tier) : tierShare(tier);
    if (!text) return flash('Nothing to copy yet', true);
    setBusy(`${key}:${tier.tier}`);
    try { await navigator.clipboard.writeText(text); flash('Copied ✓'); }
    finally { setBusy(null); }
  };
  const doShot = async (key, tier) => {
    setBusy(`${key}:${tier.tier}`);
    try {
      await screenshotNode(shotRefs.current.get(`${key}:${tier.tier}`), `zokascore-${key}-g${tier.tier}-${date}.png`);
      flash('Image saved ✓');
    } catch { flash('Screenshot failed', true); }
    finally { setBusy(null); }
  };

  const toggleExpand = (fam) => setExpanded((prev) => ({ ...prev, [fam]: !prev[fam] }));

  if (!data || (!groups.TOP10_DAILY && otherFamilies.length === 0)) return null;

  const hero = groups.TOP10_DAILY;
  const heroTiers = hero?.tiers || (tierPicks(hero).length ? [hero] : []);

  const selFam = selected ? groups[selected] : null;
  const selTiers = selFam
    ? (selFam.tiers || (tierPicks(selFam).length ? [selFam] : []))
    : [];
  const selVisible = selTiers.slice(0, 1);
  const selHidden = selTiers.slice(1);
  const isExpanded = selected ? !!expanded[selected] : false;

  /* chip count = total picks in family */
  const famCount = (f) => {
    const fam = groups[f];
    const tiers = fam?.tiers || (tierPicks(fam).length ? [fam] : []);
    return tiers.reduce((s, t) => s + tierPicks(t).length, 0);
  };

  return (
    <div className="pg2">
      {/* overall banner */}
      {overall && overall.settled > 0 && (
        <div className="pg2-overall">
          <Sparkles size={13} className="gold" />
          <span>Model today:</span>
          <b className="pg-won">{overall.won}W</b>
          <b className="pg-lost">{overall.lost}L</b>
          {overall.pending > 0 && <span className="pg-pend">⏳ {overall.pending}</span>}
          {overall.accuracy != null && <b className="pg-acc">{overall.accuracy}%</b>}
        </div>
      )}

      {/* ═══ HERO — TOP 10 DAILY ═══ */}
      {heroTiers.map((tier) => (
        <TierBlock
          key={`hero:${tier.tier}`}
          famKey="TOP10_DAILY"
          tier={tier}
          busy={busy}
          onShare={doShare}
          onCopy={doCopy}
          onShot={doShot}
          shotRef={setShotRef(`TOP10_DAILY:${tier.tier}`)}
          isHero
        />
      ))}

      {/* ═══ FAMILY CHIPS (toggle) ═══ */}
      {otherFamilies.length > 0 && (
        <>
          <div className="pg2-fambar">
            {otherFamilies.map((f) => {
              const meta = FAMILY_META[f] || { title: f, emoji: '•' };
              return (
                <button
                  key={f}
                  className={`pg2-fam${selected === f ? ' on' : ''}${meta.risky ? ' risky' : ''}`}
                  onClick={() => setActiveFam(f)}
                >
                  <span>{meta.emoji}</span> {meta.title}
                  <b>{famCount(f)}</b>
                </button>
              );
            })}
          </div>

          {/* selected family: tier 1 */}
          {selFam && (
            <div className="pg2-section">
              {selVisible.map((tier) => (
                <TierBlock
                  key={`${selected}:${tier.tier}`}
                  famKey={selected}
                  tier={tier}
                  busy={busy}
                  onShare={doShare}
                  onCopy={doCopy}
                  onShot={doShot}
                  shotRef={setShotRef(`${selected}:${tier.tier}`)}
                />
              ))}

              {/* deeper tiers behind Show more */}
              {selHidden.length > 0 && !isExpanded && (
                <button className="pg2-more" onClick={() => toggleExpand(selected)}>
                  <ChevronDown size={14} />
                  Show {selHidden.length} more group{selHidden.length > 1 ? 's' : ''}
                  <b>({selHidden.reduce((s, t) => s + tierPicks(t).length, 0)} picks)</b>
                </button>
              )}
              {isExpanded && selHidden.map((tier) => (
                <TierBlock
                  key={`${selected}:${tier.tier}`}
                  famKey={selected}
                  tier={tier}
                  busy={busy}
                  onShare={doShare}
                  onCopy={doCopy}
                  onShot={doShot}
                  shotRef={setShotRef(`${selected}:${tier.tier}`)}
                />
              ))}
              {isExpanded && selHidden.length > 0 && (
                <button className="pg2-more" onClick={() => toggleExpand(selected)}>
                  <ChevronUp size={14} /> Show fewer groups
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}