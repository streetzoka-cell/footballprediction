import React, { useState, useMemo, useCallback, memo } from 'react';
import { Star, Save, Send, Pencil, History, ChevronUp, ChevronDown, CheckCircle2, TrendingUp, XCircle, Loader2, Target } from 'lucide-react';
import { footballApi } from '../../../services/footballApi';
import { MAX_ZOKA, SHOW_INIT, useMounted, dateLabel, dateOffset, extractDate, sortByImportance, hasMatchStarted, isFin, getScore, Skel, Empty, ShowMore, MatchRow, RBadge } from './common';

const ZokaTab = memo(function ZokaTab({ date, fixtures, fxLoading, pubPicks, onPublish, onUnpublish, onSaveDraft, toast }) {
  const mounted = useMounted();
  const [sel, setSel] = useState({});
  const [lg, setLg] = useState('ALL');
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [flash, setFlash] = useState(false);
  const [showHist, setShowHist] = useState(false);
  const [hist, setHist] = useState([]);
  const [histLoad, setHistLoad] = useState(false);
  const [openDay, setOpenDay] = useState(null);

  const dayFx = useMemo(() => (fixtures?.filter(m => extractDate(m) === date) || []).sort(sortByImportance), [fixtures, date]);
  const pubMatches = useMemo(() => Array.isArray(pubPicks) ? pubPicks : (pubPicks?.matches || []), [pubPicks]);
  const pubMap = useMemo(() => new Map(pubMatches.map(p => [String(p.matchId), p])), [pubMatches]);
  const isFull = pubMatches.length >= MAX_ZOKA;

  const selectableFx = useMemo(() => {
    let l = dayFx.filter(m => !hasMatchStarted(m));
    if (isFull) l = l.filter(m => pubMap.has(String(m.id)));
    return l;
  }, [dayFx, isFull, pubMap]);

  const leagues = useMemo(() => {
    const map = new Map();
    selectableFx.forEach(f => {
      const c = f.competition || f.league; if (!c) return;
      const id = String(c.id || c.code || 'x');
      if (!map.has(id)) map.set(id, { id, name: c.name || 'Other', emblem: c.emblem || c.logo || null, n: 0 });
      map.get(id).n++;
    });
    return [...map.values()].sort((a, b) => b.n - a.n);
  }, [selectableFx]);

  const filtered = useMemo(() => {
    let l = selectableFx;
    if (lg !== 'ALL') l = l.filter(f => String(f.competition?.id || f.league?.id) === lg);
    return l;
  }, [selectableFx, lg]);

  const vis = useMemo(() => showAll ? filtered : filtered.slice(0, SHOW_INIT), [filtered, showAll]);
  const hidden = Math.max(0, filtered.length - SHOW_INIT);
  const ids = useMemo(() => new Set(Object.keys(sel)), [sel]);
  const cnt = ids.size;
  const scored = Object.values(sel).filter(s => s.h !== '' && s.a !== '').length;
  const ready = cnt > 0 && scored === cnt;

  const toggle = useCallback((m) => {
    if (hasMatchStarted(m)) { toast('Cannot select matches that have already started', 'in'); return; }
    const id = String(m.id);
    const isPublished = pubMap.has(id);
    setSel(prev => {
      if (prev[id]) { const n = { ...prev }; delete n[id]; return n; }
      else if (isPublished || Object.keys(prev).length < MAX_ZOKA) {
        const existing = pubMap.get(id);
        return { ...prev, [id]: existing ? { h: String(existing.adminPick?.home ?? ''), a: String(existing.adminPick?.away ?? '') } : { h: '', a: '' } };
      } else { toast(`Max ${MAX_ZOKA} Zoka Picks`, 'in'); return prev; }
    });
  }, [pubMap, toast]);

  const updScore = useCallback((mid, f, v) => {
    const c = v.replace(/[^0-9]/g, '').slice(0, 2);
    setSel(prev => ({ ...prev, [mid]: { ...(prev[mid] || {}), [f]: c } }));
  }, []);

  const buildNewPicks = useCallback(() => {
    const picks = [];
    for (const [mid, sc] of Object.entries(sel)) {
      const m = dayFx.find(x => String(x.id) === mid);
      if (!m || sc.h === '' || sc.a === '') continue;
      const s = getScore(m);
      picks.push({
        matchId: m.id,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        homeLogo: m.homeTeam?.crest || null,
        awayLogo: m.awayTeam?.crest || null,
        league: m.competition || m.league,
        kickoff: m.utcDate || m.kickoff,
        adminPick: { home: Number(sc.h), away: Number(sc.a) },
        homeScore: isFin(m) ? s.h : null,
        awayScore: isFin(m) ? s.a : null,
        status: isFin(m) ? 'finished' : 'upcoming',
      });
    }
    return picks;
  }, [sel, dayFx]);

  const mergeWithExisting = useCallback((newPicks) => {
    const existing = pubMatches;
    const merged = [...existing];
    for (const np of newPicks) {
      const idx = merged.findIndex(p => String(p.matchId) === String(np.matchId));
      if (idx >= 0) merged[idx] = np;
      else merged.push(np);
    }
    return merged;
  }, [pubMatches]);

  const handleSave = useCallback(async () => {
    if (cnt === 0) return;
    setSaving(true);
    try {
      const newPicks = buildNewPicks();
      if (!newPicks.length) { setSaving(false); return; }
      const merged = mergeWithExisting(newPicks);

      // ★ FIXED: Use new Date().toISOString() instead of serverTimestamp()
      await onSaveDraft({
        matches: merged,
        date,
        totalMatches: merged.length,
        isDraft: !ready,
        publishedAt: new Date().toISOString(),
      });

      setSel({});
      setFlash(true);
      setTimeout(() => { if (mounted.current) setFlash(false); }, 1400);
      toast(`Saved ${newPicks.length} pick${newPicks.length > 1 ? 's' : ''} (${merged.length} total)`, 'ok');
    } catch (e) {
      toast('Save failed', 'er');
    }
    setSaving(false);
  }, [cnt, buildNewPicks, mergeWithExisting, onSaveDraft, date, ready, toast, mounted]);

  const handlePublish = useCallback(async () => {
    if (!ready) return;
    setPublishing(true);
    try {
      const newPicks = buildNewPicks();
      if (!newPicks.length) { setPublishing(false); return; }
      const merged = mergeWithExisting(newPicks);

      // ★ FIXED: Use new Date().toISOString() instead of serverTimestamp()
      await onPublish({
        matches: merged,
        date,
        totalMatches: merged.length,
        isDraft: false,
        publishedAt: new Date().toISOString(),
      });

      setSel({});
      toast(`Published ${newPicks.length} pick${newPicks.length > 1 ? 's' : ''} (${merged.length} total)!`, 'ok');
    } catch (e) {
      toast('Publish failed', 'er');
    }
    setPublishing(false);
  }, [ready, buildNewPicks, mergeWithExisting, onPublish, date, toast]);

  // ★ FIXED: Load history from backend API (no Firestore reads!)
  const loadHist = useCallback(async () => {
    if (hist.length > 0 || histLoad) return;
    setHistLoad(true);
    try {
      const res = await footballApi.adminZokaGetHistory(7);
      const history = res?.data || res || [];

      if (mounted.current) {
        setHist(history.map(day => ({
          date: day.date,
          matches: day.matches || [],
          e: day.exact || 0,
          r: day.result || 0,
          mi: day.miss || 0,
          p: day.pending || 0,
          total: day.total || 0,
        })));
      }
    } catch (e) {
      console.error('[ZokaTab] History load failed:', e);
      if (mounted.current) setHist([]);
    }
    setHistLoad(false);
  }, [hist, histLoad, mounted]);

  const pubRes = useMemo(() => {
    if (!pubMatches.length) return { e: 0, r: 0, mi: 0, p: 0 };
    let e = 0, r = 0, mi = 0, p = 0;
    pubMatches.forEach(pk => {
      if (pk.status !== 'finished' || pk.homeScore == null) { p++; return; }
      const h = Number(pk.adminPick?.home);
      const a = Number(pk.adminPick?.away);
      if (h === pk.homeScore && a === pk.awayScore) { e++; return; }
      if ((h > a ? 'H' : h < a ? 'A' : 'D') === (pk.homeScore > pk.awayScore ? 'H' : pk.homeScore < pk.awayScore ? 'A' : 'D')) { r++; return; }
      mi++;
    });
    return { e, r, mi, p };
  }, [pubMatches]);

  return (
    <div className="flex-col gap-16">
      {/* Selection Header */}
      {cnt > 0 && (
        <div className="glass-card p-16 flex-between flex-wrap gap-8 anim-fade-up" style={{ background: 'rgba(var(--gold-rgb), 0.04)', borderColor: 'rgba(var(--gold-rgb), 0.2)', boxShadow: '0 4px 20px rgba(var(--gold-rgb), 0.05)' }}>
          <div className="flex-col gap-4">
            <div className="flex-center gap-8">
              <span className="text-primary font-bold text-md">{cnt} / {MAX_ZOKA} Selected</span>
              {scored === cnt && cnt > 0 && (
                <span className="badge badge-primary flex-center gap-4">
                  <CheckCircle2 size={12} /> All Scored
                </span>
              )}
            </div>
            {Object.keys(sel).some(mid => pubMap.has(mid)) && (
              <div className="text-muted text-xs flex-center gap-4">
                <Pencil size={12} /> Editing {Object.keys(sel).filter(mid => pubMap.has(mid)).length} existing published pick(s)
              </div>
            )}
          </div>
          <div className="flex gap-8">
            <button className="btn btn-secondary btn-sm flex-center gap-6" onClick={handleSave} disabled={saving || cnt === 0 || scored === 0}>
              {saving ? <Loader2 size={12} className="anim-spin" /> : <Save size={12} />} Save Draft
            </button>
            <button className="btn btn-primary btn-sm flex-center gap-6" onClick={handlePublish} disabled={publishing || !ready} title={!ready ? 'Enter scores for all picks to publish' : ''}>
              {publishing ? <Loader2 size={12} className="anim-spin" /> : <Send size={12} />} Publish
            </button>
          </div>
        </div>
      )}

      {/* Published Summary */}
      {pubMatches.length > 0 && cnt === 0 && (
        <div className="glass-card p-16 flex-between flex-wrap gap-8 anim-fade-up">
          <span className="text-muted text-sm font-bold flex-center gap-6">
            <Star size={14} className="text-gold" /> {pubMatches.length} Published Pick(s) · Tap a match below to edit
          </span>
          <div className="flex-center gap-6">
            <span className="badge badge-primary flex-center gap-4"><CheckCircle2 size={10} /> {pubRes.e} Exact</span>
            <span className="badge badge-gold flex-center gap-4"><TrendingUp size={10} /> {pubRes.r} Result</span>
            <span className="badge badge-danger flex-center gap-4"><XCircle size={10} /> {pubRes.mi} Miss</span>
            {pubRes.p > 0 && <span className="badge badge-muted">{pubRes.p} Pending</span>}
          </div>
          <button className="btn btn-danger btn-sm flex-center gap-6" onClick={onUnpublish}>
            <XCircle size={12} /> Unpublish All
          </button>
        </div>
      )}

      {/* Full State */}
      {isFull && cnt === 0 && (
        <div className="glass-card p-24 flex-col items-center gap-8 text-center anim-fade-up" style={{ borderColor: 'rgba(var(--gold-rgb), 0.2)' }}>
          <div className="p-16 rounded-full" style={{ background: 'rgba(var(--gold-rgb), 0.1)' }}>
            <Target size={32} className="text-gold" />
          </div>
          <p className="text-primary font-bold text-md">Zoka Picks Limit Reached</p>
          <p className="text-muted text-sm max-w-400">You have reached the maximum of {MAX_ZOKA} picks for this date. Unpublish or remove some existing picks to add new ones.</p>
        </div>
      )}

      {/* League Filters */}
      {leagues.length > 1 && !isFull && (
        <div className="flex gap-8 overflow-x-auto pb-8 scrollbar-hide">
          <button className={`btn btn-sm px-16 ${lg === 'ALL' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setLg('ALL')}>
            All Leagues ({selectableFx.length})
          </button>
          {leagues.map(l => (
            <button key={l.id} className={`btn btn-sm px-16 flex-center gap-6 ${lg === l.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setLg(l.id)}>
              {l.emblem && <img src={l.emblem} alt="" width="14" height="14" className="rounded-sm" />}
              {l.name} <span className="text-muted text-xs">({l.n})</span>
            </button>
          ))}
        </div>
      )}

      {/* Match List */}
      {fxLoading ? <Skel n={4} /> : vis.length > 0 ? (
        <div className={`flex-col gap-8 ${flash ? 'anim-goal-flash' : ''}`}>
          {vis.map((m, i) => {
            const mid = String(m.id);
            const isPublished = pubMap.has(mid);
            return (
              <div key={mid} className="relative group">
                <MatchRow
                  m={m} idx={i} mode="zoka" sel={sel[mid]} onToggleSel={toggle}
                  scoreInput={sel[mid]} onScoreInput={updScore}
                  pubPick={isPublished ? pubMap.get(mid) : null}
                  extraBadge={isPublished && !sel[mid] ? (<span className="badge badge-gold flex-center gap-4"><Star size={9} /> Published</span>) : null}
                />
                {isPublished && !sel[mid] && (
                  <button
                    className="absolute -bottom-4 left-16 btn btn-ghost btn-xs flex-center gap-4 text-muted hover:text-primary bg-card border border-border shadow-sm opacity-0 group-hover:opacity-100 transition-all duration-200"
                    onClick={() => toggle(m)}
                  >
                    <Pencil size={10} /> Edit Pick: {pubMap.get(mid).adminPick?.home} - {pubMap.get(mid).adminPick?.away}
                  </button>
                )}
              </div>
            );
          })}
          <ShowMore count={hidden} show={showAll} onToggle={() => setShowAll(p => !p)} />
        </div>
      ) : (
        <Empty
          icon={Star}
          title={isFull ? 'No published matches to edit' : (dayFx.length === 0 ? 'No fixtures for this date' : 'No upcoming matches available')}
          hint={isFull ? 'Unpublish some to add new ones' : (dayFx.length === 0 ? 'Try a different date' : 'Matches that have already started cannot be selected')}
        />
      )}

      {/* History Accordion */}
      <div className="glass-card p-16 flex-col gap-12 mt-8">
        <button className="flex-between w-full text-left group" onClick={() => { setShowHist(p => !p); if (!showHist) loadHist(); }}>
          <h3 className="text-primary font-bold flex-center gap-8 text-md group-hover:text-gold transition-colors">
            <History size={16} /> Zoka Picks History
          </h3>
          {showHist ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
        </button>

        {showHist && (
          <div className="mt-8 flex-col gap-8 anim-fade-up">
            {histLoad ? <Skel n={2} /> : hist.length > 0 ? hist.map(day => {
              const isOpen = openDay === day.date;
              const res = day.total - day.p;
              const acc = res > 0 ? Math.round(((day.e + day.r) / res) * 100) : 0;
              return (
                <div key={day.date} className="glass-card p-12 cursor-pointer hover:border-primary/20 transition-colors" onClick={() => setOpenDay(isOpen ? null : day.date)}>
                  <div className="flex-between">
                    <div>
                      <div className="text-primary font-bold text-sm">{dateLabel(day.date)}</div>
                      <div className="text-muted text-xs mt-2 flex-center gap-6">
                        <span>{day.total} picks</span>
                        <span className="w-1 h-1 rounded-full bg-muted" />
                        <span className={acc >= 70 ? 'text-primary font-bold' : 'text-muted'}>{acc}% Accuracy</span>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <span className="badge badge-primary text-xs">{day.e} Exact</span>
                      <span className="badge badge-gold text-xs">{day.r} Result</span>
                      <span className="badge badge-danger text-xs">{day.mi} Miss</span>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-12 pt-12 border-t border-border flex-col gap-4 anim-fade-up">
                      {day.matches.map((pk, i) => (
                        <div key={i} className="flex-between py-8 px-8 rounded-lg hover:bg-elevated transition-colors text-sm gap-8">
                          <div className="flex-1 min-w-0 flex-center gap-8">
                            {pk.homeLogo && <img src={pk.homeLogo} alt="" width="16" height="16" />}
                            <span className="text-primary font-bold truncate">{pk.homeTeam?.shortName || pk.homeTeam?.name || '?'}</span>
                            <span className="text-muted text-xs">vs</span>
                            <span className="text-primary font-bold truncate">{pk.awayTeam?.shortName || pk.awayTeam?.name || '?'}</span>
                            {pk.awayLogo && <img src={pk.awayLogo} alt="" width="16" height="16" />}
                          </div>
                          <div className="flex-center gap-8 flex-shrink-0">
                            <span className="font-extrabold text-gold text-xs">{pk.adminPick?.home} - {pk.adminPick?.away}</span>
                            {pk.status === 'finished' && pk.homeScore != null && (
                              <>
                                <span className="text-muted">→</span>
                                <span className="font-extrabold text-primary text-xs">{pk.homeScore} - {pk.awayScore}</span>
                              </>
                            )}
                            <RBadge pick={pk} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }) : <p className="text-muted text-sm text-center p-16">No previous Zoka Picks found for the last 7 days.</p>}
          </div>
        )}
      </div>
    </div>
  );
});

export default ZokaTab;