import React, { useState, useEffect, useRef, memo } from 'react';
// ✅ ADDED: Plus, Trash2, Star to the imports
import { CheckCircle2, XCircle, AlertTriangle, ChevronUp, ChevronDown, Plus, Trash2, Star } from 'lucide-react';
import { getLocalDateStr, getLocalDateFromUtc } from '../../../utils/dates';
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
  if (m.dateStr) return m.dateStr;
  if (m.utcDate) return getLocalDateFromUtc(m.utcDate);
  if (m.date && m.date.includes('T')) return m.date.split('T')[0];
  if (m.date) return m.date;
  return '';
}

export const extractDate = m => extractMatchDate(m);
export const sortByImportance = (a, b) => (b.matchScore || 0) - (a.matchScore || 0);

export const ST_MAP = {
  SCHEDULED: { c: 'var(--text-muted)', b: 'var(--bg-elevated)', l: 'Upcoming' },
  NS: { c: 'var(--text-muted)', b: 'var(--bg-elevated)', l: 'Upcoming' },
  IN_PLAY: { c: 'var(--danger)', b: 'rgba(var(--danger-rgb),.1)', l: 'Live' },
  '1H': { c: 'var(--danger)', b: 'rgba(var(--danger-rgb),.1)', l: 'Live' },
  '2H': { c: 'var(--danger)', b: 'rgba(var(--danger-rgb),.1)', l: 'Live' },
  HT: { c: 'var(--gold)', b: 'rgba(var(--gold-rgb),.1)', l: 'HT' },
  ET: { c: 'var(--danger)', b: 'rgba(var(--danger-rgb),.1)', l: 'ET' },
  P: { c: 'var(--danger)', b: 'rgba(var(--danger-rgb),.1)', l: 'Pens' },
  FT: { c: 'var(--primary)', b: 'rgba(var(--primary-rgb),.08)', l: 'FT' },
  FINISHED: { c: 'var(--primary)', b: 'rgba(var(--primary-rgb),.08)', l: 'FT' },
  AET: { c: 'var(--primary)', b: 'rgba(var(--primary-rgb),.08)', l: 'FT' },
  PEN: { c: 'var(--primary)', b: 'rgba(var(--primary-rgb),.08)', l: 'FT' },
  PST: { c: 'var(--warning)', b: 'rgba(var(--warning-rgb),.1)', l: 'PST' },
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
  return <div className="flex-col gap-8">{Array.from({ length: n }).map((_, i) => <div key={i} className="skeleton" style={{ height: 80, animationDelay: `${i * 80}ms` }} />)}</div>;
});

export const Empty = memo(function Empty({ icon: Ic, title, hint }) {
  return (
    <div className="glass-card flex-col items-center gap-8 p-32 text-center">
      {Ic && <Ic size={26} className="text-muted" />}
      <p className="text-primary font-bold text-sm">{title}</p>
      {hint && <p className="text-muted text-xs">{hint}</p>}
    </div>
  );
});

