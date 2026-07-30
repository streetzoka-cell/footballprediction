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
  
  // ★ FIX: Check if the total published picks have reached the max limit
  const isFull = pubMatches.length >= MAX_ZOKA;

  const selectableFx = useMemo(() => {
    let l = dayFx.filter(m => !hasMatchStarted(m));
    // ★ FIX: If full, only show matches that are ALREADY published (so they can be edited)
    if (isFull) {
      l = l.filter(m => pubMap.has(String(m.id)));
    }
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
  const full = cnt >= MAX_ZOKA;
  const scored = Object.values(sel).filter(s => s.h !== '' && s.a !== '').length;
  const ready = cnt > 0 && scored === cnt;

  // ★ FIX: Allow selecting published matches for editing even if the selection box is full
  const toggle = useCallback((m) => {
    if (hasMatchStarted(m)) { toast('Cannot select matches that have already started', 'in'); return; }
    const id = String(m.id);
    const isPublished = pubMap.has(id);
    
    setSel(prev => {
      if (prev[id]) {
        const n = { ...prev }; delete n[id]; return n;
      } else if (isPublished || Object.keys(prev).length < MAX_ZOKA) {
        const existing = pubMap.get(id);
        return { ...prev, [id]: existing ? { h: String(existing.adminPick?.home ?? ''), a: String(existing.adminPick?.away ?? '') } : { h: '', a: '' } };
      } else {
        toast(`Max ${MAX_ZOKA} Zoka Picks`, 'in');
        return prev;
      }
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
        matchId: m.id, homeTeam: m.homeTeam, awayTeam: m.awayTeam,
        homeLogo: m.homeTeam?.crest || null, awayLogo: m.awayTeam?.crest || null,
        league: m.competition || m.league, kickoff: m.utcDate || m.kickoff,
        adminPick: { home: Number(sc.h), away: Number(sc.a) },
        homeScore: isFin(m) ? s.h : null, awayScore: isFin(m) ? s.a : null,
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
    if (!db || cnt === 0) return;
    setSaving(true);
    try {
      const newPicks = buildNewPicks();
      if (!newPicks.length) { setSaving(false); return; }
      const merged = mergeWithExisting(newPicks);
      await onSaveDraft({ matches: merged, date, totalMatches: merged.length, isDraft: !ready, publishedAt: serverTimestamp() });
      setSel({});
      setFlash(true);
      setTimeout(() => { if (mounted.current) setFlash(false); }, 1400);
      toast(`Saved ${newPicks.length} pick${newPicks.length > 1 ? 's' : ''} (${merged.length} total)`, 'ok');
    } catch (e) { console.error('[Zoka] Save err:', e); toast('Save failed', 'er'); }
    setSaving(false);
  }, [cnt, buildNewPicks, mergeWithExisting, onSaveDraft, date, ready, toast, mounted]);

  const handlePublish = useCallback(async () => {
    if (!db || !ready) return;
    setPublishing(true);
    try {
      const newPicks = buildNewPicks();
      if (!newPicks.length) { setPublishing(false); return; }
      const merged = mergeWithExisting(newPicks);
      await onPublish({ matches: merged, date, totalMatches: merged.length, isDraft: false, publishedAt: serverTimestamp() });
      setSel({});
      toast(`Published ${newPicks.length} pick${newPicks.length > 1 ? 's' : ''} (${merged.length} total)!`, 'ok');
    } catch (e) { console.error('[Zoka] Pub err:', e); toast('Publish failed', 'er'); }
    setPublishing(false);
  }, [db, ready, buildNewPicks, mergeWithExisting, onPublish, date, toast]);

  const loadHist = useCallback(async () => {
    if (hist.length > 0 || histLoad) return;
    setHistLoad(true);
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
        } catch { /* skip */ }
      }
      if (mounted.current) setHist(days);
    } catch (e) { console.error('[Zoka] Hist err:', e); }
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
    <div className="ae">
      {cnt > 0 && (
        <div className="asec pop" style={{ background: 'rgba(245,197,66,.03)', borderColor: 'rgba(245,197,66,.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                {cnt}/{MAX_ZOKA} selected
                {scored === cnt && cnt > 0 && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>✓ All scored</span>}
              </span>
              {Object.keys(sel).some(mid => pubMap.has(mid)) && (
                <div className="aedit-hint"><Pencil size={9} /> Editing {Object.keys(sel).filter(mid => pubMap.has(mid)).length} existing</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              <button className="ab ab-gh ab-sm" onClick={handleSave} disabled={saving || cnt === 0 || scored === 0}>
                <Save size={12} /> Save
              </button>
              <button className="ab ab-gd ab-sm" onClick={handlePublish} disabled={publishing || !ready} title={!ready ? 'Enter scores for all picks to publish' : ''}>
                <Send size={12} /> Publish
              </button>
            </div>
          </div>
        </div>
      )}

      {pubMatches.length > 0 && cnt === 0 && (
        <div className="azs pop" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 6 }}>
            <span style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>{pubMatches.length} published · Tap a match to edit</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <span className="abdg ex"><CheckCircle2 size={9} /> {pubRes.e}</span>
              <span className="abdg rs"><TrendingUp size={9} /> {pubRes.r}</span>
              <span className="abdg ms"><XCircle size={9} /> {pubRes.mi}</span>
              {pubRes.p > 0 && <span className="abdg pn">{pubRes.p}</span>}
            </div>
            <button className="ab ab-dg ab-sm" onClick={onUnpublish} style={{ marginLeft: 'auto' }}><XCircle size={11} /> Unpublish All</button>
          </div>
        </div>
      )}

      {/* ★ FIX: Show "Full" message if max picks reached */}
      {isFull && (
        <div className="asec">
          <div className="aem" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <Pencil size={24} style={{ color: 'var(--gold)' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0, fontWeight: 600 }}>
              Zoka Picks list is full ({MAX_ZOKA}/{MAX_ZOKA}).
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0, textAlign: 'center' }}>
              You can only edit existing picks below. Remove some to add new ones.
            </p>
          </div>
        </div>
      )}

      {leagues.length > 1 && !isFull && (
        <div className="alb" style={{ marginTop: 10 }}>
          <button className={`alp${lg === 'ALL' ? ' on' : ''}`} onClick={() => setLg('ALL')}>All ({selectableFx.length})</button>
          {leagues.map(l => (
            <button key={l.id} className={`alp${lg === l.id ? ' on' : ''}`} onClick={() => setLg(l.id)}>
              {l.emblem && <img src={l.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
              {l.name} ({l.n})
            </button>
          ))}
        </div>
      )}

      {fxLoading ? <Skel n={4} /> : vis.length > 0 ? (
        <div className={flash ? 'save-flash' : ''}>
          {vis.map((m, i) => {
            const mid = String(m.id);
            const isPublished = pubMap.has(mid);
            return (
              <div key={mid}>
                <MatchRow m={m} idx={i} mode="zoka" sel={sel[mid]} onToggleSel={toggle}
                  scoreInput={sel[mid]} onScoreInput={updScore} pubPick={isPublished ? pubMap.get(mid) : null}
                  extraBadge={isPublished && !sel[mid] ? (<span className="abdg gd"><Star size={9} /> Published</span>) : null}
                />
                {isPublished && !sel[mid] && (
                  <div className="aedit-hint" style={{ margin: '-4px 16px 8px', cursor: 'pointer' }} onClick={() => toggle(m)}>
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

      <div className="asec" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => { setShowHist(p => !p); if (!showHist) loadHist(); }}>
          <h3 className="ast" style={{ margin: 0 }}><History size={15} /> Zoka Picks History</h3>
          {showHist ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
        </div>
        {showHist && (
          <div style={{ marginTop: 10 }}>
            {histLoad ? <Skel n={2} /> : hist.length > 0 ? hist.map(day => {
              const isOpen = openDay === day.date;
              const res = day.total - day.p;
              const acc = res > 0 ? Math.round(((day.e + day.r) / res) * 100) : 0;
              return (
                <div key={day.date} className={`ahc${isOpen ? ' op' : ''}`} onClick={() => setOpenDay(isOpen ? null : day.date)}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '.82rem', fontWeight: 800, color: 'var(--text-primary)' }}>{dateLabel(day.date)}</div>
                      <div style={{ fontSize: '.67rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 1 }}>{day.total} picks · {acc}% accuracy</div>
                    </div>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <span className="abdg ex" style={{ fontSize: '.6rem' }}>{day.e}E</span>
                      <span className="abdg rs" style={{ fontSize: '.6rem' }}>{day.r}R</span>
                      <span className="abdg ms" style={{ fontSize: '.6rem' }}>{day.mi}M</span>
                    </div>
                  </div>
                  {isOpen && day.matches.map((pk, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid var(--border)', marginTop: 6, fontSize: '.75rem', gap: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{pk.homeTeam?.shortName || pk.homeTeam?.name || '?'}</span>
                        <span style={{ color: 'var(--text-muted)', margin: '0 5px' }}>vs</span>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{pk.awayTeam?.shortName || pk.awayTeam?.name || '?'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--gold)', fontSize: '.82rem' }}>{pk.adminPick?.home}-{pk.adminPick?.away}</span>
                        {pk.status === 'finished' && pk.homeScore != null && <><span style={{ color: 'var(--text-muted)' }}>→</span><span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text-primary)', fontSize: '.82rem' }}>{pk.homeScore}-{pk.awayScore}</span></>}
                        <RBadge pick={pk} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            }) : <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: 14, fontWeight: 600 }}>No previous Zoka Picks found</p>}
          </div>
        )}
      </div>
    </div>
  );
});

export default ZokaTab;