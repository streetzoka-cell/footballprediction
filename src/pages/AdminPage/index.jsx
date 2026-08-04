import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert, Star, Radio, Trophy, Megaphone, UserCog, Users, Activity,
  LayoutDashboard, BarChart3, ScrollText, ArrowLeft, ChevronUp, ChevronDown,
  Plus, Trash2, Zap, Check, Copy, CheckCircle2, TrendingUp, XCircle, Loader2,
  Cpu, AlertTriangle, Terminal, X, Wifi, Ban, Search, RefreshCw, History, Save, Send, Pencil, CalendarDays
} from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { useFixtures, useLiveMatches } from '../../hooks/useFixtures';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '../../utils/firebase';
import { todayStr, getLocalDateStr } from '../../utils/dates';
import { eventBus, EVENT } from '../../utils/eventBus';
import { PATHS } from '../../utils/constants';
import { doc, deleteDoc } from 'firebase/firestore';
import { safeWrite } from '../../services/safeWrite';
import { footballApi } from '../../services/footballApi';

import { useMounted, cleanObj, dateLabel, isLive, isFin, Toast, Confirm, extractDate } from './components/common';
import { useActivePredictions, useZokaPicks } from '../../hooks/useUserData';
import SEO from '../../components/SEO';

import DashboardTab from './components/DashboardTab';
import AnalyticsTab from './components/AnalyticsTab';
import LogsTab from './components/LogsTab';
import ZokaTab from './components/ZokaTab';
import FeaturedTab from './components/FeaturedTab';
import ResultsTab from './components/ResultsTab'; 
import BroadcastTab from './components/BroadcastTab';
import StaffTab from './components/StaffTab';
import UsersTab from './components/UsersTab';
import SystemHealthTab from './components/SystemHealthTab';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  { key: 'logs', label: 'NOC & Logs', icon: ScrollText },
  { key: 'zoka', label: 'Zoka Picks', icon: Star },
  { key: 'featured', label: 'Featured', icon: Radio },
  { key: 'results', label: 'Results', icon: Trophy }, 
  { key: 'broadcast', label: 'Broadcast', icon: Megaphone },
  { key: 'staff', label: 'Staff', icon: UserCog },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'system', label: 'System', icon: Activity },
];

