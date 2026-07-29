import React, { useState, useEffect, useRef, memo } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, ChevronUp, ChevronDown, Loader2, Star, Plus, Trash2, Save, Send, Pencil, Copy, Check, TrendingUp } from 'lucide-react';
import { getLocalDateStr, getLocalDateFromUtc, parseDateAsUTC } from '../../../utils/dates';
import { isLiveStatus, isFinishedStatus, SPORT } from '../../../utils/constants';

export const MAX_FEATURED = 10;
export const MAX_ZOKA = 10;
export const SHOW_INIT = 8;

export const cleanObj = (obj) => JSON.parse(JSON.stringify(obj));
export const useMounted = () => { const r = useRef(true); useEffect(() => () => { r.current = false; }, []); return r; };

export const dateOffset = (o = 0) => getLocalDateStr(o); 
export const dateLabel = (d) => {
  const t = getLocalDateStr(0), tm = getLocalDateStr(1), ys = getLocalDateStr(-1);
  if (d === t) return 'Today'; if (d === tm) return 'Tomorrow'; if (d === ys) return 'Yesterday';
  const dt = new Date(d + 'T12:00:00'), days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return `${days[dt.getDay()]} ${d.slice(5)}`;
};

export function extractMatchDate(m) {
  if (!m) return '';
  if (m.utcDate) return getLocalDateFromUtc(m.utcDate);
  if (m.date && m.date.includes('T')) return m.date.split('T')[0];
  if (m.date) return m.date;
  return '';
}
export const extractDate = m => extractMatchDate(m);

export const sortByImportance = (a, b) => (b.matchScore || 0) - (a.matchScore || 0);

export const ST_MAP = {
  SCHEDULED:{c:'var(--text-muted)',b:'rgba(255,255,255,.04)',l:'Upcoming'},
  TIMED:{c:'var(--text-muted)',b:'rgba(255,255,255,.04)',l:'Upcoming'},
  NS:{c:'var(--text-muted)',b:'rgba(255,255,255,.04)',l:'Upcoming'},
  TBD:{c:'var(--text-muted)',b:'rgba(255,255,255,.04)',l:'TBD'},
  IN_PLAY:{c:'#ef4444',b:'rgba(239,68,68,.1)',l:'Live'},
  PAUSED:{c:'#f97316',b:'rgba(249,115,22,.1)',l:'HT'},
  '1H':{c:'#ef4444',b:'rgba(239,68,68,.1)',l:'Live'},
  '2H':{c:'#ef4444',b:'rgba(239,68,68,.1)',l:'Live'},
  HT:{c:'#f97316',b:'rgba(249,115,22,.1)',l:'HT'},
  BT:{c:'#f97316',b:'rgba(249,115,22,.1)',l:'BT'},
  ET:{c:'#ef4444',b:'rgba(239,68,68,.1)',l:'ET'},
  P:{c:'#ef4444',b:'rgba(239,68,68,.1)',l:'Pens'},
  FT:{c:'var(--accent)',b:'rgba(16,185,129,.08)',l:'FT'},
  FINISHED:{c:'var(--accent)',b:'rgba(16,185,129,.08)',l:'FT'},
  AET:{c:'var(--accent)',b:'rgba(16,185,129,.08)',l:'FT'},
  PEN:{c:'var(--accent)',b:'rgba(16,185,129,.08)',l:'FT'},
  PST:{c:'#f59e0b',b:'rgba(245,158,11,.1)',l:'PST'},
};
export const gst = s => ST_MAP[s] || ST_MAP.SCHEDULED;

export const isLive = m => isLiveStatus(m?.status, m?.sport || SPORT.FOOTBALL) || m?.isLive;
export const isFin = m => isFinishedStatus(m?.status, m?.sport || SPORT.FOOTBALL) || m?.isFinished;
export const getScore = m => m?.score?.fullTime ? {h:m.score.fullTime.home,a:m.score.fullTime.away} : m?.homeScore!=null ? {h:m.homeScore,a:m.awayScore} : {h:null,a:null};

export const hasMatchStarted = (m) => {
  if (!m) return false;
  if (isLive(m) || isFin(m)) return true;
  const kickoffStr = m?.utcDate || m?.date || m?.kickoff;
  if (kickoffStr) {
    const kickoffTime = new Date(kickoffStr).getTime();
    if (!isNaN(kickoffTime) && kickoffTime <= Date.now()) return true; 
  }
  return false;
};

