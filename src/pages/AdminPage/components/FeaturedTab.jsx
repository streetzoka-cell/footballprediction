import React, { useState, useMemo, useCallback, memo } from 'react';
import { Radio, Plus, Trash2, Loader2, CalendarDays, Pencil, Star } from 'lucide-react';
import { MAX_FEATURED, SHOW_INIT, extractDate, sortByImportance, hasMatchStarted, isLive, isFin, Skel, Empty, ShowMore, MatchRow } from './common';

const formatKickoff = (kickoff) => {
  if (!kickoff) return 'VS';
  if (/^\d{2}:\d{2}$/.test(kickoff)) return kickoff;
  try {
    const d = new Date(kickoff);
    if (isNaN(d.getTime())) return 'VS';
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch { return 'VS'; }
};

const FeaturedTab = memo(function FeaturedTab({ date, preds, fixtures, onAdd, onRemove, fxLoading, toast }) {
  const [lg, setLg] = useState('ALL');
  const [showAll, setShowAll] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const isFull = preds.length >= MAX_FEATURED;

  const pids = useMemo(() => new Set(preds.map(p => String(p.matchId))), [preds]);

  const avail = useMemo(() => {
    if (!fixtures?.length) return [];
    let l = fixtures
      .filter(m => extractDate(m) === date && !hasMatchStarted(m) && !pids.has(String(m.id)))
      .sort(sortByImportance);
    if (lg !== 'ALL') l = l.filter(f => String(f.competition?.id || f.league?.id) === lg);
    return l;
  }, [fixtures, date, lg, pids]);

  const leagues = useMemo(() => {
    const map = new Map();
    (fixtures?.filter(m => extractDate(m) === date && !hasMatchStarted(m) && !pids.has(String(m.id))) || [])
      .forEach(f => {
        const c = f.competition || f.league;
        if (!c) return;
        const id = String(c.id || c.code || 'x');
        if (!map.has(id)) map.set(id, { id, name: c.name || 'Other', emblem: c.emblem || c.logo || null, n: 0 });
        map.get(id).n++;
      });
    return [...map.values()].sort((a, b) => b.n - a.n);
  }, [fixtures, date, pids]);

  const vis = useMemo(() => showAll ? avail : avail.slice(0, SHOW_INIT), [avail, showAll]);
  const hidden = Math.max(0, avail.length - SHOW_INIT);

  const handleAddClick = useCallback(async (m) => {
    if (isFull) {
      toast('Featured list is full', 'in');
      return;
    }
    const mid = String(m.id);
    setAddingId(mid);
    try {
      await onAdd(m);
    } catch (e) {
      toast('Add failed: ' + (e.friendlyMessage || e.message), 'er');
    } finally {
      setAddingId(null);
    }
  }, [isFull, onAdd, toast]);

  const handleRemoveClick = useCallback(async (p) => {
    const mid = String(p.matchId);
    setRemovingId(mid);
    try {
      await onRemove(p);
    } catch (e) {
      toast('Remove failed: ' + (e.friendlyMessage || e.message), 'er');
    } finally {
      setRemovingId(null);
    }
  }, [onRemove, toast]);

  return (
    <div className="flex-col gap-16">
      {/* Featured Matches List */}
      <div className="glass-card p-16 flex-col gap-12">
        <h3 className="text-primary font-bold flex-center gap-8 text-md">
          <Radio size={16} className="text-gold" /> Featured Matches
          <span className="text-muted text-sm font-normal">({preds.length} / {MAX_FEATURED})</span>
        </h3>

        {preds.length > 0 ? (
          <div className="flex-col gap-8">
            {preds.map((p, i) => {
              const mid = String(p.matchId);
              const isRemoving = removingId === mid;
              const sc = p.homeScore != null ? { h: p.homeScore, a: p.awayScore } : null;
              const live = isLive(p);
              const finished = isFin(p);
              const st = finished
                ? { c: 'var(--primary)', b: 'rgba(var(--primary-rgb),.08)', l: 'FT' }
                : live
                ? { c: 'var(--danger)', b: 'rgba(var(--danger-rgb),.1)', l: 'Live' }
                : { c: 'var(--text-muted)', b: 'var(--bg-elevated)', l: formatKickoff(p.kickoff) };

              return (
                <div
                  key={mid}
                  className="glass-card p-12 flex-col gap-8 anim-fade-up group hover:border-primary/20 transition-colors"
                  style={{ animationDelay: `${i * 20}ms`, borderLeft: '3px solid var(--primary)' }}
                >
                  <div className="flex-between">
                    <div className="flex-center gap-8 text-muted text-xs font-bold">
                      {p.league?.emblem && <img src={p.league.emblem} alt="" width="14" height="14" className="rounded-sm" />}
                      <span>{p.league?.name || 'Featured'}</span>
                    </div>
                    <div className="flex-center gap-4">
                      {live && <span className="zk-live-pulse-dot" />}
                      <span className="badge" style={{ color: st.c, background: st.b, border: 'none', fontWeight: 700 }}>{st.l}</span>
                    </div>
                  </div>

                  <div className="flex-center gap-8">
                    <div className="flex-center gap-8 flex-1 min-w-0 justify-end">
                      <span className="text-primary font-bold text-sm truncate text-right">
                        {p.homeTeam?.shortName || p.homeTeam?.name || 'Home'}
                      </span>
                      {(p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest) && (
                        <img src={p.homeLogo || p.homeTeam?.logo || p.homeTeam?.crest} alt="" width="24" height="24" />
                      )}
                    </div>

                    <div className={`flex-center gap-8 px-16 py-6 rounded-lg min-w-[80px] justify-center ${live ? 'bg-danger/10' : finished ? 'bg-primary/10' : 'bg-elevated'}`}>
                      {sc ? (
                        <>
                          <span className={`font-extrabold text-lg ${live ? 'text-danger' : 'text-primary'}`}>{sc.h}</span>
                          <span className="text-muted text-sm">–</span>
                          <span className={`font-extrabold text-lg ${live ? 'text-danger' : 'text-primary'}`}>{sc.a}</span>
                        </>
                      ) : (
                        <span className="text-muted text-xs font-bold tracking-widest">VS</span>
                      )}
                    </div>

                    <div className="flex-center gap-8 flex-1 min-w-0">
                      {(p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest) && (
                        <img src={p.awayLogo || p.awayTeam?.logo || p.awayTeam?.crest} alt="" width="24" height="24" />
                      )}
                      <span className="text-primary font-bold text-sm truncate">
                        {p.awayTeam?.shortName || p.awayTeam?.name || 'Away'}
                      </span>
                    </div>
                  </div>

                  <div className="flex-between mt-4 pt-8 border-t border-border">
                    <span className="badge badge-primary flex-center gap-4 text-xs">
                      <Star size={10} /> Featured
                    </span>
                    <button className="btn btn-danger btn-sm flex-center gap-6" onClick={() => handleRemoveClick(p)} disabled={isRemoving}>
                      {isRemoving ? <Loader2 size={11} className="anim-spin" /> : <Trash2 size={11} />} Remove
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

      {/* Available Matches to Add */}
      {!isFull ? (
        <div className="glass-card p-16 flex-col gap-12">
          <h3 className="text-primary font-bold flex-center gap-8 text-md">
            <Plus size={16} className="text-primary" /> Available Matches
          </h3>

          {leagues.length > 1 && (
            <div className="flex gap-8 overflow-x-auto pb-8 scrollbar-hide">
              <button className={`btn btn-sm px-16 ${lg === 'ALL' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setLg('ALL')}>
                All Leagues
              </button>
              {leagues.map(l => (
                <button key={l.id} className={`btn btn-sm px-16 flex-center gap-6 ${lg === l.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setLg(l.id)}>
                  {l.emblem && <img src={l.emblem} alt="" width="14" height="14" className="rounded-sm" />}
                  {l.name} <span className="text-muted text-xs">({l.n})</span>
                </button>
              ))}
            </div>
          )}

          {fxLoading ? (
            <Skel n={3} />
          ) : vis.length > 0 ? (
            <div className="flex-col gap-8">
              {vis.map((m, i) => {
                const mid = String(m.id);
                const isAdding = addingId === mid;
                return (
                  <MatchRow
                    key={mid} m={m} idx={i} mode="featured" isFeatured={false}
                    isAdding={isAdding} isFull={isFull} onAddClick={handleAddClick}
                    onRemoveClick={handleRemoveClick} isRemoving={removingId === mid}
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
        <div className="glass-card p-24 flex-col items-center gap-8 text-center anim-fade-up" style={{ borderColor: 'rgba(var(--gold-rgb), 0.2)' }}>
          <div className="p-16 rounded-full" style={{ background: 'rgba(var(--gold-rgb), 0.1)' }}>
            <Pencil size={32} className="text-gold" />
          </div>
          <p className="text-primary font-bold text-md">Featured List is Full</p>
          <p className="text-muted text-sm max-w-400">
            You have reached the maximum of {MAX_FEATURED} featured matches. Remove some matches above to add new ones.
          </p>
        </div>
      )}
    </div>
  );
});

export default FeaturedTab;