export default function AdminPage() {
  const nav = useNavigate();
  const { userProfile } = useAuth();
  const mounted = useMounted();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('dashboard');
  const [date, setDate] = useState(todayStr());
  const [showMoreDates, setShowMoreDates] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [rebuilding, setRebuilding] = useState(null);

  const { data: preds = [], isLoading: predsLoading } = useActivePredictions(date);
  const { data: pubPicks = null } = useZokaPicks(date);
  const { data: rawFixtures = [], isLoading: fxLoading } = useFixtures(date);
  const { data: rawLive = [] } = useLiveMatches();

  const allFixtures = useMemo(() => {
    const map = new Map();
    (rawFixtures || []).forEach(m => { if (m) map.set(String(m.id), m); });
    (rawLive || []).forEach(m => {
      if (!m) return;
      const existing = map.get(String(m.id));
      if (existing) {
        if (existing.display?.isFinished && !m.display?.isFinished) return;
        map.set(String(m.id), { ...existing, ...m });
      } else if (extractDate(m) === date) {
        map.set(String(m.id), m);
      }
    });
    return Array.from(map.values());
  }, [rawFixtures, rawLive, date]);

  const showToast = useCallback((message, type = 'ok') => setToast({ message, type }), []);

  const defaultDates = useMemo(() => [getLocalDateStr(-1), todayStr(), getLocalDateStr(1)], []);
  const extraDates = useMemo(() => {
    const dates = [];
    for (let i = -14; i <= 14; i++) {
      const d = getLocalDateStr(i);
      if (!defaultDates.includes(d)) dates.push(d);
    }
    return dates.sort();
  }, [defaultDates]);

  const dayFixtures = useMemo(() => allFixtures?.filter(m => extractDate(m) === date) || [], [allFixtures, date]);
  const liveCount = useMemo(() => dayFixtures.filter(isLive).length, [dayFixtures]);
  const finCount = useMemo(() => dayFixtures.filter(isFin).length, [dayFixtures]);

  const handleZokaSaveDraft = useCallback(async (data) => {
    if (!db) return;
    const payload = { ...cleanObj(data), updatedAt: new Date().toISOString() };
    await safeWrite(PATHS.ZOKA_PICKS, date, payload, { merge: true });
    queryClient.invalidateQueries(['zokaPicks', date]);
    eventBus.emit(EVENT.ZOKA_PICKS_UPDATED, { dateStr: date, picks: data });
  }, [date, queryClient]);

  const handleZokaPublish = useCallback(async (data) => {
    if (!db) return;
    const payload = { ...cleanObj(data), isDraft: false, publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await safeWrite(PATHS.ZOKA_PICKS, date, payload, { merge: true });
    queryClient.invalidateQueries(['zokaPicks', date]);
    eventBus.emit(EVENT.ZOKA_PICKS_UPDATED, { dateStr: date, picks: data });
  }, [date, queryClient]);

  const handleZokaUnpublish = useCallback(async () => {
    if (!db || !pubPicks) return;
    setConfirm({
      title: 'Unpublish All Zoka Picks?',
      msg: `This will remove ${pubPicks.matches?.length || 0} published pick(s) for ${dateLabel(date)}. Users won't see them anymore.`,
      onYes: async () => {
        try {
          await deleteDoc(doc(db, PATHS.ZOKA_PICKS, date));
          queryClient.invalidateQueries(['zokaPicks', date]);
          eventBus.emit(EVENT.ZOKA_PICKS_UPDATED, { dateStr: date, picks: null });
        } catch (e) {
          showToast('Failed to unpublish. Quota might be exceeded.', 'er');
        }
        setConfirm(null);
      },
    });
  }, [db, pubPicks, date, queryClient, showToast]);

  const handleFeaturedAdd = useCallback(async (m) => {
    const predId = `feat_${date}_${m.id}`;
    const pred = {
      id: predId, matchId: String(m.id), matchDate: date,
      homeTeam: m.homeTeam, awayTeam: m.awayTeam,
      homeLogo: m.homeTeam?.crest || null, awayLogo: m.awayTeam?.crest || null,
      league: m.competition || m.league, 
      kickoff: m.utcDate || m.kickoffUtc || m.date,
      status: m.status || 'NS', homeScore: null, awayScore: null, priority: (preds?.length || 0) + 1,
    };
    
    await queryClient.cancelQueries(['activePredictions', date]);
    const previousPreds = queryClient.getQueryData(['activePredictions', date]) || [];
    const updatedPreds = [...previousPreds, pred];
    queryClient.setQueryData(['activePredictions', date], updatedPreds);
    
    try {
      await safeWrite(PATHS.ACTIVE_PREDICTIONS, predId, { ...cleanObj(pred), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      await safeWrite(PATHS.PREDICTION_SNAPSHOTS, date, { predictions: cleanObj(updatedPreds), updatedAt: new Date().toISOString() }, { merge: true });
    } catch (e) {
      showToast('Failed to save match', 'er');
      queryClient.setQueryData(['activePredictions', date], previousPreds);
    } finally {
      queryClient.invalidateQueries(['activePredictions', date]);
    }
  }, [date, preds, queryClient, showToast]);

  const handleFeaturedRemove = useCallback(async (p) => {
    const predId = p.id || `feat_${date}_${p.matchId}`;
    await queryClient.cancelQueries(['activePredictions', date]);
    const previousPreds = queryClient.getQueryData(['activePredictions', date]) || [];
    const updatedPreds = previousPreds.filter(pr => String(pr.matchId) !== String(p.matchId));
    queryClient.setQueryData(['activePredictions', date], updatedPreds);
    
    try {
      try { await deleteDoc(doc(db, PATHS.ACTIVE_PREDICTIONS, predId)); } catch {}
      await safeWrite(PATHS.PREDICTION_SNAPSHOTS, date, { predictions: cleanObj(updatedPreds), updatedAt: new Date().toISOString() }, { merge: true });
    } catch (e) {
      showToast('Failed to remove match', 'er');
      queryClient.setQueryData(['activePredictions', date], previousPreds);
    } finally {
      queryClient.invalidateQueries(['activePredictions', date]);
    }
  }, [date, queryClient, showToast]);
  const handleResolve = useCallback(async (pred, h, a, isAuto = false) => {
    const matchId = String(pred.matchId || pred.id);
    const predId = pred.id || `feat_${date}_${matchId}`;
    
    try {
      // 1. Optimistically update the UI and active_predictions doc
      await safeWrite(PATHS.ACTIVE_PREDICTIONS, predId, { homeScore: h, awayScore: a, status: 'finished', isResolved: true, updatedAt: new Date().toISOString() }, { merge: true });
      const updated = preds.map(p => String(p.matchId) === matchId ? { ...p, homeScore: h, awayScore: a, status: 'finished', isFinished: true, isResolved: true } : p);
      queryClient.setQueryData(['activePredictions', date], updated);
      await safeWrite(PATHS.PREDICTION_SNAPSHOTS, date, { predictions: cleanObj(updated), updatedAt: new Date().toISOString() }, { merge: true });

      // 2. Trigger the Backend Resolution Engine (Handles all users safely)
      await footballApi.adminResolveMatch({
        matchId,
        matchDate: date,
        homeScore: h,
        awayScore: a
      });

      // 3. Update UI state & INVALIDATE ALL RELEVANT CACHES
      queryClient.invalidateQueries(['activePredictions']);
      // ★ FIX: Invalidate ALL leaderboards and user points globally
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] }); 
      queryClient.invalidateQueries({ queryKey: ['userPoints'] });
      queryClient.invalidateQueries({ queryKey: ['userPredictions'] });
      
      eventBus.emit(EVENT.PREDICTIONS_UPDATED, { dateStr: date, predictions: updated });
      eventBus.emit(EVENT.MATCH_RESOLVED, { matchId, dateStr: date, actualH: h, actualA: a });
      
      if (!isAuto) showToast(`Resolved: ${pred.homeTeam?.shortName} ${h}-${a} ${pred.awayTeam?.shortName}`, 'ok');
    } catch (e) {
      showToast('Failed to resolve. Check backend permissions.', 'er');
      console.error('[Admin] Resolve err:', e);
    }
  }, [preds, date, showToast, queryClient]);

  const handleOverride = useCallback(async (pred, h, a) => {
    const matchId = String(pred.matchId || pred.id);
    const predId = pred.id || `feat_${date}_${matchId}`;
    try {
      // 1. Update the active_predictions doc with new scores
      await safeWrite(PATHS.ACTIVE_PREDICTIONS, predId, { homeScore: h, awayScore: a, isResolved: true, updatedAt: new Date().toISOString() }, { merge: true });
      const updated = preds.map(p => String(p.matchId) === matchId ? { ...p, homeScore: h, awayScore: a } : p);
      queryClient.setQueryData(['activePredictions', date], updated);
      await safeWrite(PATHS.PREDICTION_SNAPSHOTS, date, { predictions: cleanObj(updated), updatedAt: new Date().toISOString() }, { merge: true });
      
      // 2. Trigger backend to recalculate points for all users
      await footballApi.adminResolveMatch({
        matchId,
        matchDate: date,
        homeScore: h,
        awayScore: a
      });

      // 3. INVALIDATE ALL RELEVANT CACHES
      queryClient.invalidateQueries(['activePredictions']);
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['userPoints'] });
      queryClient.invalidateQueries({ queryKey: ['userPredictions'] });

      eventBus.emit(EVENT.PREDICTIONS_UPDATED, { dateStr: date, predictions: updated });
      eventBus.emit(EVENT.MATCH_RESOLVED, { matchId, dateStr: date, actualH: h, actualA: a });
    } catch (e) {
      showToast('Failed to override. Check backend permissions.', 'er');
      console.error('[Admin] Override err:', e);
    }
  }, [preds, date, queryClient, showToast]);

  
  const handleRebuild = useCallback(async (period) => {
    setRebuilding(period);
    try {
      // Use the authenticated API method instead of raw fetch
      await footballApi.adminLeaderboardRebuild(period, date);
      
      showToast(`${period.toUpperCase()} rebuild complete!`, 'ok');
      queryClient.invalidateQueries(['leaderboard', 'dailyLeaderboard', 'weeklyLeaderboard', 'monthlyLeaderboard', 'goatLeaderboard']);
    } catch (e) { 
      console.error('[Admin] Rebuild err:', e); 
      showToast(e.friendlyMessage || 'Rebuild failed. Check permissions.', 'er');
    }
    setRebuilding(null);
  }, [date, showToast, queryClient]);

  if (!mounted) return null;

  return (
    <div className="zoka-page">
      <SEO title="Admin Dashboard & Control Center" description="Securely manage ZOKASCORE operations." robots="noindex,nofollow" />
      <div className="zoka-wrap">
        <div className="glass-card p-16 mb-16 flex-between items-center">
          <button className="btn btn-ghost btn-sm" onClick={() => nav('/')}><ArrowLeft size={14} /> Back</button>
          <div className="text-center">
            <h1 className="text-primary font-extrabold text-md flex-center gap-8"><ShieldAlert size={14} className="text-gold" /> Admin Control Room</h1>
            <div className="text-muted text-xs">{userProfile?.displayName || 'Staff'} · {dateLabel(date)}</div>
          </div>
          <div className="w-8"></div>
        </div>

        <div className="glass-card flex gap-4 p-8 mb-16 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(t.key)}>
              <t.icon size={13} /><span className="hidden md:inline">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="glass-card flex gap-8 p-8 mb-16 overflow-x-auto">
          {defaultDates.map(d => (
            <button key={d} className={`btn btn-sm ${d === date ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setDate(d)}>{dateLabel(d)}</button>
          ))}
          <button className="btn btn-sm btn-secondary" onClick={() => setShowMoreDates(p => !p)}>
            {showMoreDates ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {showMoreDates ? 'Less' : 'More'}
          </button>
          {showMoreDates && extraDates.map(d => (
            <button key={d} className={`btn btn-sm ${d === date ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setDate(d)}>{dateLabel(d)}</button>
          ))}
        </div>

        {tab === 'dashboard' && <DashboardTab preds={preds} pubPicks={pubPicks} fxCount={dayFixtures.length} liveCount={liveCount} finCount={finCount} date={date} onRebuild={handleRebuild} rebuilding={rebuilding} />}
        {tab === 'analytics' && <AnalyticsTab toast={showToast} />}
        {tab === 'logs' && <LogsTab />}
        {tab === 'zoka' && <ZokaTab date={date} fixtures={allFixtures} fxLoading={fxLoading} pubPicks={pubPicks} onPublish={handleZokaPublish} onUnpublish={handleZokaUnpublish} onSaveDraft={handleZokaSaveDraft} toast={showToast} />}
        {tab === 'featured' && <FeaturedTab date={date} preds={preds} fixtures={allFixtures} onAdd={handleFeaturedAdd} onRemove={handleFeaturedRemove} fxLoading={fxLoading || predsLoading} toast={showToast} />}
        {tab === 'results' && <ResultsTab date={date} preds={preds} onResolve={handleResolve} onOverride={handleOverride} toast={showToast} />}
        {tab === 'broadcast' && <BroadcastTab toast={showToast} />}
        {tab === 'staff' && <StaffTab toast={showToast} />}
        {tab === 'users' && <UsersTab toast={showToast} />}
        {tab === 'system' && <SystemHealthTab />}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
      {confirm && <Confirm title={confirm.title} msg={confirm.msg} onYes={confirm.onYes} onNo={() => setConfirm(null)} danger={confirm.danger} />}
    </div>
  );
}