export const fmtTimeAgo = dt => {
  if (!dt) return 'Never';
  let ts;
  if (typeof dt==='number') ts = dt<1e12?dt*1000:dt;
  else if (typeof dt==='string') { ts=Date.parse(dt); if(isNaN(ts)) return 'Unknown'; }
  else if (dt.seconds!=null) ts=dt.seconds*1000;
  else if (dt?.getTime) ts=dt.getTime();
  else return 'Unknown';
  const s=Math.floor((Date.now()-ts)/1000);
  if(s<10) return 'Just now'; if(s<60) return `${s}s ago`;
  const m=Math.floor(s/60); if(m<60) return `${m}m ago`;
  const h=Math.floor(m/60); if(h<24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
};

export const Skel = memo(function Skel({ n = 3 }) {
  return <div>{Array.from({ length: n }).map((_, i) => <div key={i} className="askel" style={{ animationDelay: `${i * 80}ms` }} />)}</div>;
});

export const Empty = memo(function Empty({ icon: Ic, title, hint }) {
  return (
    <div className="aem">
      {Ic && <Ic size={26} style={{ color: 'var(--text-muted)', display: 'block', margin: '0 auto 6px' }} />}
      <p>{title}</p>{hint && <p className="h">{hint}</p>}
    </div>
  );
});

export const ShowMore = memo(function ShowMore({ count, show, onToggle }) {
  if (count <= 0) return null;
  return (
    <button className="asm" onClick={onToggle} style={{ marginTop: 8 }}>
      {show ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      {show ? 'Show less' : `Show ${count} more`}
    </button>
  );
});

export const RBadge = memo(function RBadge({ pick }) {
  if (!pick?.adminPick || pick.status !== 'finished') return null;
  const h = pick.adminPick.home, a = pick.adminPick.away, ph = pick.homeScore, pa = pick.awayScore;
  if (ph == null || pa == null) return <span className="abdg pn">PENDING</span>;
  if (h === ph && a === pa) return <span className="abdg ex"><CheckCircle2 size={9} /> EXACT +10</span>;
  if ((h > a ? 'H' : h < a ? 'A' : 'D') === (ph > pa ? 'H' : ph < pa ? 'A' : 'D')) return <span className="abdg rs"><TrendingUp size={9} /> RESULT +3</span>;
  return <span className="abdg ms"><XCircle size={9} /> MISS</span>;
});

export const Toast = memo(function Toast({ message, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  const Ic = type === 'ok' ? CheckCircle2 : type === 'er' ? XCircle : AlertTriangle;
  return <div className={`atst ${type}`}><Ic size={15} /> {message}</div>;
});

export const Confirm = memo(function Confirm({ title, msg, onYes, onNo, yesText = 'Confirm', danger = false }) {
  return (
    <div className="aov" onClick={onNo}>
      <div className="abox" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3><p>{msg}</p>
        <div className="abbtns">
          <button className="ab ab-gh" onClick={onNo}>Cancel</button>
          <button className={`ab ${danger ? 'ab-dg' : 'ab-p'}`} onClick={onYes}>{yesText}</button>
        </div>
      </div>
    </div>
  );
});

export const MatchRow = memo(function MatchRow({ m, idx, mode, sel, onToggleSel, scoreInput, onScoreInput, pubPick, extraBadge, isFeatured, isAdding, isFull, onAddClick, onRemoveClick, isRemoving }) {
  const mid = String(m.id);
  const live = isLive(m), fin = isFin(m), sc = getScore(m);
  const comp = m.competition || m.league;
  const st = gst(m.status);
  const cls = `am card-in${sel ? ' zs' : ''}${live ? ' lg' : ''}`;
  
  return (
    <div className={cls} style={{ animationDelay: `${idx * 20}ms` }}>
      <div className="amh">
        <div className="aml">
          {comp?.emblem && <img src={comp.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{comp?.name || 'Unknown'}</span>
          {m.category === 'FEATURED' && (
            <span style={{ fontSize: '0.55rem', fontWeight: 900, color: '#fbbf24', background: 'rgba(251,191,36,0.12)', padding: '2px 6px', borderRadius: 4, marginLeft: 6, letterSpacing: '0.05em' }}>★ TOP</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {live && <span className="ld" />}
          <span className="as" style={{ color: st.c, background: st.b }}>
            {live && m.minute != null ? `${m.minute}'` : st.l}
          </span>
        </div>
      </div>
      <div className="atm">
        <div className="ate">
          {m.homeTeam?.crest && <img src={m.homeTeam.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{m.homeTeam?.shortName || m.homeTeam?.name || 'TBD'}</span>
        </div>
        <div className={`asb${live ? ' lv' : ''}${fin ? ' ft' : ''}`}>
          {(live || fin) ? (
            <><span className={`asn${live ? ' r' : ' g'}`}>{sc.h ?? 0}</span><span className="asep">–</span><span className={`asn${live ? ' r' : ' g'}`}>{sc.a ?? 0}</span></>
          ) : <span className="avs">VS</span>}
        </div>
        <div className="ate aw">
          {m.awayTeam?.crest && <img src={m.awayTeam.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{m.awayTeam?.shortName || m.awayTeam?.name || 'TBD'}</span>
        </div>
      </div>
      <div className="aa">
        {mode === 'zoka' && onToggleSel && (
          <button className={`ab ab-sm ${sel ? 'ab-gd' : 'ab-ol'}`} onClick={() => onToggleSel(m)}>
            <Star size={11} fill={sel ? 'currentColor' : 'none'} />{sel ? 'Selected' : 'Zoka Pick'}
          </button>
        )}
        {mode === 'zoka' && sel && scoreInput && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input className={`api${scoreInput.h ? ' hv' : ''}`} value={scoreInput.h} onChange={e => onScoreInput(mid, 'h', e.target.value)} placeholder="H" maxLength={2} />
            <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>–</span>
            <input className={`api${scoreInput.a ? ' hv' : ''}`} value={scoreInput.a} onChange={e => onScoreInput(mid, 'a', e.target.value)} placeholder="A" maxLength={2} />
          </div>
        )}
        {mode === 'featured' && (
          isFeatured ? (
            <button className="ab ab-sm ab-dg" onClick={() => onRemoveClick(m)} disabled={isRemoving}>
              {isRemoving ? <Loader2 size={11} className="asp" /> : <Trash2 size={11} />} Remove
            </button>
          ) : (
            <button className="ab ab-sm ab-sc" onClick={() => onAddClick(m)} disabled={isAdding || isFull}>
              {isAdding ? <Loader2 size={11} className="asp" /> : <Plus size={11} />}
              {isFull ? 'Full' : 'Add'}
            </button>
          )
        )}
        {pubPick && <RBadge pick={pubPick} />}
        {extraBadge}
      </div>
    </div>
  );
});