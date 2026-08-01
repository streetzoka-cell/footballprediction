import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Star, Save, Send, Pencil, History, ChevronUp, ChevronDown, CheckCircle2, TrendingUp, XCircle, Loader2 } from 'lucide-react';
import { db } from '../../../utils/firebase';
import { doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { PATHS } from '../../../utils/constants';
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
      picks.push({ matchId: m.id, homeTeam: m.homeTeam, awayTeam: m.awayTeam, homeLogo: m.homeTeam?.crest || null, awayLogo: m.awayTeam?.crest || null, league: m.competition || m.league, kickoff: m.utcDate || m.kickoff, adminPick: { home: Number(sc.h), away: Number(sc.a) }, homeScore: isFin(m) ? s.h : null, awayScore: isFin(m) ? s.a : null, status: isFin(m) ? 'finished' : 'upcoming' });
    }
    return picks;
  }, [sel, dayFx]);

  const mergeWithExisting = useCallback((newPicks) => {
    const existing = pubMatches; const merged = [...existing];
    for (const np of newPicks) {
      const idx = merged.findIndex(p => String(p.matchId) === String(np.matchId));
      if (idx >= 0) merged[idx] = np; else merged.push(np);
    }
    return merged;
  }, [pubMatches]);

  const handleSave = useCallback(async () => {
    if (!db || cnt === 0) return; setSaving(true);
    try {
      const newPicks = buildNewPicks();
      if (!newPicks.length) { setSaving(false); return; }
      const merged = mergeWithExisting(newPicks);
      await onSaveDraft({ matches: merged, date, totalMatches: merged.length, isDraft: !ready, publishedAt: serverTimestamp() });
      setSel({}); setFlash(true);
      setTimeout(() => { if (mounted.current) setFlash(false); }, 1400);
      toast(`Saved ${newPicks.length} pick${newPicks.length > 1 ? 's' : ''} (${merged.length} total)`, 'ok');
    } catch (e) { toast('Save failed', 'er'); }
    setSaving(false);
  }, [cnt, buildNewPicks, mergeWithExisting, onSaveDraft, date, ready, toast, mounted]);

  const handlePublish = useCallback(async () => {
    if (!db || !ready) return; setPublishing(true);
    try {
      const newPicks = buildNewPicks();
      if (!newPicks.length) { setPublishing(false); return; }
      const merged = mergeWithExisting(newPicks);
      await onPublish({ matches: merged, date, totalMatches: merged.length, isDraft: false, publishedAt: serverTimestamp() });
      setSel({});
      toast(`Published ${newPicks.length} pick${newPicks.length > 1 ? 's' : ''} (${merged.length} total)!`, 'ok');
    } catch (e) { toast('Publish failed', 'er'); }
    setPublishing(false);
  }, [db, ready, buildNewPicks, mergeWithExisting, onPublish, date, toast]);

  const loadHist = useCallback(async () => {
    if (hist.length > 0 || histLoad) return; setHistLoad(true);
    try {
      const days = [];
      for (let i = 1; i <= 7; i++) {
        const d = dateOffset(-i);
        try {
          const docSnap = await getDoc(doc(db, PATHS.ZOKA_PICKS, d));
          const data = docSnap.exists() ? docSnap.data() : null;
          if (data && data.matches) {
            const matches = data.matches || [];
            let e = 0, r = 0, mi = 0, p = 0;
            matches.forEach(pk => {
              if (pk.status !== 'finished' || pk.homeScore == null) { p++; return; }
              const h = pk.adminPick?.home, a = pk.adminPick?.away;
              if (h === pk.homeScore && a === pk.awayScore) { e++; return; }
              if ((h > a ? 'H' : h < a ? 'A' : 'D') === (pk.homeScore > pk.awayScore ? 'H' : pk.homeScore < pk.awayScore ? 'A' : 'D')) { r++; return; }
              mi++;
            });
            days.push({ date: d, matches, e, r, mi, p, total: matches.length });
          }
        } catch {}
      }
      if (mounted.current) setHist(days);
    } catch (e) {}
    setHistLoad(false);
  }, [hist, histLoad, mounted]);

  const pubRes = useMemo(() => {
    if (!pubMatches.length) return { e: 0, r: 0, mi: 0, p: 0 };
    let e = 0, r = 0, mi = 0, p = 0;
    pubMatches.forEach(pk => {
      if (pk.status !== 'finished' || pk.homeScore == null) { p++; return; }
      const h = pk.adminPick?.home, a = pk.adminPick?.away;
      if (h === pk.homeScore && a === pk.awayScore) { e++; return; }
      if ((h > a ? 'H' : h < a ? 'A' : 'D') === (pk.homeScore > pk.awayScore ? 'H' : pk.homeScore < pk.awayScore ? 'A' : 'D')) { r++; return; }
      mi++;
    });
    return { e, r, mi, p };
  }, [pubMatches]);

  return (
    <div className="flex-col gap-16">
      {cnt > 0 && (
        <div className="glass-card p-16 flex-between flex-wrap gap-8" style={{ background: 'rgba(var(--gold-rgb),.03)', borderColor: 'rgba(var(--gold-rgb),.15)' }}>
          <div className="flex-col">
            <span className="text-muted text-sm font-bold">{cnt}/{MAX_ZOKA} selected {scored === cnt && cnt > 0 && <span className="text-primary ml-4">✓ All scored</span>}</span>
            {Object.keys(sel).some(mid => pubMap.has(mid)) && <div className="text-muted text-xs flex-center gap-4 mt-2"><Pencil size={9} /> Editing {Object.keys(sel).filter(mid => pubMap.has(mid)).length} existing</div>}
          </div>
          <div className="flex gap-8">
            <button className="btn btn-secondary btn-sm" onClick={handleSave} disabled={saving || cnt === 0 || scored === 0}>{saving ? <Loader2 size={12} className="anim-spin" /> : <Save size={12} />} Save</button>
            <button className="btn btn-primary btn-sm" onClick={handlePublish} disabled={publishing || !ready} title={!ready ? 'Enter scores for all picks to publish' : ''}>{publishing ? <Loader2 size={12} className="anim-spin" /> : <Send size={12} />} Publish</button>
          </div>
        </div>
      )}

      {pubMatches.length > 0 && cnt === 0 && (
        <div className="glass-card p-16 flex-between flex-wrap gap-8">
          <span className="text-muted text-sm font-bold">{pubMatches.length} published · Tap a match to edit</span>
          <div className="flex-center gap-4">
            <span className="badge badge-primary"><CheckCircle2 size={9} /> {pubRes.e}</span>
            <span className="badge badge-gold"><TrendingUp size={9} /> {pubRes.r}</span>
            <span className="badge badge-danger"><XCircle size={9} /> {pubRes.mi}</span>
            {pubRes.p > 0 && <span className="badge badge-muted">{pubRes.p}</span>}
          </div>
          <button className="btn btn-danger btn-sm" onClick={onUnpublish}><XCircle size={11} /> Unpublish All</button>
        </div>
      )}

      {isFull && (
        <div className="glass-card p-16 flex-col items-center gap-8 text-center">
          <Pencil size={24} className="text-gold" />
          <p className="text-muted text-sm">Zoka Picks list is full ({MAX_ZOKA}/{MAX_ZOKA}).</p>
          <p className="text-muted text-xs">You can only edit existing picks below. Remove some to add new ones.</p>
        </div>
      )}

      {leagues.length > 1 && !isFull && (
        <div className="flex gap-8 overflow-x-auto pb-8">
          <button className={`btn btn-sm ${lg === 'ALL' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setLg('ALL')}>All ({selectableFx.length})</button>
          {leagues.map(l => (
            <button key={l.id} className={`btn btn-sm ${lg === l.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setLg(l.id)}>
              {l.emblem && <img src={l.emblem} alt="" width="14" height="14" />} {l.name} ({l.n})
            </button>
          ))}
        </div>
      )}

      {fxLoading ? <Skel n={4} /> : vis.length > 0 ? (
        <div className={flash ? 'anim-goal-flash' : ''}>
          {vis.map((m, i) => {
            const mid = String(m.id);
            const isPublished = pubMap.has(mid);
            return (
              <div key={mid}>
                <MatchRow m={m} idx={i} mode="zoka" sel={sel[mid]} onToggleSel={toggle} scoreInput={sel[mid]} onScoreInput={updScore} pubPick={isPublished ? pubMap.get(mid) : null} extraBadge={isPublished && !sel[mid] ? (<span className="badge badge-gold"><Star size={9} /> Published</span>) : null} />
                {isPublished && !sel[mid] && (
                  <div className="text-muted text-xs flex-center gap-4 cursor-pointer -mt-4 mb-8 ml-16" onClick={() => toggle(m)}>
                    <Pencil size={9} /> Tap to edit published pick: {pubMap.get(mid).adminPick?.home}-{pubMap.get(mid).adminPick?.away}
                  </div>
                )}
              </div>
            );
          })}
          <ShowMore count={hidden} show={showAll} onToggle={() => setShowAll(p => !p)} />
        </div>
      ) : (
        <Empty icon={Star} title={isFull ? 'No published matches to edit' : (dayFx.length === 0 ? 'No fixtures for this date' : 'No upcoming matches available')} hint={isFull ? 'Unpublish some to add new ones' : (dayFx.length === 0 ? 'Try a different day' : 'Matches that have started cannot be selected')} />
      )}

      <div className="glass-card p-16 flex-col gap-12 mt-16">
        <div className="flex-between cursor-pointer" onClick={() => { setShowHist(p => !p); if (!showHist) loadHist(); }}>
          <h3 className="text-primary font-bold flex-center gap-8"><History size={15} /> Zoka Picks History</h3>
          {showHist ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
        </div>
        {showHist && (
          <div className="mt-8 flex-col gap-8">
            {histLoad ? <Skel n={2} /> : hist.length > 0 ? hist.map(day => {
              const isOpen = openDay === day.date;
              const res = day.total - day.p;
              const acc = res > 0 ? Math.round(((day.e + day.r) / res) * 100) : 0;
              return (
                <div key={day.date} className="glass-card p-12 cursor-pointer" onClick={() => setOpenDay(isOpen ? null : day.date)}>
                  <div className="flex-between">
                    <div>
                      <div className="text-primary font-bold text-sm">{dateLabel(day.date)}</div>
                      <div className="text-muted text-xs mt-2">{day.total} picks · {acc}% accuracy</div>
                    </div>
                    <div className="flex gap-4">
                      <span className="badge badge-primary">{day.e}E</span>
                      <span className="badge badge-gold">{day.r}R</span>
                      <span className="badge badge-danger">{day.mi}M</span>
                    </div>
                  </div>
                  {isOpen && day.matches.map((pk, i) => (
                    <div key={i} className="flex-between py-8 mt-8 border-t border-border text-sm gap-8">
                      <div className="flex-1 min-w-0">
                        <span className="text-primary font-bold">{pk.homeTeam?.shortName || pk.homeTeam?.name || '?'}</span>
                        <span className="text-muted mx-4">vs</span>
                        <span className="text-primary font-bold">{pk.awayTeam?.shortName || pk.awayTeam?.name || '?'}</span>
                      </div>
                      <div className="flex-center gap-8">
                        <span className="font-extrabold text-gold">{pk.adminPick?.home}-{pk.adminPick?.away}</span>
                        {pk.status === 'finished' && pk.homeScore != null && <><span className="text-muted">→</span><span className="font-extrabold text-primary">{pk.homeScore}-{pk.awayScore}</span></>}
                        <RBadge pick={pk} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            }) : <p className="text-muted text-sm text-center p-16">No previous Zoka Picks found</p>}
          </div>
        )}
      </div>
    </div>
  );
});

export default ZokaTab;