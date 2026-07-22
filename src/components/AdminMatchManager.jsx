// ═════════════════════════════════════════════════════════════════════════════════
// FILE: src/components/AdminMatchManager.jsx
// Exact Fixture UI format, integrated with Admin Controls (Zoka, Featured, Active)
// ═════════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from 'react';
import { 
  Search, X, Trophy, ChevronRight, ChevronDown, 
  RefreshCw, Star, CheckCircle, Save
} from 'lucide-react';

import { fetchFixtures, subscribeToLiveFixtures } from '../utils/api';
import { todayStr as getTodayStr, getLocalDateStr, getLocalDateFromUtc, formatDateShort, formatTime } from '../utils/dates';

const LEAGUE_PRIORITY = {
  'FIFA World Cup': 1, 'UEFA Champions League': 2, 'UEFA Europa League': 3,
  'UEFA Conference League': 4, 'Premier League': 5, 'La Liga': 6, 'Serie A': 7,
  'Bundesliga': 8, 'Ligue 1': 9, 'Primeira Liga': 10, 'Eredivisie': 11,
  'Süper Lig': 12, 'Championship': 13,
};
const getLeaguePriority = (name) => LEAGUE_PRIORITY[name] || 99;

// Helper to extract date
function extractMatchDate(m) {
  if (!m) return '';
  if (m.utcDate) return getLocalDateFromUtc(m.utcDate);
  if (m.date && m.date.includes('T')) return m.date.split('T')[0];
  if (m.date) return m.date;
  return '';
}

