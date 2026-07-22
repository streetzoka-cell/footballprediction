// src/pages/MasterGames.jsx
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Search, X, Star, Clock, Trophy, Users,
  Zap, Bell, BellOff, RefreshCw, Calendar, 
  Heart, Share2, Globe, MapPin
} from 'lucide-react';
import { useFootballData } from '../context/FootballDataContext';
import { getLocalDateStr, getLocalDateFromUtc, formatDateShort, relativeDateLabel } from '../utils/dates';
import SEO from '../components/SEO';

const TOP_5_CODES = ['PL', 'PD', 'SA', 'BL1', 'FL1'];

const COMP_NAMES_SEO = {
  PL: "Premier League", PD: "La Liga", SA: "Serie A", BL1: "Bundesliga", FL1: "Ligue 1",
  CL: "Champions League", EC: "European Championship", WC: "World Cup"
};

// ─── Helper Components ───────────────────────────────────────────────

function FormDots({ formStr }) {
  if (!formStr) return <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>-</span>;
  const forms = formStr.split('').slice(-5);
  return (
    <div className="mg8-form-cell">
      {forms.map((f, i) => (
        <span key={i} className={`mg8-form-dot ${f === 'W' ? 'fw' : f === 'L' ? 'fl' : 'fd'}`} />
      ))}
    </div>
  );
}

