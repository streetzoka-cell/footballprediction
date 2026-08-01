import React, { useState, useMemo, useCallback, memo } from 'react';
import { Zap, Check, Copy, CheckCircle2, Loader2, Trophy, Sparkles } from 'lucide-react';
import { Empty } from './common';

const ResultsTab = memo(function ResultsTab({ date, preds, onResolve, onOverride, toast }) {
  const [scores, setScores] = useState({});
  const [resolving, setResolving] = useState({});
  const [overriding, setOverriding] = useState({});

  const unresolved = useMemo(() => preds.filter(p => {
    const mid = String(p.matchId || p.id);
    const s = scores[mid];
    const hasNewScore = s && s.h !== '' && s.a !== '';
    const hasExistingScore = p.homeScore != null && p.awayScore != null;
    return (!p.isFinished && p.status !== 'finished') || hasNewScore || !hasExistingScore;
  }), [preds, scores]);

  const resolved = useMemo(() => preds.filter(p => p.isFinished || p.status === 'finished'), [preds]);

  const updScore = useCallback((mid, f, v) => {
    const c = v.replace(/[^0-9]/g, '').slice(0, 2);
    setScores(prev => ({ ...prev, [mid]: { ...(prev[mid] || {}), [f]: c } }));
  }, []);

  const handleAutoResolveAll = useCallback(async () => {
    const toAutoResolve = unresolved.filter(p => {
      const mid = String(p.matchId || p.id);
      const s = scores[mid];
      return (p.status === 'FINISHED' || p.status === 'FT' || p.isFinished) && (s?.h !== '' && s?.a !== '');
    });
    
    if (toAutoResolve.length === 0) { 
      toast('No finished matches with scores to auto-resolve', 'in'); 
      return; 
    }
    
    setResolving(prev => { 
      const n = { ...prev }; 
      toAutoResolve.forEach(p => { n[String(p.matchId || p.id)] = true; }); 
      return n; 
    });
    
    let ok = 0, fail = 0;
    for (const p of toAutoResolve) {
      const mid = String(p.matchId || p.id);
      const s = scores[mid];
      try { 
        await onResolve(p, Number(s.h), Number(s.a), true); 
        ok++; 
      } catch { 
        fail++; 
      }
    }
    setScores({}); 
    setResolving({});
    toast(`Auto-resolved ${ok} match${ok !== 1 ? 'es' : ''}${fail > 0 ? ', ' + fail + ' failed' : ''}`, fail > 0 ? 'er' : 'ok');
  }, [unresolved, scores, onResolve, toast]);

  const handleResolve = useCallback(async (pred) => {
    const mid = String(pred.matchId || pred.id);
    const s = scores[mid];
    const h = s?.h !== '' ? Number(s.h) : (pred.homeScore ?? null);
    const a = s?.a !== '' ? Number(s.a) : (pred.awayScore ?? null);
    if (h == null || a == null) { toast('Enter both scores', 'in'); return; }
    setResolving(prev => ({ ...prev, [mid]: true }));
    try {
      await onResolve(pred, h, a);
      setScores(prev => { const n = { ...prev }; delete n[mid]; return n; });
      toast(`Resolved: ${pred.homeTeam?.shortName || pred.homeTeam?.name} ${h}-${a} ${pred.awayTeam?.shortName || pred.awayTeam?.name}`, 'ok');
    } catch (e) { toast('Resolve failed: ' + e.message, 'er'); }
    setResolving(prev => ({ ...prev, [mid]: false }));
  }, [scores, onResolve, toast]);

  const handleOverride = useCallback(async (pred) => {
    const mid = String(pred.matchId || pred.id);
    const s = scores[mid];
    const h = s?.h !== '' ? Number(s.h) : null;
    const a = s?.a !== '' ? Number(s.a) : null;
    if (h == null || a == null) { toast('Enter new scores to override', 'in'); return; }
    setOverriding(prev => ({ ...prev, [mid]: true }));
    try {
      await onOverride(pred, h, a);
      setScores(prev => { const n = { ...prev }; delete n[mid]; return n; });
      toast(`Override: ${pred.homeTeam?.shortName || pred.homeTeam?.name} → ${h}-${a}`, 'ok');
    } catch (e) { toast('Override failed: ' + e.message, 'er'); }
    setOverriding(prev => ({ ...prev, [mid]: false }));
  }, [scores, onOverride, toast]);

  return (
    <div className="flex-col gap-16">
      {unresolved.length > 0 && (
        <div className="glass-card p-16 flex-col gap-12">
          <div className="flex-between">
            <h3 className="text-primary font-bold flex-center gap-8"><Zap size={15} /> Score & Resolve ({unresolved.length})</h3>
            <div className="flex gap-8">
              <button className="btn btn-secondary btn-sm" onClick={handleAutoResolveAll} disabled={Object.values(resolving).some(Boolean)}>
                <Sparkles size={11} /> Auto-Resolve Finished
              </button>
            </div>
          </div>
          {unresolved.map((p, i) => {
            const mid = String(p.matchId || p.id);
            const s = scores[mid] || {};
            const isResolving = resolving[mid];
            const hasExisting = p.homeScore != null;
            return (
              <div key={mid} className="glass-card p-12 flex-col gap-8 anim-fade-up" style={{ animationDelay: `${i * 20}ms`, borderLeft: `3px solid ${hasExisting ? 'var(--warning)' : 'var(--accent)'}` }}>
                <div className="flex-between">
                  <div className="flex-center gap-8 text-muted text-xs font-bold">
                    {p.league?.emblem && <img src={p.league.emblem} alt="" width="14" height="14" />}
                    <span>{p.league?.name || 'Match'}</span>
                  </div>
                  {hasExisting && <span className="badge badge-gold">OVERRIDE</span>}
                </div>
                <div className="flex-center gap-8">
                  <div className="flex-center gap-8 flex-1 min-w-0">
                    {(p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest) && <img src={p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest} alt="" width="24" height="24" />}
                    <span className="text-primary font-bold text-sm truncate">{p.homeTeam?.shortName || p.homeTeam?.name || 'Home'}</span>
                  </div>
                  <div className="flex-center gap-4 px-12 py-4 rounded-md bg-elevated">
                    <input className="form-input text-center" style={{ width: 40, padding: '4px', fontWeight: 800 }} type="number" min="0" max="99" value={s.h ?? (p.homeScore ?? '')} onChange={e => updScore(mid, 'h', e.target.value)} placeholder={p.homeScore ?? '-'} />
                    <span className="text-muted">–</span>
                    <input className="form-input text-center" style={{ width: 40, padding: '4px', fontWeight: 800 }} type="number" min="0" max="99" value={s.a ?? (p.awayScore ?? '')} onChange={e => updScore(mid, 'a', e.target.value)} placeholder={p.awayScore ?? '-'} />
                  </div>
                  <div className="flex-center gap-8 flex-1 min-w-0 justify-end">
                    <span className="text-primary font-bold text-sm truncate">{p.awayTeam?.shortName || p.awayTeam?.name || 'Away'}</span>
                    {(p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest) && <img src={p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest} alt="" width="24" height="24" />}
                  </div>
                </div>
                <div className="flex-between mt-4">
                  {hasExisting ? (
                    <button className="btn btn-secondary btn-sm" onClick={() => handleOverride(p)} disabled={overriding[mid] || (!s.h && s.h !== '0') || (!s.a && s.a !== '0')}>
                      {overriding[mid] ? <Loader2 size={11} className="anim-spin" /> : <Copy size={11} />} Override
                    </button>
                  ) : (
                    <button className="btn btn-primary btn-sm" onClick={() => handleResolve(p)} disabled={isResolving || (!s.h && s.h !== '0') || (!s.a && s.a !== '0')}>
                      {isResolving ? <Loader2 size={11} className="anim-spin" /> : <Check size={11} />} Resolve
                    </button>
                  )}
                  {p.homeScore != null && <span className="badge badge-muted">Was: {p.homeScore}-{p.awayScore}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="glass-card p-16 flex-col gap-12">
          <h3 className="text-primary font-bold flex-center gap-8"><CheckCircle2 size={15} /> Resolved ({resolved.length})</h3>
          {resolved.map((p, i) => {
            const mid = String(p.matchId || p.id);
            const s = scores[mid] || {};
            const isOverriding = overriding[mid];
            return (
              <div key={mid} className="glass-card p-12 flex-col gap-8 anim-fade-up opacity-80" style={{ animationDelay: `${i * 15}ms`, borderLeft: '3px solid var(--primary)' }}>
                <div className="flex-between">
                  <div className="flex-center gap-8 text-muted text-xs font-bold">
                    {p.league?.emblem && <img src={p.league.emblem} alt="" width="14" height="14" />}
                    <span>{p.league?.name || 'Match'}</span>
                  </div>
                  <span className="badge badge-primary">FT</span>
                </div>
                <div className="flex-center gap-8">
                  <div className="flex-center gap-8 flex-1 min-w-0">
                    {(p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest) && <img src={p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest} alt="" width="24" height="24" />}
                    <span className="text-primary font-bold text-sm truncate">{p.homeTeam?.shortName || p.homeTeam?.name || 'Home'}</span>
                  </div>
                  <div className="flex-center gap-4 px-12 py-4 rounded-md bg-primary/10">
                    <span className="font-extrabold text-primary">{p.homeScore}</span>
                    <span className="text-muted">–</span>
                    <span className="font-extrabold text-primary">{p.awayScore}</span>
                  </div>
                  <div className="flex-center gap-8 flex-1 min-w-0 justify-end">
                    <span className="text-primary font-bold text-sm truncate">{p.awayTeam?.shortName || p.awayTeam?.name || 'Away'}</span>
                    {(p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest) && <img src={p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest} alt="" width="24" height="24" />}
                  </div>
                </div>
                <div className="flex-between mt-4">
                  <span className="badge badge-primary"><CheckCircle2 size={9} /> {p.homeScore}-{p.awayScore}</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleOverride(p)} disabled={isOverriding || (!s.h && s.h !== '0') || (!s.a && s.a !== '0')}>
                    {isOverriding ? <Loader2 size={11} className="anim-spin" /> : <Copy size={11} />} Override
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {preds.length === 0 && (<Empty icon={Trophy} title="No featured matches for this date" hint="Add featured matches first, then score them here" />)}
    </div>
  );
});

export default ResultsTab;