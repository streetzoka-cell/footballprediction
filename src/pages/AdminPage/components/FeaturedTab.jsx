import React, { useState, useMemo, useCallback, memo } from 'react';
import { Radio, Plus, Trash2, Loader2, CalendarDays, Pencil } from 'lucide-react';
import { MAX_FEATURED, SHOW_INIT, extractDate, sortByImportance, hasMatchStarted, isLive, isFin, Skel, Empty, ShowMore, MatchRow } from './common';

const FeaturedTab = memo(function FeaturedTab({ date, preds, fixtures, onAdd, onRemove, fxLoading, toast }) {
  const [lg, setLg] = useState('ALL');
  const [showAll, setShowAll] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  
  // preds comes directly from React Query cache now, so it's always accurate.
  const isFull = preds.length >= MAX_FEATURED;

  const pids = useMemo(() => new Set(preds.map(p => String(p.matchId))), [preds]);

  const avail = useMemo(() => {
    if (!fixtures?.length) return [];
    let l = fixtures.filter(m => extractDate(m) === date && !hasMatchStarted(m) && !pids.has(String(m.id))).sort(sortByImportance); 
    if (lg !== 'ALL') l = l.filter(f => String(f.competition?.id || f.league?.id) === lg);
    return l;
  }, [fixtures, date, lg, pids]);

  const leagues = useMemo(() => {
    const map = new Map();
    (fixtures?.filter(m => extractDate(m) === date && !hasMatchStarted(m) && !pids.has(String(m.id))) || []).forEach(f => {
      const c = f.competition || f.league; if (!c) return;
      const id = String(c.id || c.code || 'x');
      if (!map.has(id)) map.set(id, { id, name: c.name || 'Other', emblem: c.emblem || c.logo || null, n: 0 });
      map.get(id).n++;
    });
    return [...map.values()].sort((a, b) => b.n - a.n);
  }, [fixtures, date, pids]);

  const vis = useMemo(() => showAll ? avail : avail.slice(0, SHOW_INIT), [avail, showAll]);
  const hidden = Math.max(0, avail.length - SHOW_INIT);

  const handleAddClick = useCallback(async (m) => {
    if (isFull) return;
    const mid = String(m.id);
    setAddingId(mid);
    try { await onAdd(m); } catch (e) { toast('Add failed: ' + e.message, 'er'); }
    finally { setAddingId(null); }
  }, [isFull, onAdd, toast]);

  const handleRemoveClick = useCallback(async (p) => {
    setRemovingId(String(p.matchId));
    try { await onRemove(p); } catch (e) { toast('Remove failed: ' + e.message, 'er'); }
    finally { setRemovingId(null); }
  }, [onRemove, toast]);

  return (
    <div className="ae">
      <div className="asec">
        <h3 className="ast"><Radio size={15} /> Featured Matches ({preds.length}/{MAX_FEATURED})</h3>
        {preds.length > 0 ? (
          <div>
            {preds.map((p, i) => {
              const mid = String(p.matchId);
              const isRemoving = removingId === mid;
              const sc = p.homeScore != null ? { h: p.homeScore, a: p.awayScore } : null;
              const live = isLive(p);
              const finished = isFin(p);
              const st = finished ? { c: 'var(--accent)', b: 'rgba(16,185,129,.08)', l: 'FT' } : live ? { c: '#ef4444', b: 'rgba(239,68,68,.1)', l: 'Live' } : { c: 'var(--text-muted)', b: 'rgba(255,255,255,.04)', l: p.kickoff || 'VS' };
              return (
                <div key={mid} className="am card-in" style={{ animationDelay: `${i * 20}ms`, borderLeft: '3px solid var(--accent)' }}>
                  <div className="amh">
                    <div className="aml">
                      {p.league?.emblem && <img src={p.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                      <span>{p.league?.name || 'Featured'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {live && <span className="ld" />}
                      <span className="as" style={{ color: st.c, background: st.b }}>{st.l}</span>
                    </div>
                  </div>
                  <div className="atm">
                    <div className="ate">
                      {(p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest) && <img src={p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                      <span>{p.homeTeam?.shortName || p.homeTeam?.name || 'Home'}</span>
                    </div>
                    <div className={`asb${live ? ' lv' : ''}${finished ? ' ft' : ''}`}>
                      {sc ? (<><span className={`asn${live ? ' r' : ' g'}`}>{sc.h}</span><span className="asep">–</span><span className={`asn${live ? ' r' : ' g'}`}>{sc.a}</span></>) : <span className="avs">VS</span>}
                    </div>
                    <div className="ate aw">
                      {(p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest) && <img src={p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                      <span>{p.awayTeam?.shortName || p.awayTeam?.name || 'Away'}</span>
                    </div>
                  </div>
                  <div className="aa">
                    <span className="abdg gn"><Radio size={9} /> Featured</span>
                    <button className="ab ab-sm ab-dg" onClick={() => handleRemoveClick(p)} disabled={isRemoving}>
                      {isRemoving ? <Loader2 size={11} className="asp" /> : <Trash2 size={11} />} Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty icon={Radio} title="No featured matches yet" hint="Add matches below for users to predict" />
        )}
      </div>

      {!isFull ? (
        <div className="asec">
          <h3 className="ast"><Plus size={15} /> Available Matches</h3>
          {leagues.length > 1 && (
            <div className="alb" style={{ marginBottom: 10 }}>
              <button className={`alp${lg === 'ALL' ? ' on' : ''}`} onClick={() => setLg('ALL')}>All</button>
              {leagues.map(l => (
                <button key={l.id} className={`alp${lg === l.id ? ' on' : ''}`} onClick={() => setLg(l.id)}>
                  {l.emblem && <img src={l.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                  {l.name} ({l.n})
                </button>
              ))}
            </div>
          )}
          {fxLoading ? <Skel n={3} /> : vis.length > 0 ? (
            <div>
              {vis.map((m, i) => {
                const mid = String(m.id);
                const isAdding = addingId === mid;
                const isFeatured = false; 
                return (
                  <MatchRow 
                    key={mid} 
                    m={m} 
                    idx={i} 
                    mode="featured"
                    isFeatured={isFeatured}
                    isAdding={isAdding}
                    isFull={isFull}
                    onAddClick={handleAddClick}
                    onRemoveClick={handleRemoveClick}
                    isRemoving={removingId === mid}
                  />
                );
              })}
              <ShowMore count={hidden} show={showAll} onToggle={() => setShowAll(p => !p)} />
            </div>
          ) : (
            <Empty icon={CalendarDays} title="No available matches" hint="Live and finished matches cannot be featured" />
          )}
        </div>
      ) : (
        <div className="asec">
          <div className="aem" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <Pencil size={24} style={{ color: 'var(--gold)' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0, fontWeight: 600 }}>
              Featured list is full ({MAX_FEATURED}/{MAX_FEATURED}).
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
              Remove some matches below to add new ones.
            </p>
          </div>
        </div>
      )}
    </div>
  );
});

export default FeaturedTab;