function TeamModal({ team, onClose }) {
  if (!team) return null;
  return (
    <div className="mg8-modal-overlay" onClick={onClose}>
      <div className="mg8-modal" onClick={e => e.stopPropagation()}>
        <button className="mg8-modal-close" onClick={onClose}><X size={18} /></button>
        {team.crest && <img src={team.crest} alt={team.name} className="mg8-modal-img" onError={e => { e.target.style.display = 'none'; }} />}
        <div className="mg8-modal-name">{team.name}</div>
        {team.tla && <div className="mg8-modal-tla">{team.tla} · Founded {team.founded || 'N/A'}</div>}
        
        <div className="mg8-modal-row">
          <span className="mg8-modal-label"><MapPin size={14} /> Venue</span>
          <span className="mg8-modal-val">{team.venue || 'N/A'}</span>
        </div>
        {team.website && (
          <div className="mg8-modal-row">
            <span className="mg8-modal-label"><Globe size={14} /> Website</span>
            <a href={team.website} target="_blank" rel="noreferrer" className="mg8-modal-val" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Visit Official Site</a>
          </div>
        )}
        {team.coach && (
          <div className="mg8-modal-row">
            <span className="mg8-modal-label"><Users size={14} /> Coach</span>
            <span className="mg8-modal-val">{team.coach.name || 'N/A'}</span>
          </div>
        )}

        {team.squad && team.squad.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="mg8-exp-section">Squad & Staff ({team.squad.length})</div>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {team.squad.map(p => (
                <div key={p.id} className="mg8-modal-row" style={{ borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                  <span className="mg8-exp-label" style={{ color: 'var(--text-muted)', fontSize: '.7rem' }}>{p.position || 'Staff'}</span>
                  <span className="mg8-exp-val" style={{ color: 'var(--text-primary)', fontSize: '.75rem' }}>{p.name}</span>
                  <span className="mg8-exp-label" style={{ marginLeft: 8, fontSize: '.6rem' }}>{p.nationality || ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreBreakdown({ match }) {
  const s = match.score || {};
  const periods = [
    { l: 'Half Time', h: s.halfTime?.home, a: s.halfTime?.away },
    { l: 'Full Time', h: s.fullTime?.home, a: s.fullTime?.away },
    { l: 'Extra Time', h: s.extraTime?.home, a: s.extraTime?.away },
    { l: 'Penalties', h: s.penalties?.home, a: s.penalties?.away },
  ];
  const goals = s.goals || [], cards = s.cards || [];
  const hasData = periods.some(p => p.h != null || p.a != null) || goals.length || cards.length;
  
  if (!hasData) return <div style={{ padding: 14, textAlign: 'center', color: 'var(--text-muted)', fontSize: '.7rem', opacity: .5 }}>Details appear once the match begins</div>;
  
  return (
    <div style={{ padding: '6px 0 2px' }}>
      {periods.some(p => p.h != null || p.a != null) && (
        <>
          <div className="mg8-exp-section">Score Breakdown</div>
          {periods.filter(p => p.h != null || p.a != null).map(p => (
            <div key={p.l} className="mg8-exp-row">
              <span className="mg8-exp-label">{p.l}</span>
              <span className="mg8-exp-val">{p.h ?? '-'} – {p.a ?? '-'}</span>
            </div>
          ))}
        </>
      )}
      {goals.length > 0 && (
        <>
          <div className="mg8-exp-section">Goals ({goals.length})</div>
          {goals.map((g, i) => (
            <div key={i} className="mg8-exp-row">
              <span className="mg8-exp-label">{g.minute != null ? g.minute + "'" : ''}</span>
              <span className="mg8-exp-val">⚽ {g.scorer?.name || 'Unknown'}</span>
            </div>
          ))}
        </>
      )}
      {cards.length > 0 && (
        <>
          <div className="mg8-exp-section">Cards ({cards.length})</div>
          {cards.map((c, i) => (
            <div key={i} className="mg8-exp-row">
              <span className="mg8-exp-label">{c.minute != null ? c.minute + "'" : ''}</span>
              <span className="mg8-exp-val">
                {c.type === 'YELLOW_CARD' ? '🟨' : c.type === 'RED_CARD' ? '🟥' : '⚠️'} {c.player?.name || 'Unknown'}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function MatchCard({ m, idx, expanded, onToggle, isFav, onFav, isNotif, onNotif }) {
  const isLive = m.status === 'IN_PLAY' || m.status === 'PAUSED';
  const isFt = m.status === 'FINISHED';
  const isSched = m.status === 'SCHEDULED' || m.status === 'TIMED';
  const sh = m.score?.fullTime;
  const time = m.utcDate ? new Date(m.utcDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const isExp = expanded === m.id;

  let cls = 'mg8-card';
  if (isLive) cls += ' live';
  else if (isFt) cls += ' finished';
  else if (isSched) cls += ' scheduled';
  if (isExp) cls += ' expanded';

  const barColor = isLive ? '#ef4444' : isFt ? 'var(--accent,#10b981)' : 'transparent';

  return (
    <div>
      <div className={cls} style={{ animationDelay: idx * 10 + 'ms', paddingLeft: (isLive || isFt) ? 16 : 14 }} onClick={() => onToggle(isExp ? null : m.id)}>
        {(isLive || isFt) && <div className="mg8-left-bar" style={{ background: barColor }} />}
        <div className="mg8-card-top">
          <div>
            {isLive && <span className="mg8-status live-s"><span className="mg8-dot" /> LIVE</span>}
            {isFt && <span className="mg8-status ft-s">FT</span>}
            {!isLive && !isFt && <span className="mg8-status time-s">{time}</span>}
          </div>
          <div className="mg8-card-actions" onClick={e => e.stopPropagation()}>
            <button className={`mg8-icon-btn fav ${isFav ? 'active' : ''}`} onClick={() => onFav(m.id)} title="Favourite" aria-label="Toggle favourite">
              <Star size={14} fill={isFav ? '#f59e0b' : 'none'} />
            </button>
            <button className={`mg8-icon-btn notif ${isNotif ? 'active' : ''}`} onClick={() => onNotif(m.id)} title="Notifications" aria-label="Toggle notifications">
              {isNotif ? <Bell size={14} /> : <BellOff size={14} />}
            </button>
          </div>
        </div>
        <div className="mg8-teams">
          <div className="mg8-team-col home">
            <div className="mg8-team-row">
              {m.homeTeam?.crest && <img className="mg8-crest" src={m.homeTeam.crest} alt="" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}
              <span className="mg8-team-name">{m.homeTeam?.shortName || m.homeTeam?.name || 'TBD'}</span>
            </div>
          </div>
          <div className="mg8-score-box">
            {(isLive || isFt) ? (
              <div className="mg8-scores">
                <span className={`mg8-score-num ${isLive ? 'live-score' : ''} ${isFt ? 'ft-score' : ''}`} key={`h-${m.id}-${sh?.home}`}>{sh?.home ?? 0}</span>
                <span className="mg8-sep">–</span>
                <span className={`mg8-score-num ${isLive ? 'live-score' : ''} ${isFt ? 'ft-score' : ''}`} key={`a-${m.id}-${sh?.away}`}>{sh?.away ?? 0}</span>
              </div>
            ) : <span className="mg8-vs">VS</span>}
          </div>
          <div className="mg8-team-col away">
            <div className="mg8-team-row">
              {m.awayTeam?.crest && <img className="mg8-crest" src={m.awayTeam.crest} alt="" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}
              <span className="mg8-team-name">{m.awayTeam?.shortName || m.awayTeam?.name || 'TBD'}</span>
            </div>
          </div>
        </div>
        <div className="mg8-comp-row">
          {m.competition?.emblem && <img src={m.competition.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{m.competition?.name || ''}</span>
        </div>
      </div>
      {isExp && <div className="mg8-expanded"><ScoreBreakdown match={m} /></div>}
    </div>
  );
}

function StandingsTable({ standings }) {
  if (!standings?.length) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      {standings.map((g, gi) => {
        const t = g.table || []; 
        if (!t.length) return null; 
        const total = t.length; 
        const hasZ = total >= 10;
        return (
          <div key={gi}>
            {g.group && <div style={{ padding: '8px 12px 4px', fontSize: '.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{g.group}</div>}
            {hasZ && (
              <div className="mg8-zone-bar">
                <div className="mg8-zone-item" style={{ background: 'rgba(59,130,246,.1)', color: '#3b82f6' }}>UCL</div>
                <div className="mg8-zone-item" style={{ background: 'rgba(249,115,22,.08)', color: '#f97316' }}>UEL</div>
                <div className="mg8-zone-item" style={{ background: 'rgba(34,197,94,.06)', color: '#22c55e' }}>UECL</div>
                <div className="mg8-zone-item" style={{ background: 'rgba(239,68,68,.06)', color: '#ef4444' }}>REL</div>
              </div>
            )}
            <div className="mg8-tbl-wrap">
              <table className="mg8-tbl">
                <thead>
                  <tr>
                    <th className="c">#</th><th>Team</th><th className="c">P</th><th className="c">W</th>
                    <th className="c">D</th><th className="c">L</th><th className="c">GD</th>
                    <th className="c">Form</th><th className="pts">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {t.map(r => { 
                    const gd = (r.goalsFor || 0) - (r.goalsAgainst || 0); 
                    return (
                      <tr key={r.position} className={hasZ ? zoneCls(r.position, total) : ''}>
                        <td className="pos">{r.position}</td>
                        <td>
                          <div className="team-cell">
                            {r.team?.crest && <img src={r.team.crest} alt="" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}
                            <span>{r.team?.shortName || r.team?.name || '–'}</span>
                          </div>
                        </td>
                        <td className="num-cell">{r.playedGames}</td>
                        <td className="num-cell">{r.won}</td>
                        <td className="num-cell">{r.draw}</td>
                        <td className="num-cell">{r.lost}</td>
                        <td className={`num-cell ${gd > 0 ? 'gd-pos' : gd < 0 ? 'gd-neg' : ''}`}>{gd > 0 ? '+' : ''}{gd}</td>
                        <td><FormDots formStr={r.form} /></td>
                        <td className="pts-cell">{r.points}</td>
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

function TeamsGrid({ teams, onSelectTeam }) {
  if (!teams?.length) return null;
  return (
    <div className="mg8-teams-grid">
      {teams.map(t => (
        <div key={t.id} className="mg8-team-card" onClick={() => onSelectTeam(t)}>
          {t.crest && <img src={t.crest} alt="" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}
          <div className="name">{t.shortName || t.name}</div>
          {t.tla && <div className="tla">{t.tla}</div>}
        </div>
      ))}
    </div>
  );
}

function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="mg8-toast-wrap">
      {toasts.map(t => {
        const isGoal = t.type === 'goal', isCard = t.type === 'card';
        let bg, icon;
        if (isGoal) { bg = 'linear-gradient(135deg,rgba(239,68,68,.92),rgba(185,28,28,.9))'; icon = '⚽'; }
        else if (isCard) { bg = t.cardType === 'RED_CARD' ? 'linear-gradient(135deg,rgba(220,38,38,.92),rgba(153,27,27,.9))' : 'linear-gradient(135deg,rgba(202,138,4,.92),rgba(146,100,4,.9))'; icon = t.cardType === 'RED_CARD' ? '🟥' : '🟨'; }
        else {
          const m = { ft: ['rgba(16,185,129,.92)','rgba(5,150,105,.9)'], ht: ['rgba(249,115,22,.92)','rgba(217,90,12,.9)'], live: ['rgba(239,68,68,.92)','rgba(220,38,38,.9)'] };
          const c = m[t.st] || m.live; bg = `linear-gradient(135deg,${c[0]},${c[1]})`;
          icon = t.st === 'ft' ? '🏁' : t.st === 'ht' ? '⏸' : '⚡';
        }
        return (
          <div key={t.id} className="mg8-toast" style={{ background: bg }} onClick={() => onDismiss(t.id)}>
            <div className="mg8-toast-inner">
              <span className="mg8-toast-icon">{icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mg8-toast-title">{isGoal ? 'GOAL!' : isCard ? (t.cardType === 'RED_CARD' ? 'RED CARD' : 'YELLOW CARD') : t.st === 'ft' ? 'FULL TIME' : t.st === 'ht' ? 'HALF TIME' : 'KICK OFF'}</div>
                {t.msg && <div className="mg8-toast-msg">{t.msg}</div>}
                {t.detail && <div className="mg8-toast-detail">{t.detail}</div>}
              </div>
              {t.score && <div className="mg8-toast-score">{t.score}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Confetti({ active }) {
  if (!active) return null;
  const colors = ['#ef4444','#10b981','#f59e0b','#3b82f6','#a855f7','#ec4899'];
  const p = Array.from({ length: 18 }, (_, i) => ({ left: 8 + Math.random() * 84, top: -8, color: colors[i % colors.length], delay: Math.random() * .3, rot: Math.random() * 360 }));
  return (
    <div className="mg8-confetti" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 400, overflow: 'hidden' }}>
      {p.map((x, i) => <div key={i} style={{ position: 'absolute', width: 7, height: 7, borderRadius: 2, left: x.left + '%', top: x.top + 'px', background: x.color, animationDelay: x.delay + 's', transform: `rotate(${x.rot}deg)`, animation: 'mg8Confetti 1.4s ease-out forwards' }} />)}
    </div>
  );
}

// ─── Helper Functions & Hooks ─────────────────────────────────────────

function matchQ(m, terms) {
  const str = ((m.homeTeam?.shortName || m.homeTeam?.name || '') + ' ' + (m.awayTeam?.shortName || m.awayTeam?.name || '') + ' ' + (m.competition?.name || '')).toLowerCase();
  return terms.every(t => str.includes(t));
}

function zoneCls(pos, total) {
  if (pos <= 4) return 'mg8-z-ucl';
  if (pos <= 6) return 'mg8-z-uel';
  if (pos === 7) return 'mg8-z-uecl';
  if (pos > total - 3) return 'mg8-z-rel';
  return '';
}

function useToasts() {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const timers = useRef(new Map());
  
  const add = useCallback(t => {
    const id = ++idRef.current;
    setToasts(p => [...p.slice(-3), { ...t, id }]);
    timers.current.set(id, setTimeout(() => {
      setToasts(p => p.filter(x => x.id !== id));
      timers.current.delete(id);
    }, t.dur || 3500));
    return id;
  }, []);
  
  const dismiss = useCallback(id => {
    setToasts(p => p.filter(x => x.id !== id));
    if (timers.current.has(id)) { clearTimeout(timers.current.get(id)); timers.current.delete(id); }
  }, []);
  
  useEffect(() => () => { timers.current.forEach(t => clearTimeout(t)); timers.current.clear(); }, []);
  return { toasts, add, dismiss };
}

function useNotifications() {
  const [notifs, setNotifs] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('mg8_notifs') || '[]')); } catch { return new Set(); } });
  const [globalEnabled, setGlobalEnabled] = useState(() => { try { return localStorage.getItem('mg8_notif_global') === 'true'; } catch { return false; } });
  
  const toggle = useCallback(id => { 
    setNotifs(p => { 
      const n = new Set(p); 
      if (n.has(id)) n.delete(id); else n.add(id); 
      try { localStorage.setItem('mg8_notifs', JSON.stringify([...n])); } catch {} 
      return n; 
    }); 
  }, []);
  
  const isOn = useCallback(id => notifs.has(id), [notifs]);
  const toggleGlobal = useCallback(() => { 
    setGlobalEnabled(p => { 
      const n = !p; 
      try { localStorage.setItem('mg8_notif_global', String(n)); } catch {} 
      return n; 
    }); 
  }, []);
  
  return { notifs, toggle, isOn, globalEnabled, toggleGlobal };
}

function useFavourites() {
  const [favs, setFavs] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('mg8_favs') || '[]')); } catch { return new Set(); } });
  const toggle = useCallback(id => { 
    setFavs(prev => { 
      const next = new Set(prev); 
      if (next.has(id)) next.delete(id); else next.add(id); 
      try { localStorage.setItem('mg8_favs', JSON.stringify([...next])); } catch {} 
      return next; 
    }); 
  }, []);
  const isFav = useCallback(id => favs.has(id), [favs]);
  return { favs, toggle, isFav };
}

async function requestNotifPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

// ─── Main Page Component ────────────────────────────────────────────

export default function MasterGames() {
  const { fixtures, liveMatches, competitions, loading, lastUpdated, getStandings, getTeams, refreshFixtures, loadDateFixtures } = useFootballData();
  const { toasts, add: addToast, dismiss: dismissToast } = useToasts();
  const { favs, toggle: toggleFav, isFav } = useFavourites();
  const { isOn: isNotif, toggle: toggleNotif, globalEnabled, toggleGlobal } = useNotifications();

  const [tab, setTab] = useState('fixtures');
  const [selectedDate, setSelectedDate] = useState(getLocalDateStr(0));
  const [expanded, setExpanded] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [standingsData, setStandingsData] = useState(null);
  const [teamsData, setTeamsData] = useState(null);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  const [selectedCompCode, setSelectedCompCode] = useState(null);
  const [leagueSearchOpen, setLeagueSearchOpen] = useState(false);
  const [leagueSearchQ, setLeagueSearchQ] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(null);

  // Deep Linking
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab');
    const c = params.get('comp');
    if (t && ['fixtures', 'live', 'favourites', 'standings', 'teams'].includes(t)) setTab(t);
    if (c) setSelectedCompCode(c);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let changed = false;
    if (params.get('tab') !== tab) { params.set('tab', tab); changed = true; }
    if (tab === 'standings' || tab === 'teams') {
      if (selectedCompCode && params.get('comp') !== selectedCompCode) { params.set('comp', selectedCompCode); changed = true; }
    } else {
      if (params.get('comp')) { params.delete('comp'); changed = true; }
    }
    if (changed) window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  }, [tab, selectedCompCode]);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: 'ZOKASCORE Football', text: 'Check out this football data on ZOKASCORE!', url }); } catch {}
    } else {
      navigator.clipboard.writeText(url);
      addToast({ type: 'status', st: 'live', msg: 'Link copied to clipboard!', dur: 2000 });
    }
  };

  // Data Fetching
  const loadStandings = useCallback(async (code, force = false) => {
    setStandingsLoading(true);
    setStandingsData(await getStandings(code, force));
    setStandingsLoading(false);
  }, [getStandings]);

  const loadTeams = useCallback(async (code, force = false) => {
    setTeamsLoading(true);
    setTeamsData(await getTeams(code, force));
    setTeamsLoading(false);
  }, [getTeams]);

  useEffect(() => {
    if (!selectedCompCode && competitions.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const c = params.get('comp');
      if (c) setSelectedCompCode(c);
      else if (tab === 'standings' || tab === 'teams') setSelectedCompCode(competitions[0].code || competitions[0].id);
    }
  }, [competitions, selectedCompCode, tab]);

  useEffect(() => {
    if (selectedCompCode && tab === 'standings') loadStandings(selectedCompCode);
    if (selectedCompCode && tab === 'teams') loadTeams(selectedCompCode);
  }, [selectedCompCode, tab, loadStandings, loadTeams]);

  useEffect(() => {
    if (tab !== 'standings' && tab !== 'teams') return;
    const interval = setInterval(() => {
      if (tab === 'standings' && selectedCompCode) loadStandings(selectedCompCode, true);
      if (tab === 'teams' && selectedCompCode) loadTeams(selectedCompCode, true);
    }, 5 * 60 * 1000); 
    return () => clearInterval(interval);
  }, [tab, selectedCompCode, loadStandings, loadTeams]);

  useEffect(() => { if (selectedDate) loadDateFixtures(selectedDate); }, [selectedDate, loadDateFixtures]);

  // Filtering & Grouping
  const filteredFixtures = useMemo(() => {
    let list = (fixtures || []).filter(m => getLocalDateFromUtc(m.utcDate) === selectedDate);
    if (searchQ.trim()) {
      const terms = searchQ.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (terms.length) list = list.filter(m => matchQ(m, terms));
    }
    return list;
  }, [fixtures, selectedDate, searchQ]);

  const grouped = useMemo(() => {
    const map = new Map();
    filteredFixtures.forEach(m => {
      const key = m.competition?.name || 'Other';
      if (!map.has(key)) map.set(key, { comp: m.competition, matches: [] });
      map.get(key).matches.push(m);
    });
    const statusOrder = (s) => { if (s === 'IN_PLAY' || s === 'PAUSED') return 0; if (s === 'SCHEDULED' || s === 'TIMED') return 1; if (s === 'FINISHED') return 2; return 3; };
    map.forEach(g => g.matches.sort((a, b) => statusOrder(a.status) - statusOrder(b.status) || (a.utcDate || '').localeCompare(b.utcDate || '')));
    return [...map.values()];
  }, [filteredFixtures]);

  const compList = useMemo(() => (competitions || []).map(c => ({ id: String(c.id), code: c.code, name: c.name, emblem: c.emblem })).sort((a, b) => (a.name || '').localeCompare(b.name || '')), [competitions]);
  const topComps = useMemo(() => compList.filter(c => TOP_5_CODES.includes(c.code)), [compList]);
  const otherComps = useMemo(() => compList.filter(c => !TOP_5_CODES.includes(c.code)), [compList]);
  
  const filteredOtherComps = useMemo(() => {
    if (!leagueSearchQ.trim()) return otherComps;
    return otherComps.filter(c => (c.name || '').toLowerCase().includes(leagueSearchQ.toLowerCase()));
  }, [otherComps, leagueSearchQ]);

  const liveCount = useMemo(() => liveMatches.filter(m => m.status === 'IN_PLAY' || m.status === 'PAUSED').length, [liveMatches]);
  const favMatches = useMemo(() => filteredFixtures.filter(m => isFav(String(m.id))), [filteredFixtures, isFav]);

  // Dynamic SEO
  const currentCompName = useMemo(() => {
    if (!selectedCompCode) return "Top Football Leagues";
    const comp = compList.find(c => (c.code || String(c.id)) === selectedCompCode);
    return comp ? comp.name : (COMP_NAMES_SEO[selectedCompCode] || "Football");
  }, [selectedCompCode, compList]);

  const pageTitle = useMemo(() => {
    if (tab === 'standings') return `${currentCompName} Table & Standings | ZOKASCORE`;
    if (tab === 'teams') return `${currentCompName} Teams & Squads | ZOKASCORE`;
    if (tab === 'live') return "Live Football Scores & Matches | ZOKASCORE";
    if (tab === 'favourites') return "My Favourite Football Matches | ZOKASCORE";
    return "Football Fixtures, Live Scores & Predictions | ZOKASCORE";
  }, [tab, currentCompName]);

  const pageDescription = useMemo(() => {
    if (tab === 'standings') return `Live ${currentCompName} standings, table, points, goals, and match results. Follow up-to-date football league tables on ZOKASCORE.`;
    if (tab === 'teams') return `View all ${currentCompName} teams, clubs, and squad details on ZOKASCORE.`;
    if (tab === 'live') return `Watch live football scores, in-play matches, and real-time updates on ZOKASCORE.`;
    return `Get the latest football fixtures, live scores, and premium predictions on ZOKASCORE.`;
  }, [tab, currentCompName]);

  const structuredData = useMemo(() => {
    if (tab === 'standings' && standingsData?.standings?.[0]?.table) {
      return { "@context": "https://schema.org", "@type": "ItemList", "name": `${currentCompName} Standings`, "itemListElement": standingsData.standings[0].table.map((row, index) => ({ "@type": "ListItem", "position": index + 1, "item": { "@type": "SportsTeam", "name": row.team?.name || "Unknown", "sport": "Soccer" } })) };
    }
    if (tab === 'teams' && teamsData?.teams) {
      return { "@context": "https://schema.org", "@type": "ItemList", "name": `${currentCompName} Teams`, "itemListElement": teamsData.teams.map((team, index) => ({ "@type": "ListItem", "position": index + 1, "item": { "@type": "SportsTeam", "name": team.name, "sport": "Soccer" } })) };
    }
    return null;
  }, [tab, standingsData, teamsData, currentCompName]);

  const todayStr = getLocalDateStr(0);
  const yesterdayStr = getLocalDateStr(-1);
  const tomorrowStr = getLocalDateStr(1);

  return (
    <div className="mg8-page">
      <SEO title={pageTitle} description={pageDescription} keywords={`${currentCompName}, football table, ${currentCompName} standings, live scores, football fixtures, ZOKASCORE`} path={`/mastergames?tab=${tab}${selectedCompCode ? `&comp=${selectedCompCode}` : ''}`} robots="index,follow" structuredData={structuredData} />

      <div className="mg8-wrap">
        <header className="mg8-header">
          <h1>Football Live</h1>
          <div className="sub">{relativeDateLabel(selectedDate)} {lastUpdated ? `· Updated ${new Date(lastUpdated).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}` : ''}</div>
        </header>

        <div className="mg8-stats">
          <div style={{ textAlign: 'center' }}><div className="mg8-stat-val live-c">{liveCount}</div><div className="mg8-stat-label">Live</div></div>
          <div style={{ textAlign: 'center' }}><div className="mg8-stat-val total-c">{filteredFixtures.length}</div><div className="mg8-stat-label">Fixtures</div></div>
          <div style={{ textAlign: 'center' }}><div className="mg8-stat-val" style={{ color: '#f59e0b' }}>{favs.size}</div><div className="mg8-stat-label">Favs</div></div>
        </div>

        <div className="mg8-datenav">
          <button className={`mg8-date-btn ${selectedDate === yesterdayStr ? 'active' : ''}`} onClick={() => setSelectedDate(yesterdayStr)}>Yesterday</button>
          <button className={`mg8-date-btn mg8-date-today ${selectedDate === todayStr ? 'active' : ''}`} onClick={() => setSelectedDate(todayStr)}>Today</button>
          <button className={`mg8-date-btn ${selectedDate === tomorrowStr ? 'active' : ''}`} onClick={() => setSelectedDate(tomorrowStr)}>Tomorrow</button>
          <div className="mg8-more-wrap"><button className="mg8-more-btn" onClick={() => alert('DatePicker functionality goes here')}><Calendar size={13} /> More</button></div>
        </div>

        <div className="mg8-tabs">
          {['fixtures', 'live', 'favourites', 'standings', 'teams'].map(t => (
            <button key={t} className={`mg8-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
          ))}
        </div>

        <div className="mg8-actions">
          <button className="mg8-act" onClick={refreshFixtures}><RefreshCw size={13} /> Refresh</button>
          <button className={`mg8-act ${searchOpen ? 'on' : ''}`} onClick={() => setSearchOpen(!searchOpen)}><Search size={13} /> Search</button>
          <button className="mg8-act" onClick={handleShare}><Share2 size={13} /> Share</button>
          {globalEnabled ? (
            <button className="mg8-act on" onClick={toggleGlobal}><Bell size={13} /> On</button>
          ) : (
            <button className="mg8-act" onClick={async () => { if (await requestNotifPermission()) toggleGlobal(); }}><BellOff size={13} /> Off</button>
          )}
        </div>

        <div className={`mg8-search-wrap ${searchOpen ? 'open' : 'shut'}`}>
          <div className="mg8-search">
            <Search size={15} style={{ opacity: .4, flexShrink: 0 }} />
            <input type="text" placeholder="Search team or competition..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
            {searchQ && <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setSearchQ('')}><X size={14} /></button>}
          </div>
        </div>

        {(tab === 'standings' || tab === 'teams') && compList.length > 0 && (
          <div style={{ marginBottom: 14, position: 'relative' }}>
            <div className="mg8-filters">
              {topComps.map(c => (
                <button key={c.id} className={`mg8-filter ${selectedCompCode === (c.code || String(c.id)) ? 'active' : ''}`} onClick={() => setSelectedCompCode(c.code || String(c.id))}>
                  {c.emblem && <img src={c.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />} {c.code || c.name}
                </button>
              ))}
            </div>
            <button className="mg8-more-btn" style={{ width: '100%', marginTop: 6, justifyContent: 'center' }} onClick={() => setLeagueSearchOpen(!leagueSearchOpen)}>
              <Search size={13} /> {leagueSearchOpen ? 'Close All Leagues Search' : 'Search All Other Leagues'}
            </button>
            {leagueSearchOpen && (
              <div className="mg8-more-dropdown" style={{ position: 'static', transform: 'none', width: '100%', marginTop: 6, maxHeight: 300, overflowY: 'auto' }}>
                <input className="mg8-search" style={{ width: '100%', marginBottom: 6 }} placeholder="Type league name..." value={leagueSearchQ} onChange={e => setLeagueSearchQ(e.target.value)} />
                {filteredOtherComps.length === 0 && <div className="mg8-empty" style={{ padding: 10 }}><p>No leagues found</p></div>}
                {filteredOtherComps.map(c => (
                  <button key={c.id} className={`mg8-more-item ${selectedCompCode === (c.code || String(c.id)) ? 'active' : ''}`} onClick={() => { setSelectedCompCode(c.code || String(c.id)); setLeagueSearchOpen(false); setLeagueSearchQ(''); }}>
                    {c.emblem && <img src={c.emblem} alt="" style={{width:14, height:14, marginRight:6, verticalAlign: 'middle'}} onError={e => { e.target.style.display = 'none'; }} />} {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {loading && !fixtures.length ? (
          <div style={{ marginTop: 20 }}>{[1,2,3,4,5].map(i => <div key={i} className="mg8-sk" />)}</div>
        ) : (
          <>
            {tab === 'fixtures' && (grouped.length === 0 ? (
              <div className="mg8-empty"><div className="mg8-empty-icon"><Calendar size={22} /></div><p>No fixtures found</p></div>
            ) : (
              grouped.map(g => (
                <div key={g.comp?.id || g.comp?.name} className="mg8-section">
                  <div className="mg8-league-hd">
                    {g.comp?.emblem && <img src={g.comp.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <span>{g.comp?.name || 'Other'}</span>
                    <span className="cnt">{g.matches.length}</span>
                  </div>
                  {g.matches.map((m, i) => <MatchCard key={m.id} m={m} idx={i} expanded={expanded} onToggle={setExpanded} isFav={isFav(String(m.id))} onFav={toggleFav} isNotif={isNotif(String(m.id))} onNotif={toggleNotif} />)}
                </div>
              ))
            ))}

            {tab === 'live' && (liveMatches.length === 0 ? (
              <div className="mg8-empty"><div className="mg8-empty-icon"><Zap size={22} /></div><p>No live matches</p></div>
            ) : liveMatches.map((m, i) => <MatchCard key={m.id} m={m} idx={i} expanded={expanded} onToggle={setExpanded} isFav={isFav(String(m.id))} onFav={toggleFav} isNotif={isNotif(String(m.id))} onNotif={toggleNotif} />))}

            {tab === 'favourites' && (favMatches.length === 0 ? (
              <div className="mg8-empty"><div className="mg8-empty-icon"><Heart size={22} /></div><p>No favourited matches</p></div>
            ) : favMatches.map((m, i) => <MatchCard key={m.id} m={m} idx={i} expanded={expanded} onToggle={setExpanded} isFav={isFav(String(m.id))} onFav={toggleFav} isNotif={isNotif(String(m.id))} onNotif={toggleNotif} />))}

            {tab === 'standings' && (standingsLoading ? <div className="mg8-sk" /> : standingsData ? <StandingsTable standings={standingsData.standings} /> : <div className="mg8-empty"><div className="mg8-empty-icon"><Trophy size={22} /></div><p>Select a competition above</p></div>)}

            {tab === 'teams' && (teamsLoading ? <div className="mg8-sk" /> : teamsData ? <TeamsGrid teams={teamsData.teams} onSelectTeam={setSelectedTeam} /> : <div className="mg8-empty"><div className="mg8-empty-icon"><Users size={22} /></div><p>Select a competition above</p></div>)}
          </>
        )}
      </div>

      {selectedTeam && <TeamModal team={selectedTeam} onClose={() => setSelectedTeam(null)} />}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <Confetti active={confettiKey > 0} key={confettiKey} />
    </div>
  );
}