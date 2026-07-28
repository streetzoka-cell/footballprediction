import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert, Star, Radio, Trophy, Megaphone, UserCog, Users, Activity,
  LayoutDashboard, BarChart3, ScrollText, ArrowLeft, ChevronUp, ChevronDown
} from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { useFixtures } from '../../hooks/useFixtures';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '../../utils/firebase';
import { todayStr, getLocalDateStr } from '../../utils/dates';
import { eventBus, EVENT } from '../../utils/eventBus';
import { PATHS } from '../../utils/constants';
import { resolveMatchForAllUsers, rebuildDailySummary, rebuildGoatLeaderboard, rebuildPeriodLeaderboard, rebuildAllLeaderboards } from '../../services/predictions';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, getDocs } from 'firebase/firestore';

// ★ Centralized imports
import { normalizeMatch, extractMatchDate } from "../../engine/matchEngine";
import { useMounted, cleanObj, dateLabel, isLive, isFin, Toast, Confirm } from './components/common';
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

  const [preds, setPreds] = useState([]);
  const [pubPicks, setPubPicks] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [rebuilding, setRebuilding] = useState(null);

  const { data: rawFixtures = [], isLoading: fxLoading } = useFixtures(date);
  const allFixtures = useMemo(() => rawFixtures.map(m => normalizeMatch(m, true)), [rawFixtures]);

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

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(
      doc(db, PATHS.PREDICTION_SNAPSHOTS, date),
      (snap) => {
        if (!mounted.current) return;
        if (snap.exists()) {
          const data = snap.data();
          setPreds(Array.isArray(data.predictions) ? data.predictions : []);
        } else {
          getDocs(query(collection(db, PATHS.ACTIVE_PREDICTIONS), where('matchDate', '==', date)))
            .then(qs => {
              if (mounted.current) setPreds(qs.docs.map(d => d.data()).sort((a, b) => (b.priority || 0) - (a.priority || 0)));
            })
            .catch(() => {});
        }
      },
      () => {}
    );
    return unsub;
  }, [date, mounted]);

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(
      doc(db, PATHS.ZOKA_PICKS, date),
      (snap) => {
        if (!mounted.current) return;
        setPubPicks(snap.exists() ? snap.data() : null);
      },
      () => {}
    );
    return unsub;
  }, [date, mounted]);

  const handleZokaSaveDraft = useCallback(async (data) => {
    if (!db) return;
    await setDoc(doc(db, PATHS.ZOKA_PICKS, date), { ...cleanObj(data), updatedAt: serverTimestamp() }, { merge: true });
    queryClient.invalidateQueries(['zokaPicks', date]);
    eventBus.emit(EVENT.ZOKA_PICKS_UPDATED, { dateStr: date, picks: data });
  }, [date, queryClient]);

  const handleZokaPublish = useCallback(async (data) => {
    if (!db) return;
    await setDoc(doc(db, PATHS.ZOKA_PICKS, date), { ...cleanObj(data), isDraft: false, publishedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    queryClient.invalidateQueries(['zokaPicks', date]);
    eventBus.emit(EVENT.ZOKA_PICKS_UPDATED, { dateStr: date, picks: data });
  }, [date, queryClient]);

  const handleZokaUnpublish = useCallback(async () => {
    if (!db || !pubPicks) return;
    setConfirm({
      title: 'Unpublish All Zoka Picks?',
      msg: `This will remove ${pubPicks.matches?.length || 0} published pick(s) for ${dateLabel(date)}. Users won't see them anymore.`,
      onYes: async () => {
        await deleteDoc(doc(db, PATHS.ZOKA_PICKS, date));
        setPubPicks(null);
        queryClient.invalidateQueries(['zokaPicks', date]);
        eventBus.emit(EVENT.ZOKA_PICKS_UPDATED, { dateStr: date, picks: null });
        setConfirm(null);
      },
    });
  }, [db, pubPicks, date, queryClient]);

  const handleFeaturedAdd = useCallback(async (m) => {
    if (!db) return;
    const predId = `feat_${date}_${m.id}`;
    const pred = {
      id: predId, matchId: String(m.id), matchDate: date,
      homeTeam: m.homeTeam, awayTeam: m.awayTeam,
      homeLogo: m.homeTeam?.crest || null, awayLogo: m.awayTeam?.crest || null,
      league: m.competition || m.league, kickoff: m.utcDate || m.kickoff,
      status: m.status || 'NS', homeScore: null, awayScore: null, priority: preds.length + 1,
    };
    const updatedPreds = [...preds, pred];
    setPreds(updatedPreds);
    await setDoc(doc(db, PATHS.ACTIVE_PREDICTIONS, predId), { ...cleanObj(pred), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    await setDoc(doc(db, PATHS.PREDICTION_SNAPSHOTS, date), { predictions: cleanObj(updatedPreds), updatedAt: serverTimestamp() }, { merge: true });
    queryClient.invalidateQueries(['activePredictions', date]);
    eventBus.emit(EVENT.PREDICTIONS_UPDATED, { dateStr: date, predictions: updatedPreds });
  }, [db, date, preds, queryClient]);

  const handleFeaturedRemove = useCallback(async (p) => {
    if (!db) return;
    const predId = p.id || `feat_${date}_${p.matchId}`;
    const updatedPreds = preds.filter(pr => String(pr.matchId) !== String(p.matchId));
    setPreds(updatedPreds);
    await deleteDoc(doc(db, PATHS.ACTIVE_PREDICTIONS, predId));
    await setDoc(doc(db, PATHS.PREDICTION_SNAPSHOTS, date), { predictions: cleanObj(updatedPreds), updatedAt: serverTimestamp() }, { merge: true });
    queryClient.invalidateQueries(['activePredictions', date]);
    eventBus.emit(EVENT.PREDICTIONS_UPDATED, { dateStr: date, predictions: updatedPreds });
  }, [db, date, preds, queryClient]);

  const handleResolve = useCallback(async (pred, h, a, isAuto = false) => {
    const matchId = String(pred.matchId || pred.id);
    const predId = pred.id || `feat_${date}_${matchId}`;
    await setDoc(doc(db, PATHS.ACTIVE_PREDICTIONS, predId), { homeScore: h, awayScore: a, status: 'finished', updatedAt: serverTimestamp() }, { merge: true });
    const updated = preds.map(p => String(p.matchId) === matchId ? { ...p, homeScore: h, awayScore: a, status: 'finished', isFinished: true } : p);
    setPreds(updated);
    await setDoc(doc(db, PATHS.PREDICTION_SNAPSHOTS, date), { predictions: cleanObj(updated), updatedAt: serverTimestamp() }, { merge: true });
    await resolveMatchForAllUsers(matchId, h, a, date);
    queryClient.invalidateQueries(['activePredictions', date]);
    eventBus.emit(EVENT.PREDICTIONS_UPDATED, { dateStr: date, predictions: updated });
    eventBus.emit(EVENT.MATCH_RESOLVED, { matchId, dateStr: date, actualH: h, actualA: a });
    if (!isAuto) showToast(`Resolved: ${pred.homeTeam?.shortName} ${h}-${a} ${pred.awayTeam?.shortName}`, 'ok');
  }, [preds, date, showToast, queryClient]);

  const handleOverride = useCallback(async (pred, h, a) => {
    const matchId = String(pred.matchId || pred.id);
    const predId = pred.id || `feat_${date}_${matchId}`;
    await setDoc(doc(db, PATHS.ACTIVE_PREDICTIONS, predId), { homeScore: h, awayScore: a, updatedAt: serverTimestamp() }, { merge: true });
    const updated = preds.map(p => String(p.matchId) === matchId ? { ...p, homeScore: h, awayScore: a } : p);
    setPreds(updated);
    await setDoc(doc(db, PATHS.PREDICTION_SNAPSHOTS, date), { predictions: cleanObj(updated), updatedAt: serverTimestamp() }, { merge: true });
    await resolveMatchForAllUsers(matchId, h, a, date);
    queryClient.invalidateQueries(['activePredictions', date]);
    eventBus.emit(EVENT.PREDICTIONS_UPDATED, { dateStr: date, predictions: updated });
    eventBus.emit(EVENT.MATCH_RESOLVED, { matchId, dateStr: date, actualH: h, actualA: a });
  }, [preds, date, queryClient]);

  const handleRebuild = useCallback(async (period) => {
    setRebuilding(period);
    try {
      if (period === 'daily') await rebuildDailySummary(date);
      else if (period === 'goat') await rebuildGoatLeaderboard();
      else if (period === 'weekly') await rebuildPeriodLeaderboard('weekly');
      else if (period === 'monthly') await rebuildPeriodLeaderboard('monthly');
      else if (period === 'all') await rebuildAllLeaderboards();
      showToast('Rebuild complete!', 'ok');
    } catch (e) { 
      console.error('[Admin] Rebuild err:', e); 
      showToast('Rebuild failed', 'er');
    }
    setRebuilding(null);
  }, [date, showToast]);

  useEffect(() => {
    if (!preds.length || !dayFixtures.length) return;
    preds.forEach(p => {
      if (p.status === 'finished' || p.isFinished) return;
      const fx = dayFixtures.find(f => String(f.id) === String(p.matchId));
      if (fx && fx.isFinished && fx.homeScore != null && fx.awayScore != null) {
        handleResolve(p, fx.homeScore, fx.awayScore, true);
      }
    });
  }, [dayFixtures, preds, handleResolve]);

  return (
    <div className="ap">
      <SEO title="Admin Dashboard | ZOKASCORE" description="Access the ZOKASCORE admin control room to securely manage fixtures, review Zoka picks, resolve match results, and rebuild leaderboards efficiently." keywords="admin dashboard, ZOKASCORE admin, manage fixtures, resolve matches, rebuild leaderboards" path="/admin" robots="noindex,nofollow" />
      <div className="aw">
        <div className="ah">
          <button className="ab ab-gh ab-sm" onClick={() => nav('/')} style={{ position: 'absolute', left: 16, top: 20 }}>
            <ArrowLeft size={14} />
          </button>
          <h1><ShieldAlert size={14} style={{ color: 'var(--gold)', verticalAlign: 'middle', marginRight: 6 }} /> Admin Control Room</h1>
          <div className="sub">{userProfile?.displayName || 'Staff'} · {dateLabel(date)}</div>
        </div>

        <div className="at">
          {TABS.map(t => (
            <button key={t.key} className={`atb${tab === t.key ? ' on' : ''}`} onClick={() => setTab(t.key)}>
              <t.icon size={13} /><span className="lb">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="ask" style={{ top: 108 }}>
          <div className="adb">
            {defaultDates.map(d => (
              <button key={d} className={`adp${d === date ? ' on' : ''}`} onClick={() => setDate(d)}>{dateLabel(d)}</button>
            ))}
            <button className="more-dates-btn" onClick={() => setShowMoreDates(p => !p)}>
              {showMoreDates ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showMoreDates ? 'Less' : 'More dates'}
            </button>
            {showMoreDates && extraDates.map(d => (
              <button key={d} className={`adp past${d === date ? ' on' : ''}`} onClick={() => setDate(d)}>{dateLabel(d)}</button>
            ))}
          </div>
        </div>

        {tab === 'dashboard' && (
          <DashboardTab preds={preds} pubPicks={pubPicks} fxCount={dayFixtures.length} liveCount={liveCount} finCount={finCount} date={date} onRebuild={handleRebuild} rebuilding={rebuilding} />
        )}
        {tab === 'analytics' && <AnalyticsTab toast={showToast} />}
        {tab === 'logs' && <LogsTab />}
        {tab === 'zoka' && (
          <ZokaTab date={date} fixtures={allFixtures} fxLoading={fxLoading} pubPicks={pubPicks} onPublish={handleZokaPublish} onUnpublish={handleZokaUnpublish} onSaveDraft={handleZokaSaveDraft} toast={showToast} />
        )}
        {tab === 'featured' && (
          <FeaturedTab date={date} preds={preds} fixtures={allFixtures} onAdd={handleFeaturedAdd} onRemove={handleFeaturedRemove} fxLoading={fxLoading} toast={showToast} />
        )}
        {tab === 'results' && (
          <ResultsTab date={date} preds={preds} onResolve={handleResolve} onOverride={handleOverride} toast={showToast} />
        )}
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