export const ShowMore = memo(function ShowMore({ count, show, onToggle }) {
  if (count <= 0) return null;
  return (
    <button className="btn btn-secondary btn-sm w-full mt-8" onClick={onToggle}>
      {show ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      {show ? 'Show less' : `Show ${count} more`}
    </button>
  );
});

export const RBadge = memo(function RBadge({ pick }) {
  if (!pick?.adminPick || pick.status !== 'finished') return null;
  const h = pick.adminPick.home, a = pick.adminPick.away, ph = pick.homeScore, pa = pick.awayScore;
  if (ph == null || pa == null) return <span className="badge badge-muted">PENDING</span>;
  if (h === ph && a === pa) return <span className="badge badge-primary"><CheckCircle2 size={9} /> EXACT +10</span>;
  if ((h > a ? 'H' : h < a ? 'A' : 'D') === (ph > pa ? 'H' : ph < pa ? 'A' : 'D')) return <span className="badge badge-gold">RESULT +3</span>;
  return <span className="badge badge-danger"><XCircle size={9} /> MISS</span>;
});

export const Toast = memo(function Toast({ message, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  const Ic = type === 'ok' ? CheckCircle2 : type === 'er' ? XCircle : AlertTriangle;
  return <div className={`fixed bottom-20 left-1/2 -translate-x-1/2 glass-card px-16 py-12 flex-center gap-8 z-max anim-toast-in`}><Ic size={15} className={type === 'ok' ? 'text-primary' : type === 'er' ? 'text-danger' : 'text-gold'} /> {message}</div>;
});

export const Confirm = memo(function Confirm({ title, msg, onYes, onNo, yesText = 'Confirm', danger = false }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex-center z-max p-20" onClick={onNo}>
      <div className="glass-card p-24 max-w-400 w-full flex-col gap-12" onClick={e => e.stopPropagation()}>
        <h3 className="text-primary font-bold text-md">{title}</h3>
        <p className="text-muted text-sm">{msg}</p>
        <div className="flex gap-8 mt-8">
          <button className="btn btn-secondary flex-1" onClick={onNo}>Cancel</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'} flex-1`} onClick={onYes}>{yesText}</button>
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
  
  return (
    <div className="glass-card flex-col gap-8 p-12 anim-fade-up" style={{ animationDelay: `${idx * 20}ms`, borderLeft: sel ? '3px solid var(--gold)' : live ? '3px solid var(--danger)' : '3px solid var(--border)' }}>
      <div className="flex-between">
        <div className="flex-center gap-8 text-muted text-xs font-bold">
          {comp?.emblem && <img src={comp.emblem} alt="" width="14" height="14" />}
          <span>{comp?.name || 'Unknown'}</span>
        </div>
        <div className="flex-center gap-4">
          {live && <span className="zk-live-pulse-dot" />}
          <span className="badge" style={{ color: st.c, background: st.b, border: 'none' }}>
            {live && m.minute != null ? `${m.minute}'` : st.l}
          </span>
        </div>
      </div>
      <div className="flex-center gap-8">
        <div className="flex-center gap-8 flex-1 min-w-0">
          {m.homeTeam?.crest && <img src={m.homeTeam.crest} alt="" width="24" height="24" />}
          <span className="text-primary font-bold text-sm truncate">{m.homeTeam?.shortName || m.homeTeam?.name || 'TBD'}</span>
        </div>
        <div className={`flex-center gap-8 px-12 py-4 rounded-md ${live ? 'bg-danger/10' : fin ? 'bg-primary/10' : 'bg-elevated'}`}>
          {(live || fin) ? (
            <><span className={`font-extrabold ${live ? 'text-danger' : 'text-primary'}`}>{sc.h ?? 0}</span><span className="text-muted">–</span><span className={`font-extrabold ${live ? 'text-danger' : 'text-primary'}`}>{sc.a ?? 0}</span></>
          ) : <span className="text-muted text-xs font-bold">VS</span>}
        </div>
        <div className="flex-center gap-8 flex-1 min-w-0 justify-end">
          <span className="text-primary font-bold text-sm truncate">{m.awayTeam?.shortName || m.awayTeam?.name || 'TBD'}</span>
          {m.awayTeam?.crest && <img src={m.awayTeam.crest} alt="" width="24" height="24" />}
        </div>
      </div>
      <div className="flex-between gap-8 flex-wrap mt-4">
        {mode === 'zoka' && onToggleSel && (
          <button className={`btn btn-sm ${sel ? 'btn-primary' : 'btn-secondary'}`} onClick={() => onToggleSel(m)}>
            <Star size={11} fill={sel ? 'currentColor' : 'none'} />{sel ? 'Selected' : 'Zoka Pick'}
          </button>
        )}
        {mode === 'zoka' && sel && scoreInput && (
          <div className="flex-center gap-4">
            <input className="form-input text-center" style={{ width: 40, padding: '4px', fontWeight: 800 }} value={scoreInput.h} onChange={e => onScoreInput(mid, 'h', e.target.value)} placeholder="H" maxLength={2} />
            <span className="text-muted">–</span>
            <input className="form-input text-center" style={{ width: 40, padding: '4px', fontWeight: 800 }} value={scoreInput.a} onChange={e => onScoreInput(mid, 'a', e.target.value)} placeholder="A" maxLength={2} />
          </div>
        )}
        {mode === 'featured' && (
          isFeatured ? (
            <button className="btn btn-danger btn-sm" onClick={() => onRemoveClick(m)} disabled={isRemoving}>
              {isRemoving ? '...' : <Trash2 size={11} />} Remove
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => onAddClick(m)} disabled={isAdding || isFull}>
              {isAdding ? '...' : <Plus size={11} />} {isFull ? 'Full' : 'Add'}
            </button>
          )
        )}
        {pubPick && <RBadge pick={pubPick} />}
        {extraBadge}
      </div>
    </div>
  );
});