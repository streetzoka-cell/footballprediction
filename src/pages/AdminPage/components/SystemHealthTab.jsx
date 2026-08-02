// src/pages/AdminPage/components/SystemHealthTab.jsx

import React, { useState, useEffect, memo, useRef, useCallback } from 'react';
import {
  Cpu,
  AlertTriangle,
  Activity,
  Terminal,
  X,
  Wifi,
  Zap,
  Lock,
} from 'lucide-react';

import { footballApi } from '../../../services/footballApi';
import { adminFetchJSON } from '../../../services/adminApi';
import { Skel, Empty } from './common';
import { getAuthHeaders } from '../../../services/backendAuth';

const TerminalModal = ({ isOpen, onClose, logs }) => {
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    if (isOpen && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/80 flex-center z-max p-20"
      onClick={onClose}
    >
      <div
        className="glass-card w-90vw max-w-900 h-70vh flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-between p-16 border-b border-border">
          <div className="flex-center gap-8 text-primary font-mono font-bold text-sm">
            <Terminal size={14} /> root@zoka-api:~/logs$
          </div>
          <button onClick={onClose} className="btn-icon-sm">
            <X size={18} />
          </button>
        </div>

        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-16 text-primary font-mono text-sm"
        >
          {logs.length === 0 ? (
            <div className="text-muted">Waiting for data stream...</div>
          ) : (
            logs.map((line, i) => (
              <div key={i} className="mb-4 opacity-90">
                {`> ${line}`}
              </div>
            ))
          )}

          <div className="h-20 flex-center">
            <span className="inline-block w-8 h-14 bg-primary anim-pulse"></span>
          </div>
        </div>
      </div>
    </div>
  );
};

