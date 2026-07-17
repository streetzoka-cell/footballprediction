// ═════════════════════════════════════════════════════════════════════════════════
// FILE: src/components/AdminMatchManager.jsx
// Exact Fixture UI format, integrated with Admin Controls (Zoka, Featured, Active)
// ═════════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, X, Clock, Trophy, Zap, ChevronRight, ChevronDown, 
  RefreshCw, Calendar, AlertTriangle, Star, Target, CheckCircle, XCircle, Save
} from 'lucide-react';

import { fetchFixtures, subscribeToLiveFixtures } from '../utils/api';
import { useFootballData } from '../context/FootballDataContext';
import { todayStr as getTodayStr, getLocalDateStr, getLocalDateFromUtc, formatDateShort, formatTime } from '../utils/dates';

const LEAGUE_PRIORITY = {
  'FIFA World Cup': 1, 'UEFA Champions League': 2, 'UEFA Europa League': 3,
  'UEFA Conference League': 4, 'Premier League': 5, 'La Liga': 6, 'Serie A': 7,
  'Bundesliga': 8, 'Ligue 1': 9, 'Primeira Liga': 10, 'Eredivisie': 11,
  'Süper Lig': 12, 'Championship': 13,
};
const getLeaguePriority = (name) => LEAGUE_PRIORITY[name] || 99;

