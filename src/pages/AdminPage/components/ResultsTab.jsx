import React, { useState, useMemo, useCallback, memo } from 'react';
import { Zap, Check, Copy, CheckCircle2, Loader2, Trophy } from 'lucide-react';
import { Empty } from './common';

const ResultsTab = memo(function ResultsTab({ date, preds, onResolve, onOverride, toast }) {
  const [scores, setScores] = useState({});
  const [resolving, setResolving] = useState({});
  const [overriding, setOverriding] = useState({});

  const unresolved = useMemo(() =>
    preds.filter(p => {
      const mid = String(p.matchId || p.id);
      const s = scores[mid];
      const hasNewScore = s && s.h !== '' && s.a !== '';
      const hasExistingScore = p.homeScore != null && p.awayScore != null;
      return !p.isFinished && p.status !== 'finished' || hasNewScore || !hasExistingScore;
    }),
    [preds, scores]
  );

  const resolved = useMemo(() => preds.filter(p => p.isFinished || p.status === 'finished'), [preds]);

  const updScore = useCallback((mid, f, v) => {
    const c = v.replace(/[^0-9]/g, '').slice(0, 2);
    setScores(prev => ({ ...prev, [mid]: { ...(prev[mid] || {}), [f]: c } }));
  }, []);

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

  const handleResolveAll = useCallback(async () => {
    const toResolve = unresolved.filter(p => {
      const mid = String(p.matchId || p.id);
      const s = scores[mid];
      return s?.h !== '' && s?.a !== '';
    });
    if (toResolve.length === 0) { toast('No scored matches to resolve', 'in'); return; }
    setResolving(prev => { const n = { ...prev }; toResolve.forEach(p => { n[String(p.matchId || p.id)] = true; }); return n; });
    let ok = 0, fail = 0;
    for (const p of toResolve) {
      const mid = String(p.matchId || p.id);
      const s = scores[mid];
      try { await onResolve(p, Number(s.h), Number(s.a)); ok++; } catch { fail++; }
    }
    setScores({});
    setResolving({});
    toast(`Resolved ${ok} match${ok !== 1 ? 'es' : ''}${fail > 0 ? ', ' + fail + ' failed' : ''}`, fail > 0 ? 'er' : 'ok');
  }, [unresolved, scores, onResolve, toast]);

  return (
    <div className="ae">
      {unresolved.length > 0 && (
        <div className="asec">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 className="ast" style={{ margin: 0 }}><Zap size={15} /> Score & Resolve ({unresolved.length})</h3>
            <button className="ab ab-sm ab-p" onClick={handleResolveAll} disabled={Object.values(resolving).some(Boolean)}>
              <Zap size={11} /> Resolve All Scored
            </button>
          </div>
          {unresolved.map((p, i) => {
            const mid = String(p.matchId || p.id);
            const s = scores[mid] || {};
            const isResolving = resolving[mid];
            const hasExisting = p.homeScore != null;
            return (
              <div key={mid} className={`am card-in${hasExisting ? ' editing' : ''}`} style={{ animationDelay: `${i * 20}ms` }}>
                <div className="amh">
                  <div className="aml">
                    {p.league?.emblem && <img src={p.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <span>{p.league?.name || 'Match'}</span>
                  </div>
                  {hasExisting && <span className="as" style={{ color: 'var(--gold)', background: 'rgba(245,158,11,.1)' }}>OVERRIDE</span>}
                </div>
                <div className="atm">
                  <div className="ate">
                    {(p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest) && <img src={p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <span>{p.homeTeam?.shortName || p.homeTeam?.name || 'Home'}</span>
                  </div>
                  <div className="asb" style={{ borderColor: 'rgba(16,185,129,.25)', background: 'rgba(16,185,129,.04)' }}>
                    <input className={`ari${s.h ? ' hv' : ''}`} type="number" min="0" max="99" value={s.h ?? (p.homeScore ?? '')} onChange={e => updScore(mid, 'h', e.target.value)} placeholder={p.homeScore ?? '-'} />
                    <span className="asep">–</span>
                    <input className={`ari${s.a ? ' hv' : ''}`} type="number" min="0" max="99" value={s.a ?? (p.awayScore ?? '')} onChange={e => updScore(mid, 'a', e.target.value)} placeholder={p.awayScore ?? '-'} />
                  </div>
                  <div className="ate aw">
                    {(p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest) && <img src={p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <span>{p.awayTeam?.shortName || p.awayTeam?.name || 'Away'}</span>
                  </div>
                </div>
                <div className="aa">
                  {hasExisting ? (
                    <button className="ab ab-sm ab-olive" onClick={() => handleOverride(p)} disabled={overriding[mid] || (!s.h && s.h !== '0') || (!s.a && s.a !== '0')}>
                      {overriding[mid] ? <Loader2 size={11} className="asp" /> : <Copy size={11} />} Override
                    </button>
                  ) : (
                    <button className="ab ab-sm ab-p" onClick={() => handleResolve(p)} disabled={isResolving || (!s.h && s.h !== '0') || (!s.a && s.a !== '0')}>
                      {isResolving ? <Loader2 size={11} className="asp" /> : <Check size={11} />} Resolve
                    </button>
                  )}
                  {p.homeScore != null && <span className="abdg pn">Was: {p.homeScore}-{p.awayScore}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="asec">
          <h3 className="ast"><CheckCircle2 size={15} /> Resolved ({resolved.length})</h3>
          {resolved.map((p, i) => {
            const mid = String(p.matchId || p.id);
            const s = scores[mid] || {};
            const isOverriding = overriding[mid];
            return (
              <div key={mid} className="am card-in ok resolved" style={{ animationDelay: `${i * 15}ms` }}>
                <div className="amh">
                  <div className="aml">
                    {p.league?.emblem && <img src={p.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <span>{p.league?.name || 'Match'}</span>
                  </div>
                  <span className="as" style={{ color: 'var(--accent)', background: 'rgba(16,185,129,.08)' }}>FT</span>
                </div>
                <div className="atm">
                  <div className="ate">
                    {(p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest) && <img src={p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <span>{p.homeTeam?.shortName || p.homeTeam?.name || 'Home'}</span>
                  </div>
                  <div className="asb ft" style={{ borderColor: 'rgba(16,185,129,.25)', background: 'rgba(16,185,129,.04)' }}>
                    <input className={`ari${s.h ? ' hv' : ''}`} type="number" min="0" max="99" value={s.h ?? p.homeScore} onChange={e => updScore(mid, 'h', e.target.value)} />
                    <span className="asep">–</span>
                    <input className={`ari${s.a ? ' hv' : ''}`} type="number" min="0" max="99" value={s.a ?? p.awayScore} onChange={e => updScore(mid, 'a', e.target.value)} />
                  </div>
                  <div className="ate aw">
                    {(p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest) && <img src={p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <span>{p.awayTeam?.shortName || p.awayTeam?.name || 'Away'}</span>
                  </div>
                </div>
                <div className="aa">
                  <span className="abdg ex"><CheckCircle2 size={9} /> {p.homeScore}-{p.awayScore}</span>
                  <button className="ab ab-sm ab-olive" onClick={() => handleOverride(p)} disabled={isOverriding || (!s.h && s.h !== '0') || (!s.a && s.a !== '0')}>
                    {isOverriding ? <Loader2 size={11} className="asp" /> : <Copy size={11} />} Override
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {preds.length === 0 && (
        <Empty icon={Trophy} title="No featured matches for this date" hint="Add featured matches first, then score them here" />
      )}
    </div>
  );
});

export default ResultsTab;