const SystemHealthTab = memo(function SystemHealthTab() {
  const [health, setHealth] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const healthData = await footballApi.getHealth();
      setHealth(healthData);
      setError(false);
    } catch (err) {
      setError(true);
      setLoading(false);
      return;
    }

    try {
      const metricsRaw = await adminFetchJSON('/api/v1/monitoring/metrics');
      setMetrics(metricsRaw?.data || metricsRaw);
      setPermissionDenied(false);
    } catch (err) {
      setMetrics(null);

      if (err?.status === 401 || err?.status === 403) {
        setPermissionDenied(true);
      }
    }

    try {
      const logsRaw = await adminFetchJSON('/api/v1/monitoring/logs');
      const logsData = logsRaw?.data?.logs || logsRaw?.logs || [];

      setLogs(Array.isArray(logsData) ? logsData : []);
    } catch {
      setLogs([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();

    const interval = setInterval(fetchData, 5000);

    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading && !health) return <Skel n={3} />;

  if (error || !health) {
    return (
      <div className="glass-card p-16">
        <Empty
          icon={AlertTriangle}
          title="Backend Offline"
          hint="Cannot connect to /api/v1/health. Check if the Node server and Cloudflare tunnel are running."
        />
      </div>
    );
  }

  const uptimeMins = Math.round((health.uptime || 0) / 60);
  const lastChecked = health.timestamp
    ? new Date(health.timestamp).toLocaleTimeString()
    : 'N/A';

  const totalReqs =
    metrics?.http?.totalRequests ?? metrics?.totalRequests ?? 'N/A';

  const errorCount =
    metrics?.http?.errorCount ?? metrics?.errorCount ?? 0;

  const cacheHits = metrics?.cache?.hits ?? metrics?.cacheHits ?? 0;

  const quota = metrics?.quota || {
    liveUsed: 0,
    liveRemaining: 0,
    ftUsed: 0,
    ftRemaining: 0,
    fallbackUsed: 0,
    fallbackRemaining: 0,
  };

  const quotaUsed =
    (quota.liveUsed || 0) +
    (quota.ftUsed || 0) +
    (quota.fallbackUsed || 0);

  const quotaRemaining =
    (quota.liveRemaining || 0) +
    (quota.ftRemaining || 0) +
    (quota.fallbackRemaining || 0);

  const quotaTotal = quotaUsed + quotaRemaining || 100;
  const quotaPercent = Math.min(100, Math.round((quotaUsed / quotaTotal) * 100));

  return (
    <div className="flex-col gap-16">
      <div className="glass-card p-16 flex-col gap-12">
        <h3 className="text-primary font-bold flex-center gap-8">
          <Cpu size={15} /> System Vitals
        </h3>

        <div
          className="grid gap-12"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}
        >
          <div className="glass-card p-12 flex-col items-center gap-4">
            <span className="font-extrabold text-primary text-lg">
              {health.status === 'healthy' ? '🟢' : '🔴'}
            </span>
            <span className="text-muted text-xs">API Status</span>
          </div>

          <div className="glass-card p-12 flex-col items-center gap-4">
            <span className="font-extrabold text-primary">{uptimeMins} min</span>
            <span className="text-muted text-xs">Uptime</span>
          </div>

          <div className="glass-card p-12 flex-col items-center gap-4">
            <span className="font-extrabold text-accent">{totalReqs}</span>
            <span className="text-muted text-xs">Total Requests</span>
          </div>

          <div className="glass-card p-12 flex-col items-center gap-4">
            <span className="font-extrabold text-gold">{cacheHits}</span>
            <span className="text-muted text-xs">Cache Hits</span>
          </div>

          <div className="glass-card p-12 flex-col items-center gap-4">
            <span className="font-extrabold text-danger">{errorCount}</span>
            <span className="text-muted text-xs">Active Errors</span>
          </div>
        </div>
      </div>

      {permissionDenied && (
        <div className="glass-card p-16 flex-center gap-12 text-center">
          <Lock size={16} className="text-gold" />
          <p className="text-muted text-sm">
            Admin monitoring metrics/logs require an authenticated admin account.
            Sign in as admin to view full system telemetry.
          </p>
        </div>
      )}

      <div className="glass-card p-16 flex-col gap-12">
        <h3 className="text-primary font-bold flex-center gap-8">
          <Zap size={15} /> API Quota Manager
        </h3>

        <div
          className="grid gap-12"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}
        >
          <div className="glass-card p-12 flex-col items-center gap-4">
            <span className="font-extrabold text-accent">
              {quota.liveUsed || 0} / {(quota.liveUsed || 0) + (quota.liveRemaining || 0)}
            </span>
            <span className="text-muted text-xs">Live Polls</span>
          </div>

          <div className="glass-card p-12 flex-col items-center gap-4">
            <span className="font-extrabold text-primary">
              {quota.ftUsed || 0} / {(quota.ftUsed || 0) + (quota.ftRemaining || 0)}
            </span>
            <span className="text-muted text-xs">FT Updates</span>
          </div>

          <div className="glass-card p-12 flex-col items-center gap-4">
            <span className="font-extrabold text-gold">
              {quota.fallbackUsed || 0} /{' '}
              {(quota.fallbackUsed || 0) + (quota.fallbackRemaining || 0)}
            </span>
            <span className="text-muted text-xs">Fallbacks</span>
          </div>
        </div>

        <div className="mt-16 bg-elevated h-10 rounded-md overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{
              width: `${quotaPercent}%`,
              background: quotaPercent > 90 ? 'var(--danger)' : 'var(--primary)',
            }}
          />
        </div>

        <p className="text-muted text-xs text-right mt-4">
          {quotaUsed} / {quotaTotal} Logical Calls Used Today
        </p>
      </div>

      <div className="glass-card p-16 flex-col gap-12">
        <div className="flex-between">
          <h3 className="text-primary font-bold flex-center gap-8">
            <Activity size={15} /> Network Operations Centre
          </h3>
          <span className="text-muted text-xs font-mono">
            Last Sync: {lastChecked}
          </span>
        </div>

        <button
          className="btn btn-secondary w-full flex-center gap-12 text-left"
          onClick={() => setIsTerminalOpen(true)}
        >
          <Terminal size={20} className="text-primary" />

          <div className="flex-1">
            <div className="text-primary font-bold text-sm">
              Access Live Terminal Logs
            </div>
            <div className="text-muted text-xs mt-2">
              {logs.length > 0
                ? `${logs.length} lines buffered`
                : permissionDenied
                ? 'Admin authentication required'
                : 'No active logs / endpoint missing'}
            </div>
          </div>

          <Wifi
            size={16}
            className={logs.length > 0 ? 'anim-spin text-primary' : 'text-muted'}
          />
        </button>
      </div>

      <TerminalModal
        isOpen={isTerminalOpen}
        onClose={() => setIsTerminalOpen(false)}
        logs={logs}
      />
    </div>
  );
});

export default SystemHealthTab;