const injectStyles = () => {
  if (document.getElementById('adm-mg-css')) return;
  const s = document.createElement('style');
  s.id = 'adm-mg-css';
  s.textContent = `
    @keyframes admFadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes admSlideIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
    @keyframes admPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.4)}}
    @keyframes admLiveGlow{0%,100%{box-shadow:0 0 0 1px rgba(239,68,68,.2), 0 4px 20px rgba(0,0,0,0.3)}50%{box-shadow:0 0 15px 1px rgba(239,68,68,.4), 0 4px 20px rgba(0,0,0,0.3)}}
    @keyframes admExpand{from{opacity:0;max-height:0}to{opacity:1;max-height:1000px}}
    @keyframes admShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes admSpin{to{transform:rotate(360deg)}}

    .adm-page{min-height:100vh;background:radial-gradient(circle at top right, #1e293b, #0a0f1a);padding:0 0 120px;position:relative;color:#f8fafc;font-weight:600;overflow-x:hidden}
    .adm-wrap{max-width:560px;margin:0 auto;padding:0 12px;position:relative;z-index:1}

    .adm-hdr{position:sticky;top:0;z-index:50;background:rgba(10,15,26,.75);backdrop-filter:blur(20px) saturate(1.8);-webkit-backdrop-filter:blur(20px) saturate(1.8);padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;gap:8px}
    .adm-hdr-title h1{margin:0;font-size:1.2em;font-weight:900;letter-spacing:-.02em;display:flex;align-items:baseline;gap:2px}
    .adm-hdr-title .sub{font-size:.7em;color:#cbd5e1;font-weight:700;margin-top:2px}
    .adm-hdr-actions{display:flex;align-items:center;gap:6px}
    .adm-hdr-btn{width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;color:#e2e8f0;cursor:pointer;transition:all .2s ease}
    .adm-hdr-btn:hover{background:rgba(255,255,255,0.1);color:#fff}
    .adm-spin{animation:admSpin .8s linear infinite}

    .adm-datenav{display:flex;align-items:center;justify-content:center;gap:4px;margin:16px auto;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:4px;width:fit-content}
    .adm-nav-btn{padding:8px 16px;border-radius:8px;border:none;background:transparent;color:#94a3b8;font-size:.75em;font-weight:800;cursor:pointer}
    .adm-nav-btn.active{background:#3b82f6;color:#fff;box-shadow:0 2px 8px rgba(59,130,246,.3)}

    .adm-search-static{display:flex;align-items:center;gap:8px;width:100%;padding:12px 16px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);margin-bottom:16px}
    .adm-search-static input{flex:1;background:none;border:none;outline:none;color:#fff;font-size:.85em;font-family:inherit}

    .adm-section{margin-bottom:20px;animation:admFadeIn .4s ease both}
    .adm-league-hd{display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:0 4px}
    .adm-league-hd img{width:16px;height:16px;border-radius:3px}
    .adm-league-hd span{font-size:.75em;font-weight:900;color:#cbd5e1;text-transform:uppercase;letter-spacing:.03em}

    /* Exact Match Card Format */
    .adm-card{position:relative;overflow:hidden;padding:14px 16px;background:rgba(30,41,59,0.4);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.06);border-radius:14px;margin-bottom:8px;transition:all .25s cubic-bezier(.22,1,.36,1);animation:admSlideIn .3s ease both;cursor:pointer}
    .adm-card:hover{background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.12)}
    .adm-card.live{border-color:rgba(239,68,68,.3);animation:admLiveGlow 2.5s ease-in-out infinite,admSlideIn .3s ease both}
    .adm-card.finished{opacity:.7}
    .adm-card.scheduled{border-left:3px solid rgba(59,130,246,.4)}
    .adm-card.expanded{border-radius:14px 14px 0 0;margin-bottom:0;border-color:rgba(59,130,246,.3)}
    .adm-left-bar{position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:0 2px 2px 0}

    .adm-card-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
    .adm-status{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;font-size:.55em;font-weight:900;text-transform:uppercase}
    .adm-status.live-s{color:#ef4444;background:rgba(239,68,68,.15)}
    .adm-status.ft-s{color:#10b981;background:rgba(16,185,129,.1)}
    .adm-status.time-s{color:#cbd5e1;background:rgba(255,255,255,0.06);font-size:.65em}
    .adm-dot{width:6px;height:6px;border-radius:50%;background:#ef4444;animation:admPulse 1.2s ease-in-out infinite;flex-shrink:0}
    
    .adm-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:6px;font-size:.5em;font-weight:900;text-transform:uppercase;margin-left:8px}
    .adm-badge.active{background:rgba(16,185,129,.2);color:#10b981;border:1px solid rgba(16,185,129,.3)}
    .adm-badge.featured{background:rgba(59,130,246,.2);color:#3b82f6;border:1px solid rgba(59,130,246,.3)}
    .adm-badge.zoka{background:rgba(245,158,11,.2);color:#f59e0b;border:1px solid rgba(245,158,11,.3)}

    .adm-teams{display:flex;align-items:center;gap:8px}
    .adm-team-col{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
    .adm-team-col.home{align-items:flex-end}
    .adm-team-col.away{align-items:flex-start}
    .adm-team-row{display:flex;align-items:center;gap:8px;min-width:0}
    .adm-team-col.home .adm-team-row{flex-direction:row-reverse}
    .adm-crest{width:22px;height:22px;object-fit:contain;flex-shrink:0;border-radius:4px}
    .adm-team-name{font-size:.9em;font-weight:800;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .adm-team-col.home .adm-team-name{text-align:right}
    
    .adm-score-box{width:70px;flex-shrink:0;text-align:center;display:flex;align-items:center;justify-content:center}
    .adm-scores{display:flex;align-items:center;gap:6px}
    .adm-score-num{font-family:var(--font-display,system-ui);font-variant-numeric:tabular-nums;font-size:1.3em;font-weight:900;min-width:20px;text-align:center;line-height:1}
    .adm-score-num.live-score{color:#ef4444}
    .adm-score-num.ft-score{color:#10b981}
    .adm-sep{color:#64748b;font-size:.75em;font-weight:800;opacity:.5}
    .adm-vs{font-size:.7em;font-weight:900;color:#64748b;opacity:.4}

    /* Admin Control Panel */
    .adm-expanded{background:rgba(15,23,42,0.8);border:1px solid rgba(59,130,246,0.2);border-top:none;border-radius:0 0 14px 14px;overflow:hidden;animation:admExpand .35s ease-out both}
    .adm-exp-section{padding:12px 16px 4px;font-size:.6em;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em}
    .adm-toggle-row{display:flex;gap:8px; padding:12px 16px}
    .adm-toggle-btn{flex:1; display:flex; align-items:center; justify-content:center; gap:6px; padding:10px; border-radius:8px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); color:#94a3b8; font-size:.7em; font-weight:800; cursor:pointer; transition:all .2s}
    .adm-toggle-btn:hover{background:rgba(255,255,255,0.08); color:#fff}
    .adm-toggle-btn.on{background:rgba(16,185,129,0.1); border-color:rgba(16,185,129,0.4); color:#10b981}
    .adm-toggle-btn.zoka-on{background:rgba(245,158,11,0.1); border-color:rgba(245,158,11,0.4); color:#f59e0b}

    .adm-input-grp{display:flex; align-items:center; justify-content:center; gap:16px; padding:8px 16px 16px}
    .adm-input-label{font-size:.7em; font-weight:800; color:#cbd5e1; margin-bottom:4px; text-align:center}
    .adm-step{display:flex; align-items:center; gap:8px}
    .adm-step-btn{width:32px; height:32px; border-radius:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center}
    .adm-step-btn:hover{background:rgba(59,130,246,0.1)}
    .adm-step-val{font-family:var(--font-display); font-size:1.4em; font-weight:900; color:#fff; min-width:25px; text-align:center}
    
    .adm-save-btn{display:flex; align-items:center; justify-content:center; gap:8px; width:100%; padding:12px; border:none; border-radius:0 0 14px 14px; background:linear-gradient(135deg, #3b82f6, #2563eb); color:#fff; font-weight:900; font-size:.8em; cursor:pointer}
    .adm-save-btn:hover{filter:brightness(1.1)}

    .adm-empty{display:flex;flex-direction:column;align-items:center;gap:12px;padding:50px 24px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:16px;text-align:center}
    .adm-sk{height:52px;border-radius:14px;background:linear-gradient(90deg,rgba(30,41,59,0.2) 25%,rgba(255,255,255,0.05) 50%,rgba(30,41,59,0.2) 75%);background-size:200% 100%;animation:admShimmer 1.5s ease-in-out infinite;margin-bottom:8px}
  `;
  document.head.appendChild(s);
};

