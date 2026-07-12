import { useState, useEffect, useMemo, useCallback } from 'react';
import { useFootballData } from '../context/FootballDataContext';

const injectStyles = () => {
  if (document.getElementById('mg-v2')) return;
  const s = document.createElement('style');
  s.id = 'mg-v2';
  s.textContent = `
    @keyframes mgUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes mgPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.2;transform:scale(1.8)}}
    @keyframes mgSlide{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:translateX(0)}}
    @keyframes mgShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes mgGlow{0%,100%{text-shadow:0 0 6px rgba(239,68,68,.15)}50%{text-shadow:0 0 14px rgba(239,68,68,.4)}}
    @keyframes mgOpen{from{opacity:0;max-height:0}to{opacity:1;max-height:600px}}
    .mg-page{min-height:100vh;background:var(--bg-deep,#060e18);padding:0 16px 80px}
    .mg-w{max-width:900px;margin:0 auto}
    .mg-hd{text-align:center;padding:22px 0 4px}
    .mg-hd h1{margin:0 0 3px;font-size:1.25rem;font-weight:900;color:var(--text-primary,#e2e8f0);letter-spacing:-.01em}
    .mg-hd .sub{font-size:.7rem;color:var(--text-muted,#4a5568);font-weight:500}
    .mg-stats{display:flex;justify-content:center;gap:20px;margin:12px 0 18px;flex-wrap:wrap}
    .mg-st{text-align:center}
    .mg-sv{font-size:1.15rem;font-weight:900;color:var(--text-primary,#e2e8f0);line-height:1.2}
    .mg-sv.red{color:#ef4444}.mg-sv.grn{color:var(--accent,#00e676)}
    .mg-sl{font-size:.56rem;font-weight:600;color:var(--text-muted,#4a5568);text-transform:uppercase;letter-spacing:.07em;margin-top:2px}
    .mg-dates{display:flex;gap:3px;overflow-x:auto;padding:4px 0 14px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
    .mg-dates::-webkit-scrollbar{display:none}
    .mg-dt{flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:1px;padding:8px 10px;border-radius:10px;border:1px solid var(--border,#1a2233);background:var(--bg-card,#0c1420);color:var(--text-muted,#4a5568);font-size:.68rem;font-weight:600;cursor:pointer;transition:all .18s ease;min-width:50px;font-family:inherit}
    .mg-dt:hover{color:var(--text-primary,#e2e8f0);background:rgba(255,255,255,.03)}
    .mg-dt.on{background:var(--accent,#00e676);color:var(--bg-deep,#060e18);font-weight:800;border-color:var(--accent,#00e676);box-shadow:0 2px 12px rgba(0,230,118,.25)}
    .mg-dt .dn{font-size:.5rem;opacity:.55;font-weight:500}
    .mg-tabs{display:flex;gap:4px;background:var(--bg-card,#0c1420);border:1px solid var(--border,#1a2233);border-radius:12px;padding:4px;margin-bottom:14px}
    .mg-tb{flex:1;padding:9px 6px;border:none;border-radius:9px;background:transparent;color:var(--text-muted,#4a5568);font-size:.73rem;font-weight:600;cursor:pointer;transition:all .18s ease;text-align:center;font-family:inherit}
    .mg-tb:hover{color:var(--text-primary,#e2e8f0);background:rgba(255,255,255,.03)}
    .mg-tb.on{background:var(--accent,#00e676);color:var(--bg-deep,#060e18);font-weight:800;box-shadow:0 2px 12px rgba(0,230,118,.25)}
    .mg-cbar{display:flex;gap:5px;overflow-x:auto;padding:3px 0 14px;scrollbar-width:none}
    .mg-cbar::-webkit-scrollbar{display:none}
    .mg-cp{flex-shrink:0;display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:9px;border:1px solid var(--border,#1a2233);background:var(--bg-card,#0c1420);color:var(--text-muted,#4a5568);font-size:.7rem;font-weight:600;cursor:pointer;transition:all .18s ease;white-space:nowrap;font-family:inherit}
    .mg-cp:hover{background:rgba(255,255,255,.04);color:var(--text-primary,#e2e8f0)}
    .mg-cp.on{background:rgba(0,230,118,.08);color:var(--accent,#00e676);border-color:rgba(0,230,118,.2)}
    .mg-cp img{width:14px;height:14px;object-fit:contain;border-radius:2px}
    .mg-sec{margin-bottom:22px;animation:mgUp .35s cubic-bezier(.22,1,.36,1) both}
    .mg-lh{display:flex;align-items:center;gap:7px;margin-bottom:8px;padding:0 2px}
    .mg-lh img{width:16px;height:16px;object-fit:contain;border-radius:3px;flex-shrink:0}
    .mg-lh span{font-size:.75rem;font-weight:700;color:var(--text-muted,#4a5568)}
    .mg-lh .cnt{margin-left:auto;font-size:.56rem;font-weight:600;color:var(--text-muted,#4a5568);opacity:.45}
    .mg-llh{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:0 2px}
    .mg-ld{width:7px;height:7px;border-radius:50%;background:#ef4444;animation:mgPulse 1.2s ease-in-out infinite;box-shadow:0 0 8px rgba(239,68,68,.5)}
    .mg-lt{font-size:.82rem;font-weight:800;color:#ef4444;text-transform:uppercase;letter-spacing:.04em}
    .mg-lc{font-size:.6rem;font-weight:700;color:#ef4444;opacity:.55}
    .mg-dh{display:flex;align-items:center;gap:8px;margin:16px 0 8px;padding:0 2px}
    .mg-dl{font-size:.78rem;font-weight:800;color:var(--text-primary,#e2e8f0);text-transform:uppercase;letter-spacing:.02em}
    .mg-dl.tod{color:var(--accent,#00e676)}
    .mg-dc{font-size:.58rem;font-weight:600;color:var(--text-muted,#4a5568);opacity:.45}
    .mg-dlne{flex:1;height:1px;background:var(--border,#1a2233)}
    .mg-card{position:relative;overflow:hidden;padding:12px 15px 14px;background:var(--bg-card,#0c1420);border:1px solid var(--border,#1a2233);border-radius:11px;margin-bottom:5px;transition:all .18s cubic-bezier(.22,1,.36,1);animation:mgSlide .25s cubic-bezier(.22,1,.36,1) both;cursor:pointer}
    .mg-card:hover{background:rgba(255,255,255,.02);transform:translateY(-1px)}
    .mg-card.live{border-color:rgba(239,68,68,.18);background:linear-gradient(135deg,rgba(239,68,68,.035) 0%,var(--bg-card,#0c1420) 45%)}
    .mg-card.ft{opacity:.5}
    .mg-card.up{border-left:3px solid rgba(59,130,246,.35)}
    .mg-card.exp{border-radius:11px 11px 0 0;margin-bottom:0;border-color:rgba(0,230,118,.18)}
    .mg-lb{position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:0 2px 2px 0}
    .mg-sr{display:flex;align-items:center;justify-content:center;gap:5px;margin-bottom:9px}
    .mg-b{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:4px;font-size:.58rem;font-weight:800;letter-spacing:.02em;text-transform:uppercase}
    .mg-bl{color:#ef4444;background:rgba(239,68,68,.1)}
    .mg-bf{color:var(--accent,#00e676);background:rgba(0,230,118,.08)}
    .mg-bt{color:var(--text-muted,#4a5568);background:rgba(255,255,255,.04);font-size:.66rem;font-weight:600}
    .mg-lds{width:5px;height:5px;border-radius:50%;background:#ef4444;animation:mgPulse 1.2s ease-in-out infinite;flex-shrink:0}
    .mg-ts{display:flex;align-items:center;gap:6px}
    .mg-tc{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
    .mg-tc.h{align-items:flex-end}.mg-tc.a{align-items:flex-start}
    .mg-ti{display:flex;align-items:center;gap:6px;min-width:0}
    .mg-tc.h .mg-ti{flex-direction:row-reverse}
    .mg-tl{width:20px;height:20px;object-fit:contain;flex-shrink:0;border-radius:3px}
    .mg-tn{font-size:.8rem;font-weight:600;color:var(--text-primary,#e2e8f0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2}
    .mg-tc.h .mg-tn{text-align:right}
    .mg-sc{width:68px;flex-shrink:0;text-align:center;display:flex;align-items:center;justify-content:center}
    .mg-sp{display:flex;align-items:center;gap:4px}
    .mg-sn{font-family:var(--font-display,ui-monospace,monospace);font-variant-numeric:tabular-nums;font-size:1.05rem;font-weight:900;min-width:22px;text-align:center;line-height:1}
    .mg-sn.l{color:#ef4444;animation:mgGlow 2s ease-in-out infinite}
    .mg-sn.f{color:var(--accent,#00e676)}
    .mg-ss{color:var(--text-muted,#4a5568);font-size:.7rem;font-weight:700;opacity:.4}
    .mg-vs{font-size:.68rem;font-weight:900;color:var(--text-muted,#4a5568);opacity:.3;letter-spacing:.1em}
    .mg-cr{display:flex;align-items:center;gap:5px;margin-top:9px;padding-top:7px;border-top:1px solid rgba(255,255,255,.03)}
    .mg-cr img{width:13px;height:13px;object-fit:contain;flex-shrink:0}
    .mg-cr span{font-size:.6rem;color:var(--text-muted,#4a5568);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .mg-exp{background:var(--bg-surface,#0a1019);border:1px solid var(--border,#1a2233);border-top:none;border-radius:0 0 11px 11px;overflow:hidden;animation:mgOpen .3s ease-out both}
    .mg-exp-sec{padding:10px 14px 4px;font-size:.58rem;font-weight:700;color:var(--text-muted,#4a5568);text-transform:uppercase;letter-spacing:.06em}
    .mg-exp-row{display:flex;justify-content:space-between;align-items:center;padding:6px 14px;border-bottom:1px solid rgba(255,255,255,.03);font-size:.7rem}
    .mg-exp-row:last-child{border-bottom:none}
    .mg-exp-row .lbl{color:var(--text-muted,#4a5568);font-weight:600}
    .mg-exp-row .val{color:var(--text-primary,#e2e8f0);font-weight:700;font-family:var(--font-display,ui-monospace,monospace);font-variant-numeric:tabular-nums}
    .mg-goal-row{display:flex;align-items:center;gap:8px;padding:6px 14px;border-bottom:1px solid rgba(255,255,255,.025);font-size:.72rem}
    .mg-goal-row:last-child{border-bottom:none}
    .mg-goal-min{font-weight:800;color:var(--text-muted,#4a5568);font-variant-numeric:tabular-nums;min-width:28px;font-family:var(--font-display,ui-monospace,monospace)}
    .mg-goal-icon{color:var(--accent,#00e676);font-size:.65rem}
    .mg-goal-scorer{font-weight:600;color:var(--text-primary,#e2e8f0);flex:1}
    .mg-goal-assist{font-size:.62rem;color:var(--text-muted,#4a5568)}
    .mg-goal-team{font-size:.6rem;color:var(--text-muted,#4a5568);opacity:.6}
    .mg-card-row{display:flex;align-items:center;gap:6px;padding:5px 14px;border-bottom:1px solid rgba(255,255,255,.025);font-size:.7rem}
    .mg-card-row:last-child{border-bottom:none}
    .mg-card-icon{font-size:.7rem}
    .mg-card-player{flex:1;font-weight:600;color:var(--text-primary,#e2e8f0)}
    .mg-card-min{font-weight:700;color:var(--text-muted,#4a5568);font-variant-numeric:tabular-nums;font-family:var(--font-display,ui-monospace,monospace);min-width:28px;text-align:right}
    .mg-card-team{font-size:.58rem;color:var(--text-muted,#4a5568);opacity:.5}
    .mg-corner-row{display:flex;align-items:center;justify-content:space-around;padding:10px 14px;font-size:.75rem;font-weight:700}
    .mg-corner-team{display:flex;align-items:center;gap:6px}
    .mg-corner-team img{width:18px;height:18px;object-fit:contain;border-radius:3px}
    .mg-corner-num{font-family:var(--font-display,ui-monospace,monospace);font-variant-numeric:tabular-nums;font-size:1.1rem;font-weight:900}
    .mg-ref-row{display:flex;align-items:center;gap:8px;padding:5px 14px;font-size:.7rem}
    .mg-ref-row:last-child{border-bottom:none}
    .mg-ref-role{font-size:.58rem;font-weight:700;color:var(--text-muted,#4a5568);text-transform:uppercase;min-width:56px;letter-spacing:.04em}
    .mg-ref-name{font-weight:600;color:var(--text-primary,#e2e8f0)}
    .mg-ref-nat{font-size:.6rem;color:var(--text-muted,#4a5568);margin-left:auto}
    .mg-no-data{padding:16px 14px;text-align:center;color:var(--text-muted,#4a5568);font-size:.74rem;font-style:italic;opacity:.6}
    .mg-tbl-w{background:var(--bg-card,#0c1420);border:1px solid var(--border,#1a2233);border-radius:13px;overflow:hidden}
    .mg-tbl{width:100%;border-collapse:collapse;font-size:.72rem}
    .mg-tbl thead{background:rgba(255,255,255,.03)}
    .mg-tbl th{padding:9px 8px;font-size:.56rem;font-weight:700;color:var(--text-muted,#4a5568);text-transform:uppercase;letter-spacing:.05em;text-align:left;border-bottom:1px solid var(--border,#1a2233)}
    .mg-tbl th.n{text-align:center;width:28px}.mg-tbl th.p{text-align:center;width:38px}
    .mg-tbl td{padding:8px;border-bottom:1px solid rgba(255,255,255,.025);vertical-align:middle}
    .mg-tbl tr:last-child td{border-bottom:none}
    .mg-tbl tr:hover{background:rgba(255,255,255,.02)}
    .mg-tbl .pos{font-weight:800;color:var(--text-muted,#4a5568);text-align:center;font-variant-numeric:tabular-nums}
    .mg-tbl .tc{display:flex;align-items:center;gap:7px;min-width:0}
    .mg-tbl .tc img{width:18px;height:18px;object-fit:contain;flex-shrink:0;border-radius:3px}
    .mg-tbl .tc span{font-weight:600;color:var(--text-primary,#e2e8f0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.73rem}
    .mg-tbl .sc{text-align:center;font-variant-numeric:tabular-nums;font-weight:600;color:var(--text-muted,#4a5568);font-size:.7rem}
    .mg-tbl .pc{text-align:center;font-weight:900;color:var(--text-primary,#e2e8f0);font-size:.78rem}
    .mg-tbl .gdp{color:var(--accent,#00e676)}.mg-tbl .gdn{color:#ef4444}
    .mg-tbl .zu{border-left:3px solid #3b82f6}.mg-tbl .ze{border-left:3px solid #f97316}.mg-tbl .zc{border-left:3px solid #22c55e}.mg-tbl .zr{border-left:3px solid #ef4444}
    .mg-zb{display:flex;gap:0;margin-bottom:8px;padding:0 4px}
    .mg-zi{flex:1;padding:3px 6px;border-radius:3px 3px 0 0;font-size:.5rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;text-align:center}
    .mg-slbl{padding:10px 12px 4px;font-size:.64rem;font-weight:700;color:var(--text-muted,#4a5568);text-transform:uppercase;letter-spacing:.05em}
    .mg-tg{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:7px}
    .mg-tcard{background:var(--bg-card,#0c1420);border:1px solid var(--border,#1a2233);border-radius:11px;padding:14px 10px;text-align:center;transition:all .18s ease}
    .mg-tcard:hover{background:rgba(255,255,255,.03);transform:translateY(-1px)}
    .mg-tcard img{width:36px;height:36px;object-fit:contain;margin:0 auto 6px;display:block;filter:drop-shadow(0 2px 5px rgba(0,0,0,.3))}
    .mg-tcard .nm{font-size:.72rem;font-weight:700;color:var(--text-primary,#e2e8f0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .mg-tcard .tl{font-size:.56rem;font-weight:600;color:var(--text-muted,#4a5568);margin-top:2px}
    .mg-tcard .vn{font-size:.54rem;color:var(--text-muted,#4a5568);opacity:.55;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .mg-cg{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:9px}
    .mg-cc{background:var(--bg-card,#0c1420);border:1px solid var(--border,#1a2233);border-radius:13px;padding:16px;display:flex;align-items:center;gap:12px;transition:all .18s ease;cursor:pointer}
    .mg-cc:hover{background:rgba(255,255,255,.03);transform:translateY(-1px)}
    .mg-cc img{width:32px;height:32px;object-fit:contain;flex-shrink:0;filter:drop-shadow(0 2px 6px rgba(0,0,0,.3))}
    .mg-cc .info{flex:1;min-width:0}
    .mg-cc .cn{font-size:.82rem;font-weight:700;color:var(--text-primary,#e2e8f0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .mg-cc .badge{font-size:.55rem;font-weight:800;color:var(--accent,#00e676);background:rgba(0,230,118,.08);padding:2px 7px;border-radius:4px;display:inline-block;margin-top:3px;letter-spacing:.04em}
    .mg-cc .area{font-size:.58rem;color:var(--text-muted,#4a5568);margin-top:2px}
    .mg-rg{display:flex;flex-direction:column;gap:14px}
    .mg-rg-title{font-size:.68rem;font-weight:700;color:var(--text-muted,#4a5568);text-transform:uppercase;letter-spacing:.06em;padding:4px 2px 6px;border-bottom:1px solid var(--border,#1a2233)}
    .mg-empty{width:100%;display:flex;flex-direction:column;align-items:center;gap:8px;padding:40px 20px;background:var(--bg-card,#0c1420);border:1px solid var(--border,#1a2233);border-radius:14px;text-align:center}
    .mg-ei{width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.03);font-size:1.4rem;margin-bottom:2px}
    .mg-empty p{color:var(--text-muted,#4a5568);font-size:.8rem;margin:0}
    .mg-empty .hint{font-size:.66rem;color:var(--text-muted,#4a5568);opacity:.45;margin-top:3px}
    .mg-ldg{display:flex;align-items:center;justify-content:center;padding:80px 0;color:var(--text-muted,#4a5568);font-size:.85rem}
    .mg-sk{height:13px;border-radius:6px;background:linear-gradient(90deg,var(--bg-surface,#111827) 25%,var(--bg-card,#0c1420) 50%,var(--bg-surface,#111827) 75%);background-size:200% 100%;animation:mgShimmer 1.5s ease-in-out infinite}
    @media(min-width:500px){.mg-tn{font-size:.84rem}.mg-sn{font-size:1.15rem}.mg-sc{width:76px}.mg-tg{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}}
    @media(max-width:400px){.mg-tn{font-size:.72rem}.mg-sn{font-size:.95rem}.mg-sc{width:60px}.mg-tl{width:16px;height:16px}.mg-card{padding:10px 10px 12px}.mg-tg{grid-template-columns:repeat(auto-fill,minmax(110px,1fr))}.mg-cg{grid-template-columns:1fr}}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
};

function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

function dateLabel(d) {
  const t = new Date().toISOString().split('T')[0];
  const y = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const tm = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  if (d === t) return 'TODAY';
  if (d === y) return 'YESTERDAY';
  if (d === tm) return 'TOMORROW';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function getDateStr(off) { const d = new Date(); d.setDate(d.getDate() + off); return d.toISOString().split('T')[0]; }

function zoneCls(pos, total) {
  if (total <= 0) return '';
  const r = pos / total;
  if (r <= 0.25) return 'zu';
  if (r <= 0.40) return 'ze';
  if (r <= 0.50) return 'zc';
  if (r >= 0.85) return 'zr';
  return '';
}

/* ── Match Card ── */
function MatchCard({ m, idx, expanded, onToggle }) {
  const isLive = m.status === 'IN_PLAY' || m.status === 'PAUSED';
  const isFt = m.status === 'FINISHED';
  const isUp = m.status === 'SCHEDULED' || m.status === 'TIMED';
  const sh = m.score?.fullTime;
  const time = m.utcDate ? new Date(m.utcDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const lc = isLive ? 'linear-gradient(180deg,#ef4444,#f97316)' : isFt ? 'var(--accent,#00e676)' : 'transparent';
  const isExp = expanded === m.id;
  const goals = m.score?.goals || [];
  const cards = m.score?.cards || [];
  const corners = m.score?.corners;
  const refs = m.referees || [];

  let cls = 'mg-card';
  if (isLive) cls += ' live';
  else if (isFt) cls += ' ft';
  else if (isUp) cls += ' up';
  if (isExp) cls += ' exp';

  const hasDetails = goals.length > 0 || cards.length > 0 || corners || (refs.length > 0) ||
    (sh && (sh.home !== null || sh.away !== null)) || m.score?.halfTime || m.score?.extraTime || m.score?.penalties;

  return (
    <div>
      <div className={cls} style={{ animationDelay: idx * 12 + 'ms', paddingLeft: (isLive || isFt) ? 16 : 15 }} onClick={() => onToggle(isExp ? null : m.id)}>
        {(isLive || isFt) && <div className="mg-lb" style={{ background: lc }} />}
        <div className="mg-sr">
          {isLive && <span className="mg-b mg-bl"><span className="mg-lds" /> LIVE</span>}
          {isFt && <span className="mg-b mg-bf">FT</span>}
          {!isLive && !isFt && <span className="mg-b mg-bt">{time}</span>}
        </div>
        <div className="mg-ts">
          <div className="mg-tc h">
            <div className="mg-ti">
              {m.homeTeam?.crest && <img className="mg-tl" src={m.homeTeam.crest} alt="" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}
              <span className="mg-tn">{m.homeTeam?.shortName || m.homeTeam?.name || 'TBD'}</span>
            </div>
          </div>
          <div className="mg-sc">
            {(isLive || isFt) ? (
              <div className="mg-sp">
                <span className={`mg-sn ${isLive ? 'l' : ''} ${isFt ? 'f' : ''}`}>{sh?.home ?? 0}</span>
                <span className="mg-ss">-</span>
                <span className={`mg-sn ${isLive ? 'l' : ''} ${isFt ? 'f' : ''}`}>{sh?.away ?? 0}</span>
              </div>
            ) : <span className="mg-vs">VS</span>}
          </div>
          <div className="mg-tc a">
            <div className="mg-ti">
              {m.awayTeam?.crest && <img className="mg-tl" src={m.awayTeam.crest} alt="" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}
              <span className="mg-tn">{m.awayTeam?.shortName || m.awayTeam?.name || 'TBD'}</span>
            </div>
          </div>
        </div>
        <div className="mg-cr">
          {m.competition?.emblem && <img src={m.competition.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{m.competition?.name || ''}</span>
        </div>
      </div>

      {isExp && (
        <div className="mg-exp">
          {/* Score breakdown */}
          <div className="mg-exp-sec">Score Breakdown</div>
          {[
            { l: 'Half Time', h: m.score?.halfTime?.home, a: m.score?.halfTime?.away },
            { l: 'Full Time', h: sh?.home, a: sh?.away },
            { l: 'Extra Time', h: m.score?.extraTime?.home, a: m.score?.extraTime?.away },
            { l: 'Penalties', h: m.score?.penalties?.home, a: m.score?.penalties?.away },
          ].filter(r => r.h != null || r.a != null).map(r => (
            <div key={r.l} className="mg-exp-row"><span className="lbl">{r.l}</span><span className="val">{r.h ?? '-'} - {r.a ?? '-'}</span></div>
          ))}

          {/* Goals */}
          {goals.length > 0 && (
            <>
              <div className="mg-exp-sec">Goals ({goals.length})</div>
              {goals.map((g, i) => (
                <div key={i} className="mg-goal-row">
                  <span className="mg-goal-min">{g.minute !== null ? g.minute + "'" : ''}</span>
                  <span className="mg-goal-icon">⚽</span>
                  <span className="mg-goal-scorer">{g.scorer?.name || 'Unknown'}</span>
                  {g.assist?.name && <span className="mg-goal-assist">(assist: {g.assist.name})</span>}
                  <span className="mg-goal-team">{g.team?.name || ''}</span>
                </div>
              ))}
            </>
          )}

          {/* Cards */}
          {cards.length > 0 && (
            <>
              <div className="mg-exp-sec">Cards ({cards.length})</div>
              {cards.map((c, i) => (
                <div key={i} className="mg-card-row">
                  <span className="mg-card-icon">{c.type === 'YELLOW_CARD' ? '🟨' : c.type === 'RED_CARD' ? '🟥' : '⚪'}</span>
                  <span className="mg-card-player">{c.player?.name || 'Unknown'}</span>
                  <span className="mg-card-min">{c.minute !== null ? c.minute + "'" : ''}</span>
                  <span className="mg-card-team">{c.team?.name || ''}</span>
                </div>
              ))}
            </>
          )}

          {/* Corners */}
          {corners && (corners.home != null || corners.away != null) && (
            <>
              <div className="mg-exp-sec">Corners</div>
              <div className="mg-corner-row">
                <div className="mg-corner-team">
                  {m.homeTeam?.crest && <img src={m.homeTeam.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                  <span className="mg-corner-num">{corners.home ?? 0}</span>
                </div>
                <span style={{ fontSize: '.65rem', color: 'var(--text-muted,#4a5568)', fontWeight: 700 }}>vs</span>
                <div className="mg-corner-team">
                  <span className="mg-corner-num">{corners.away ?? 0}</span>
                  {m.awayTeam?.crest && <img src={m.awayTeam.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                </div>
              </div>
            </>
          )}

          {/* Referees */}
          {refs.length > 0 && (
            <>
              <div className="mg-exp-sec">Officials</div>
              {refs.map((r, i) => (
                <div key={i} className="mg-ref-row">
                  <span className="mg-ref-role">{r.role || 'Referee'}</span>
                  <span className="mg-ref-name">{r.name || '—'}</span>
                  {r.nationality && <span className="mg-ref-nat">{r.nationality}</span>}
                </div>
              ))}
            </>
          )}

          {!hasDetails && <div className="mg-no-data">Detailed stats not available for this match on the free tier</div>}
        </div>
      )}
    </div>
  );
}

/* ── Standings ── */
function StandingsTable({ standings }) {
  if (!standings || standings.length === 0) return null;
  return (
    <div className="mg-sec">
      {standings.map((g, gi) => {
        const t = g.table || [];
        if (t.length === 0) return null;
        const total = t.length;
        const hasZ = total >= 10;
        return (
          <div key={gi} style={{ marginBottom: 18 }}>
            {g.group && <div className="mg-slbl">{g.group}</div>}
            {hasZ && (
              <div className="mg-zb">
                <div className="mg-zi" style={{ background: 'rgba(59,130,246,.12)', color: '#3b82f6' }}>UCL</div>
                <div className="mg-zi" style={{ background: 'rgba(249,115,22,.1)', color: '#f97316' }}>UEL</div>
                <div className="mg-zi" style={{ background: 'rgba(34,197,94,.08)', color: '#22c55e' }}>UECL</div>
                <div className="mg-zi" style={{ background: 'rgba(239,68,68,.08)', color: '#ef4444' }}>REL</div>
              </div>
            )}
            <div className="mg-tbl-w">
              <table className="mg-tbl">
                <thead><tr><th className="n">#</th><th>Team</th><th className="n">P</th><th className="n">W</th><th className="n">D</th><th className="n">L</th><th className="n">GD</th><th className="p">Pts</th></tr></thead>
                <tbody>
                  {t.map(r => {
                    const gd = (r.goalsFor || 0) - (r.goalsAgainst || 0);
                    return (
                      <tr key={r.position} className={hasZ ? zoneCls(r.position, total) : ''}>
                        <td className="pos">{r.position}</td>
                        <td><div className="tc">{r.team?.crest && <img src={r.team.crest} alt="" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}<span>{r.team?.shortName || r.team?.name || '—'}</span></div></td>
                        <td className="sc">{r.playedGames}</td><td className="sc">{r.won}</td><td className="sc">{r.draw}</td><td className="sc">{r.lost}</td>
                        <td className={`sc ${gd > 0 ? 'gdp' : gd < 0 ? 'gdn' : ''}`}>{gd > 0 ? '+' : ''}{gd}</td>
                        <td className="pc">{r.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Teams Grid ── */
function TeamsGrid({ teams }) {
  if (!teams || teams.length === 0) return null;
  return (
    <div className="mg-sec">
      <div className="mg-tg">
        {teams.map(t => (
          <div key={t.id} className="mg-tcard">
            {t.crest && <img src={t.crest} alt="" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}
            <div className="nm">{t.shortName || t.name}</div>
            {t.tla && <div className="tl">{t.tla}</div>}
            {t.founded && <div className="vn">Founded {t.founded}</div>}
            {t.venue && <div className="vn">{t.venue}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Competitions Grid ── */
function CompsGrid({ competitions, onSelect }) {
  if (!competitions || competitions.length === 0) return null;
  const regions = {};
  (competitions || []).forEach(c => {
    const r = c.area?.name || 'Other';
    if (!regions[r]) regions[r] = [];
    regions[r].push(c);
  });
  return (
    <div className="mg-rg">
      {Object.entries(regions).sort((a, b) => {
        if (a[0] === 'Europe') return -1;
        if (b[0] === 'Europe') return 1;
        return a[0].localeCompare(b[0]);
      }).map(([region, comps]) => (
        <div key={region}>
          <div className="mg-rg-title">{region} ({comps.length})</div>
          <div className="mg-cg">
            {comps.map(c => (
              <div key={c.code || c.id} className="mg-cc" onClick={() => onSelect?.(c.code)}>
                {c.emblem && <img src={c.emblem} alt="" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}
                <div className="info">
                  <div className="cn">{c.name}</div>
                  {c.code && <span className="badge">{c.code}</span>}
                  <div className="area">{c.type || ''} {c.currentSeason ? '• ' + (c.currentSeason.startDate || '').split('-')[0] : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════ */
export default function MasterGames() {
  injectStyles();

  const { fixtures, liveMatches, competitions, loading, lastUpdated, dbReady, getStandings, getTeams, fixturesByDate } = useFootballData();

  const [tab, setTab] = useState('fixtures');
  const [compFilter, setCompFilter] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState(getDateStr(0));
  const [expanded, setExpanded] = useState(null);
  const [standingsData, setStandingsData] = useState(null);
  const [teamsData, setTeamsData] = useState(null);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(false);

  /* ── Date strip ── */
  const dates = useMemo(() => {
    const arr = [];
    for (let i = -7; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      arr.push({
        str: d.toISOString().split('T')[0],
        day: d.toLocaleDateString('en', { weekday: 'short' }),
        num: d.getDate(),
        isToday: i === 0,
      });
    }
    return arr;
  }, []);

  /* ── Load standings ── */
  useEffect(() => {
    if (tab !== 'standings' || compFilter === 'ALL') { setStandingsData(null); return; }
    let c = false;
    setStandingsLoading(true);
    getStandings(compFilter).then(d => { if (!c) { setStandingsData(d); setStandingsLoading(false); } }).catch(() => { if (!c) { setStandingsData(null); setStandingsLoading(false); } });
    return () => { c = true; };
  }, [tab, compFilter, getStandings]);

  /* ── Load teams ── */
  useEffect(() => {
    if (tab !== 'teams' || compFilter === 'ALL') { setTeamsData(null); return; }
    let c = false;
    setTeamsLoading(true);
    getTeams(compFilter).then(d => { if (!c) { setTeamsData(d); setTeamsLoading(false); } }).catch(() => { if (!c) { setTeamsData(null); setTeamsLoading(false); } });
    return () => { c = true; };
  }, [tab, compFilter, getTeams]);

  /* ── Filtered fixtures for selected date ── */
  const dayMatches = useMemo(() => {
    return fixtures.filter(m => m.date === selectedDate);
  }, [fixtures, selectedDate]);

  const filteredDay = useMemo(() => {
    if (compFilter === 'ALL') return dayMatches;
    return dayMatches.filter(m => m.competition?.code === compFilter);
  }, [dayMatches, compFilter]);

  const filteredLive = useMemo(() => {
    if (compFilter === 'ALL') return liveMatches;
    return liveMatches.filter(m => m.competition?.code === compFilter);
  }, [liveMatches, compFilter]);

  const compOptions = useMemo(() => competitions.filter(c => c.code), [competitions]);

  const handleCompSelect = useCallback(code => setCompFilter(p => p === code ? 'ALL' : code), []);
  const handleToggle = useCallback(id => setExpanded(p => p === id ? null : id), []);

  /* ── "No games today" → find next date with matches ── */
  const todayStr = getDateStr(0);
  const noGamesToday = selectedDate === todayStr && dayMatches.length === 0;

  const nextDateWithMatches = useMemo(() => {
    if (!noGamesToday) return null;
    for (const d of dates) {
      if (d.str <= todayStr) continue;
      if (fixtures.some(f => f.date === d.str)) return d.str;
    }
    return null;
  }, [noGamesToday, dates, fixtures, todayStr]);

  const upcomingMatches = useMemo(() => {
    if (!nextDateWithMatches) return [];
    return fixtures.filter(f => f.date === nextDateWithMatches);
  }, [nextDateWithMatches, fixtures]);

  /* ── Loading ── */
  if (loading) return <div className="mg-page"><div className="mg-w"><div className="mg-ldg">Loading football data...</div></div></div>;

  if (!dbReady) return (
    <div className="mg-page"><div className="mg-w">
      <div className="mg-hd"><h1>⚽ Master Games</h1></div>
      <div className="mg-empty"><div className="mg-ei">🔗</div><p>Firebase not connected</p><p className="hint">Check VITE_FOOTBALL_FB_* in your .env file</p></div>
    </div></div>
  );

  const selectedComp = compOptions.find(c => c.code === compFilter);

  return (
    <div className="mg-page">
      <div className="mg-w">

        {/* Header */}
        <div className="mg-hd">
          <h1>⚽ Master Games</h1>
          <div className="sub">{lastUpdated ? `Updated ${timeAgo(lastUpdated)}` : 'Football-Data.org • Free Tier'}</div>
        </div>

        {/* Stats */}
        <div className="mg-stats">
          <div className="mg-st"><div className={`mg-sv ${liveMatches.length > 0 ? 'red' : ''}`}>{liveMatches.length}</div><div className="mg-sl">Live</div></div>
          <div className="mg-st"><div className="mg-sv">{fixtures.length}</div><div className="mg-sl">Fixtures</div></div>
          <div className="mg-st"><div className="mg-sv grn">{compOptions.length}</div><div className="mg-sl">Leagues</div></div>
          <div className="mg-st"><div className="mg-sv">{fixtures.filter(f => f.status === 'FINISHED').length}</div><div className="mg-sl">Finished</div></div>
        </div>

        {/* Tabs */}
        <div className="mg-tabs">
          {[
            { id: 'fixtures', label: 'Fixtures' },
            { id: 'standings', label: 'Standings' },
            { id: 'teams', label: 'Teams' },
            { id: 'competitions', label: 'Competitions', count: compOptions.length },
          ].map(t => (
            <button key={t.id} className={`mg-tb ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}{t.count ? <span style={{ marginLeft: 4, fontSize: '.55rem', background: 'rgba(0,0,0,.15)', padding: '1px 5px', borderRadius: 5, fontWeight: 800 }}>{t.count}</span> : ''}
            </button>
          ))}
        </div>

        {/* Competition filter (not on competitions tab) */}
        {tab !== 'competitions' && (
          <div className="mg-cbar">
            <button className={`mg-cp ${compFilter === 'ALL' ? 'on' : ''}`} onClick={() => handleCompSelect('ALL')}>All</button>
            {compOptions.map(c => (
              <button key={c.code} className={`mg-cp ${compFilter === c.code ? 'on' : ''}`} onClick={() => handleCompSelect(c.code)}>
                {c.emblem && <img src={c.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* ══════ FIXTURES TAB ══════ */}
        {tab === 'fixtures' && (
          <>
            {/* Date strip */}
            <div className="mg-dates">
              {dates.map(d => (
                <button key={d.str} className={`mg-dt ${selectedDate === d.str ? 'on' : ''}`} onClick={() => { setSelectedDate(d.str); setExpanded(null); }}>
                  <span className="dn">{d.day}</span>
                  <span style={{ fontWeight: d.isToday ? 800 : 600, fontSize: d.isToday ? '.82rem' : '.75rem' }}>{d.num}</span>
                </button>
              ))}
            </div>

            {/* Live section (always visible when matches are live, regardless of date) */}
            {filteredLive.length > 0 && (
              <div className="mg-sec" style={{ animationDelay: '0ms' }}>
                <div className="mg-llh"><span className="mg-ld" /><span className="mg-lt">LIVE NOW</span><span className="mg-lc">({filteredLive.length})</span></div>
                {filteredLive.map((m, i) => <MatchCard key={m.id} m={m} idx={i} expanded={expanded} onToggle={handleToggle} />)}
              </div>
            )}

            {/* "No games today" message */}
            {noGamesToday && (
              <div className="mg-empty" style={{ marginBottom: 20 }}>
                <div className="mg-ei">😴</div>
                <p>No games today</p>
                {nextDateWithMatches && <p className="hint">Next available: {dateLabel(nextDateWithMatches)} ({upcomingMatches.length} matches)</p>}
              </div>
            )}

            {/* Matches for selected date */}
            {!noGamesToday && filteredDay.length === 0 && (
              <div className="mg-empty">
                <div className="mg-ei">⚽</div>
                <p>No matches found{compFilter !== 'ALL' ? ` in ${selectedComp?.name || compFilter}` : ` on ${dateLabel(selectedDate)}`}</p>
                <p className="hint">Try a different date or competition</p>
              </div>
            )}

            {/* Grouped by league */}
            {(() => {
              const grouped = new Map();
              filteredDay.forEach(m => {
                const lid = m.competition?.id ? String(m.competition.id) : '_';
                if (!grouped.has(lid)) grouped.set(lid, { id: lid, name: m.competition?.name || 'Other', emblem: m.competition?.emblem || null, matches: [] });
                grouped.get(lid).matches.push(m);
              });
              return [...grouped.values()].sort((a, b) => {
                const af = a.matches[0], bf = b.matches[0];
                if (af?.status === 'IN_PLAY' && bf?.status !== 'IN_PLAY') return -1;
                if (bf?.status === 'IN_PLAY' && af?.status !== 'IN_PLAY') return 1;
                if (af?.status === 'FINISHED' && bf?.status !== 'FINISHED') return 1;
                if (bf?.status === 'FINISHED' && af?.status !== 'FINISHED') return -1;
                return 0;
              });
            })().map(league => (
              <div key={league.id} className="mg-sec">
                <div className="mg-lh">
                  {league.emblem && <img src={league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                  <span>{league.name}</span>
                  <span className="cnt">{league.matches.length}</span>
                </div>
                {league.matches.map((m, i) => <MatchCard key={m.id} m={m} idx={i} expanded={expanded} onToggle={handleToggle} />)}
              </div>
            ))}

            {/* Upcoming matches (shown when no games today) */}
            {noGamesToday && nextDateWithMatches && upcomingMatches.length > 0 && (
              <>
                <div className="mg-dh">
                  <span className="mg-dl">{dateLabel(nextDateWithMatches)}</span>
                  <span className="mg-dc">{upcomingMatches.length} match{upcomingMatches.length !== 1 ? 'es' : ''}</span>
                  <div className="mg-dlne" />
                </div>
                {(() => {
                  const grouped = new Map();
                  upcomingMatches.forEach(m => {
                    const lid = m.competition?.id ? String(m.competition.id) : '_';
                    if (!grouped.has(lid)) grouped.set(lid, { id: lid, name: m.competition?.name || 'Other', emblem: m.competition?.emblem || null, matches: [] });
                    grouped.get(lid).matches.push(m);
                  });
                  return [...grouped.values()];
                })().map(league => (
                  <div key={league.id} className="mg-sec">
                    <div className="mg-lh">
                      {league.emblem && <img src={league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                      <span>{league.name}</span>
                      <span className="cnt">{league.matches.length}</span>
                    </div>
                    {league.matches.map((m, i) => <MatchCard key={m.id} m={m} idx={i} expanded={expanded} onToggle={handleToggle} />)}
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* ══════ STANDINGS TAB ══════ */}
        {tab === 'standings' && (
          <>
            {compFilter === 'ALL' ? (
              <div className="mg-empty">
                <div className="mg-ei">📊</div>
                <p>Select a competition above to view standings</p>
                <p className="hint">Available: PL, BL1, SA, PD, FL1, CL on free tier</p>
              </div>
            ) : standingsLoading ? (
              <div className="mg-tbl-w" style={{ padding: '14px 10px' }}>
                {Array.from({ length: 6 }).map((_, i) => {
  return <div key={i} className="mg-sk" style={{ marginBottom: 6, animationDelay: i * 70 + 'ms' }} />;
})}
              </div>
            ) : standingsData?.standings ? (
              <>
                {selectedComp && (
                  <div className="mg-lh">
                    {selectedComp.emblem && <img src={selectedComp.emblem} alt="" />}
                    <span>{selectedComp.name} — Standings</span>
                  </div>
                )}
                <StandingsTable standings={standingsData.standings} />
              </>
            ) : (
              <div className="mg-empty">
                <div className="mg-ei">📊</div>
                <p>Standings not available for this competition</p>
                <p className="hint">Requires a paid Football-Data.org plan for most leagues</p>
              </div>
            )}
          </>
        )}

        {/* ══════ TEAMS TAB ══════ */}
        {tab === 'teams' && (
          <>
            {compFilter === 'ALL' ? (
              <div className="mg-empty">
                <div className="mg-ei">👥</div>
                <p>Select a competition above to view teams</p>
                <p className="hint">Available: PL, BL1, SA, PD, FL1, CL on free tier</p>
              </div>
            ) : teamsLoading ? (
              <div className="mg-tg" style={{ padding: '14px 10px' }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="mg-tcard" style={{ padding: '18px 10px' }}>
                    <div className="mg-sk" style={{ width: 36, height: 36, borderRadius: '50%', margin: '0 auto 8px', animationDelay: i * 60 + 'ms' }} />
                    <div className="mg-sk" style={{ width: '65%', height: 11, margin: '0 auto 5px', animationDelay: i * 60 + 100 + 'ms' }} />
                    <div className="mg-sk" style={{ width: '40%', height: 9, margin: '0 auto', animationDelay: i * 60 + 200 + 'ms' }} />
                  </div>
                ))}
              </div>
            ) : teamsData?.teams ? (
              <>
                {selectedComp && (
                  <div className="mg-lh">
                    {selectedComp.emblem && <img src={selectedComp.emblem} alt="" />}
                    <span>{selectedComp.name} — {teamsData.teams.length} Teams</span>
                    <span className="cnt" style={{ marginLeft: 'auto' }}>{teamsData.teams.length}</span>
                  </div>
                )}
                <TeamsGrid teams={teamsData.teams} />
              </>
            ) : (
              <div className="mg-empty">
                <div className="mg-ei">👥</div>
                <p>Teams not available for this competition</p>
                <p className="hint">Requires a paid Football-Data.org plan for most leagues</p>
              </div>
            )}
          </>
        )}

        {/* ══════ COMPETITIONS TAB ══════ */}
        {tab === 'competitions' && (
          <>
            <div className="mg-lh">
              <span className="mg-sec-title" style={{ textTransform: 'none', fontSize: '.82rem', color: 'var(--text-primary,#e2e8f0)' }}>All Competitions</span>
              <span className="mg-sec-count">{compOptions.length} available</span>
            </div>
            <div style={{ fontSize: '.64rem', color: 'var(--text-muted,#4a5568)', marginBottom: 14, padding: '0 2px', lineHeight: 1.6 }}>
              Showing all competitions returned by the free tier. Standings and teams are available for: Premier League, Bundesliga, Serie A, La Liga, Ligue 1, Champions League.
            </div>
            <CompsGrid competitions={compOptions} onSelect={handleCompSelect} />
          </>
        )}

      </div>
    </div>
  );
}