export default function AdminMatchManager({ date, adminData, onToggleActive, onToggleFeatured, onSetZoka }) {
  const [selectedDate, setSelectedDate] = useState(date || getTodayStr());
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [zokaScores, setZokaScores] = useState({});

  // Fetch fixtures exactly like the Fixtures page
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetchFixtures(selectedDate);
        if (!cancelled && res?.matches) {
          setFixtures(res.matches.map(m => ({
            id: String(m.id || m.matchId),
            status: m.status || '',
            isLive: !!m.isLive,
            isFinished: m.status === 'FINISHED' || m.status === 'FT',
            kickoff: m.kickoff || (m.utcDate ? formatTime(m.utcDate) : 'TBD'),
            homeName: m.homeTeam?.shortName || m.homeTeam?.name || 'TBD',
            awayName: m.awayTeam?.shortName || m.awayTeam?.name || 'TBD',
            homeLogo: m.homeTeam?.logo || m.homeTeam?.crest,
            awayLogo: m.awayTeam?.logo || m.awayTeam?.crest,
            homeScore: m.homeScore ?? null,
            awayScore: m.awayScore ?? null,
            minute: m.minute || m.elapsed || null,
            leagueName: m.league?.name || 'Other',
            leagueLogo: m.league?.logo || m.league?.emblem,
          })));
        }
      } catch (e) {} finally { if (!cancelled) setLoading(false); }
    })();

    const unsub = subscribeToLiveFixtures(({ matches: lm }) => {
      if (!lm || lm.length === 0) return;
      const liveMap = new Map(lm.map(m => [String(m.id), m]));
      setFixtures(prev => prev.map(f => {
        const live = liveMap.get(String(f.id));
        return live ? { ...f, ...live, isLive: true, homeScore: live.homeScore ?? f.homeScore, awayScore: live.awayScore ?? f.awayScore } : f;
      }));
    });
    return () => { cancelled = true; unsub(); };
  }, [selectedDate]);

  // Match Admin data with fixtures
  const displayMatches = useMemo(() => {
    return fixtures.map(fx => {
      const adminInfo = adminData?.find(a => String(a.matchId) === String(fx.id)) || {};
      return {
        ...fx,
        isActive: adminInfo.isActive || false,
        isFeatured: adminInfo.isFeatured || false,
        isZoka: adminInfo.isZoka || false,
        zokaPick: adminInfo.adminPick || null,
      };
    });
  }, [fixtures, adminData]);

  // Filter & Group exactly like Fixtures page
  const filteredMatches = useMemo(() => {
    let list = displayMatches;
    if (searchQ.trim()) {
      const terms = searchQ.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (terms.length) list = list.filter(m => `${m.homeName} ${m.awayName} ${m.leagueName}`.toLowerCase().includes(searchQ.toLowerCase()));
    }
    return list;
  }, [displayMatches, searchQ]);

  const grouped = useMemo(() => {
    const map = new Map();
    filteredMatches.forEach(m => {
      const key = m.leagueName || 'Other';
      if (!map.has(key)) map.set(key, { name: key, logo: m.leagueLogo, matches: [] });
      map.get(key).matches.push(m);
    });

    map.forEach(g => {
      g.matches.sort((a, b) => {
        if (a.isLive && !b.isLive) return -1;
        if (!a.isLive && b.isLive) return 1;
        if (a.isFinished && !b.isFinished) return 1;
        if (!a.isFinished && b.isFinished) return -1;
        return (a.kickoff || '').localeCompare(b.kickoff || '');
      });
    });

    return [...map.values()].sort((a, b) => getLeaguePriority(a.name) - getLeaguePriority(b.name));
  }, [filteredMatches]);

  const handleStep = (matchId, side, dir) => {
    setZokaScores(prev => {
      const current = prev[matchId] || { h: 0, a: 0 };
      const val = Math.max(0, (current[side] || 0) + dir);
      return { ...prev, [matchId]: { ...current, [side]: val } };
    });
  };

  const handleSaveZoka = (matchId) => {
    const scores = zokaScores[matchId];
    if (!scores) return;
    onSetZoka(matchId, scores.h, scores.a);
    setExpanded(null);
  };

  return (
    <div className="adm-page">
      <div className="adm-wrap">
        {/* Header */}
        <div className="adm-hdr">
          <div className="adm-hdr-title">
            <h1>
              <span style={{ color: '#fff' }}>ADMIN</span>
              <span style={{ color: '#3b82f6' }}>CONTROLS</span>
            </h1>
            <div className="sub">Manage matches, Zoka picks & features</div>
          </div>
          <div className="adm-hdr-actions">
            <button className="adm-hdr-btn" onClick={() => setLoading(true)}>
              <RefreshCw size={18} className={loading ? 'adm-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Date Nav */}
        <div className="adm-datenav">
          <button className={`adm-nav-btn ${selectedDate === getLocalDateStr(-1) ? 'active' : ''}`} onClick={() => setSelectedDate(getLocalDateStr(-1))}>
            Yesterday
          </button>
          <button className={`adm-nav-btn ${selectedDate === getLocalDateStr(0) ? 'active' : ''}`} onClick={() => setSelectedDate(getLocalDateStr(0))}>
            Today
          </button>
          <button className={`adm-nav-btn ${selectedDate === getLocalDateStr(1) ? 'active' : ''}`} onClick={() => setSelectedDate(getLocalDateStr(1))}>
            Tomorrow
          </button>
        </div>

        {/* Search */}
        <div className="adm-search-static">
          <Search size={18} style={{ color: '#94a3b8', flexShrink: 0 }} />
          <input type="text" placeholder="Search matches to manage..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
          {searchQ && <button style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, display: 'flex' }} onClick={() => setSearchQ('')}><X size={18} /></button>}
        </div>

        {/* Fixtures List */}
        {loading ? (
          <div>{[1,2,3,4,5].map(i => <div key={i} className="adm-sk" style={{ animationDelay: i * 80 + 'ms' }} />)}</div>
        ) : grouped.length === 0 ? (
          <div className="adm-empty">
            <div style={{ fontSize: '2rem' }}>⚽</div>
            <p style={{ color: '#cbd5e1', fontSize: '.85em', fontWeight: 700, margin: 0 }}>No matches found for this date</p>
          </div>
        ) : (
          <>
            {grouped.map(group => (
              <div key={group.name} className="adm-section">
                <div className="adm-league-hd">
                  {group.logo && <img src={group.logo} alt="" style={{ width: '16px', height: '16px', borderRadius: '3px' }} onError={e => { e.target.style.display = 'none'; }} />}
                  <span>{group.name}</span>
                </div>

                {group.matches.map((m, idx) => {
                  const isExp = expanded === m.id;
                  let cls = 'adm-card';
                  if (m.isLive) cls += ' live';
                  else if (m.isFinished) cls += ' finished';
                  else cls += ' scheduled';
                  if (isExp) cls += ' expanded';

                  const barColor = m.isLive ? '#ef4444' : m.isFinished ? '#10b981' : '#3b82f6';
                  const localVal = zokaScores[m.id] || { h: m.zokaPick?.home ?? 0, a: m.zokaPick?.away ?? 0 };

                  return (
                    <div key={m.id}>
                      <div 
                        className={cls} 
                        style={{ animationDelay: idx * 15 + 'ms', paddingLeft: 18 }} 
                        onClick={() => setExpanded(isExp ? null : m.id)}
                      >
                        <div className="adm-left-bar" style={{ background: barColor }} />
                        <div className="adm-card-top">
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            {m.isLive && <span className="adm-status live-s"><span className="adm-dot" /> {m.minute != null ? `${m.minute}'` : 'LIVE'}</span>}
                            {m.isFinished && <span className="adm-status ft-s">FT</span>}
                            {!m.isLive && !m.isFinished && <span className="adm-status time-s">{m.kickoff}</span>}
                            
                            {/* Admin Badges */}
                            {m.isActive && <span className="adm-badge active">Active</span>}
                            {m.isFeatured && <span className="adm-badge featured">Featured</span>}
                            {m.isZoka && <span className="adm-badge zoka">Zoka</span>}
                          </div>
                        </div>
                        
                        <div className="adm-teams">
                          <div className="adm-team-col home">
                            <div className="adm-team-row">
                              {m.homeLogo && <img className="adm-crest" src={m.homeLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                              <span className="adm-team-name">{m.homeName}</span>
                            </div>
                          </div>
                          <div className="adm-score-box">
                            {(m.isLive || m.isFinished) ? (
                              <div className="adm-scores">
                                <span className={`adm-score-num ${m.isLive ? 'live-score' : ''} ${m.isFinished ? 'ft-score' : ''}`}>{m.homeScore ?? 0}</span>
                                <span className="adm-sep">–</span>
                                <span className={`adm-score-num ${m.isLive ? 'live-score' : ''} ${m.isFinished ? 'ft-score' : ''}`}>{m.awayScore ?? 0}</span>
                              </div>
                            ) : <span className="adm-vs">VS</span>}
                          </div>
                          <div className="adm-team-col away">
                            <div className="adm-team-row">
                              {m.awayLogo && <img className="adm-crest" src={m.awayLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                              <span className="adm-team-name">{m.awayName}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Admin Control Panel */}
                      {isExp && (
                        <div className="adm-expanded">
                          <div className="adm-exp-section">Admin Controls</div>
                          
                          <div className="adm-toggle-row">
                            <button 
                              className={`adm-toggle-btn ${m.isActive ? 'on' : ''}`} 
                              onClick={(e) => { e.stopPropagation(); onToggleActive(m.id); }}
                            >
                              <CheckCircle size={14} /> Active
                            </button>
                            <button 
                              className={`adm-toggle-btn ${m.isFeatured ? 'on' : ''}`} 
                              onClick={(e) => { e.stopPropagation(); onToggleFeatured(m.id); }}
                            >
                              <Star size={14} /> Featured
                            </button>
                          </div>

                          <div className="adm-exp-section">Zoka Prediction</div>
                          <div className="adm-input-grp">
                            <div className="adm-step">
                              <button className="adm-step-btn" onClick={(e) => { e.stopPropagation(); handleStep(m.id, 'h', -1); }}><ChevronDown size={16} /></button>
                              <span className="adm-step-val">{localVal.h}</span>
                              <button className="adm-step-btn" onClick={(e) => { e.stopPropagation(); handleStep(m.id, 'h', 1); }}><ChevronRight size={16} /></button>
                            </div>
                            <span style={{ color:'#64748b', fontWeight: 900 }}>VS</span>
                            <div className="adm-step">
                              <button className="adm-step-btn" onClick={(e) => { e.stopPropagation(); handleStep(m.id, 'a', -1); }}><ChevronDown size={16} /></button>
                              <span className="adm-step-val">{localVal.a}</span>
                              <button className="adm-step-btn" onClick={(e) => { e.stopPropagation(); handleStep(m.id, 'a', 1); }}><ChevronRight size={16} /></button>
                            </div>
                          </div>
                          
                          <button className="adm-save-btn" onClick={(e) => { e.stopPropagation(); handleSaveZoka(m.id); }}>
                            <Save size={16} /> Save Zoka Pick
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}