// Helper to extract date
function extractMatchDate(m) {
  if (!m) return '';
  if (m.utcDate) return getLocalDateFromUtc(m.utcDate);
  if (m.date && m.date.includes('T')) return m.date.split('T')[0];
  if (m.date) return m.date;
  return '';
}

export default function AdminMatchManager({ date, adminData, onToggleActive, onToggleFeatured, onSetZoka }) {
  injectStyles();
  
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
          {searchQ && <button style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }} onClick={() => setSearchQ('')}><X size={18} /></button>}
        </div>

        {/* Fixtures List */}
        {loading ? (
          <div>{[1,2,3,4,5].map(i => <div key={i} className="adm-sk" style={{ animationDelay: i * 80 + 'ms' }} />)}</div>
        ) : grouped.length === 0 ? (
          <div className="adm-empty">
            <div style={{ fontSize: '2rem' }}>⚽</div>
            <p style={{ color: '#cbd5e1', fontSize: '.85em', fontWeight: 700 }}>No matches found for this date</p>
          </div>
        ) : (
          <>
            {grouped.map(group => (
              <div key={group.name} className="adm-section">
                <div className="adm-league-hd">
                  {group.logo && <img src={group.logo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
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
                              <button className="adm-step-btn" onClick={(e) => { e.stopPropagation(); handleStep(m.id, 'h', 1); }}><ChevronUp size={16} /></button>
                            </div>
                            <span style={{ color:'#64748b', fontWeight: 900 }}>VS</span>
                            <div className="adm-step">
                              <button className="adm-step-btn" onClick={(e) => { e.stopPropagation(); handleStep(m.id, 'a', -1); }}><ChevronDown size={16} /></button>
                              <span className="adm-step-val">{localVal.a}</span>
                              <button className="adm-step-btn" onClick={(e) => { e.stopPropagation(); handleStep(m.id, 'a', 1); }}><ChevronUp size={16} /></button>
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