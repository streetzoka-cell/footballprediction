import React, { useState, useEffect, memo, useRef, useCallback } from 'react';
import { Cpu, AlertTriangle, Activity, Terminal, X, Wifi, Zap } from 'lucide-react';
import { footballApi } from '../../../services/footballApi';
import { Skel, Empty } from './common';

const TerminalModal = ({ isOpen, onClose, logs }) => {
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    if (isOpen && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#050505', border: '1px solid var(--accent-glow-strong)', width: '90vw', maxWidth: '900px', height: '70vh', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 0 40px rgba(var(--accent-rgb), 0.15)', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: 'rgba(var(--accent-rgb), 0.05)', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)', fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: '0.85rem' }}>
            <Terminal size={14} /> root@zoka-api:~/logs$           </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', color: '#00ff00', fontFamily: 'ui-monospace, monospace', fontSize: '0.8rem', lineHeight: 1.5, textShadow: '0 0 5px rgba(0, 255, 0, 0.3)' }}>
          {logs.length === 0 ? (
            <div style={{ color: '#64748b' }}>Waiting for data stream...</div>
          ) : (
            logs.map((line, i) => <div key={i} style={{ marginBottom: '4px', opacity: 0.9 }}>{`> ${line}`}</div>)
          )}
          <div style={{ height: '20px', display: 'flex', alignItems: 'center' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '14px', background: '#00ff00', animation: 'blink 1s step-end infinite' }}></span>
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
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const healthData = await footballApi.getHealth();
      setHealth(healthData);
      
      try {
        const metricsRes = await fetch('https://api.zokascore.xyz/api/v1/monitoring/metrics');
        if (metricsRes.ok) setMetrics(await metricsRes.json());
      } catch (e) { /* Ignore */ }

      try {
        const logsRes = await fetch('https://api.zokascore.xyz/api/v1/monitoring/logs');
        if (logsRes.ok) {
          const logsData = await logsRes.json();
          setLogs(Array.isArray(logsData) ? logsData : (logsData.logs || []));
        }
      } catch (e) { /* Ignore */ }

      setError(false);
    } catch (err) {
      console.error('Health fetch error:', err.message);
      setError(true);
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
      <div className="ae">
        <div className="asec">
          <Empty 
            icon={AlertTriangle} 
            title="Backend Offline" 
            hint="Cannot connect to /api/v1/health. Check if the Node server and Cloudflare tunnel are running." 
          />
        </div>
      </div>
    );
  }

  const uptimeMins = Math.round((health.uptime || 0) / 60);
  const lastChecked = health.timestamp ? new Date(health.timestamp).toLocaleTimeString() : 'N/A';
  const totalReqs = metrics?.totalRequests ?? 'N/A';
  const errorCount = metrics?.errorCount ?? 0;
  const cacheHits = metrics?.cacheHits ?? 0;

  // ★ NEW: Extract Quota Stats
  const quota = metrics?.quota || { liveUsed: 0, liveRemaining: 77, ftUsed: 0, ftRemaining: 12, fallbackUsed: 0, fallbackRemaining: 3 };

  return (
    <div className="ae">
      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes pulse-green { 0% { box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0.4); } 70% { box-shadow: 0 0 0 10px rgba(var(--accent-rgb), 0); } 100% { box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0); } }
      `}</style>

      <div className="asec">
        <h3 className="ast"><Cpu size={15} /> System Vitals</h3>
        <div className="asg">
          <div className="astat">
            <span className="n" style={{ color: 'var(--accent)', animation: 'pulse-green 2s infinite' }}>
              {health.status === 'healthy' ? '🟢' : '🔴'}
            </span>
            <span className="l">API Status</span>
          </div>
          <div className="astat">
            <span className="n gn">{uptimeMins} min</span>
            <span className="l">Uptime</span>
          </div>
          <div className="astat">
            <span className="n bl">{totalReqs}</span>
            <span className="l">Total Requests</span>
          </div>
          <div className="astat">
            <span className="n gd">{cacheHits}</span>
            <span className="l">Cache Hits</span>
          </div>
          <div className="astat">
            <span className="n rd">{errorCount}</span>
            <span className="l">Active Errors</span>
          </div>
        </div>
      </div>

      {/* ★ NEW: Logical API Budget Section */}
      <div className="asec">
        <h3 className="ast"><Zap size={15} /> API Quota Manager (100/Day)</h3>
        <div className="asg">
          <div className="astat">
            <span className="n bl">{quota.liveUsed} / {quota.liveUsed + quota.liveRemaining}</span>
            <span className="l">Live Polls</span>
          </div>
          <div className="astat">
            <span className="n gn">{quota.ftUsed} / {quota.ftUsed + quota.ftRemaining}</span>
            <span className="l">FT Updates (2h)</span>
          </div>
          <div className="astat">
            <span className="n gd">{quota.fallbackUsed} / {quota.fallbackUsed + quota.fallbackRemaining}</span>
            <span className="l">FD Fallbacks</span>
          </div>
        </div>
        
        <div style={{ marginTop: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', height: '10px', overflow: 'hidden' }}>
          <div 
            style={{ 
              width: `${((quota.liveUsed + quota.ftUsed + quota.fallbackUsed) / 100) * 100}%`, 
              height: '100%', 
              background: (quota.liveUsed + quota.ftUsed + quota.fallbackUsed) > 90 ? '#ef4444' : 'var(--accent)',
              transition: 'width 0.5s ease'
            }} 
          />
        </div>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '6px', textAlign: 'right' }}>
          {quota.liveUsed + quota.ftUsed + quota.fallbackUsed} / 100 Logical Calls Used Today
        </p>
      </div>

      <div className="asec">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="ast" style={{ margin: 0 }}><Activity size={15} /> Network Operations Centre</h3>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}>Last Sync: {lastChecked}</span>
        </div>
        
        <button 
          onClick={() => setIsTerminalOpen(true)}
          style={{
            marginTop: '16px', width: '100%', padding: '16px', 
            background: 'linear-gradient(135deg, rgba(0,0,0,0.8), rgba(16,185,129,0.05))', 
            border: '1px solid var(--accent-glow-strong)', borderRadius: '10px', 
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', 
            color: 'var(--accent)', fontFamily: 'ui-monospace, monospace', fontWeight: 700, textAlign: 'left'
          }}
        >
          <Terminal size={20} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.9rem' }}>Access Live Terminal Logs</div>
            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
              {logs.length > 0 ? `${logs.length} lines buffered` : 'No active logs / endpoint missing'}
            </div>
          </div>
          <Wifi size={16} className={logs.length > 0 ? 'zoka-spin' : ''} style={logs.length > 0 ? { color: 'var(--accent)' } : { color: '#64748b' }} />
        </button>
      </div>

      <TerminalModal isOpen={isTerminalOpen} onClose={() => setIsTerminalOpen(false)} logs={logs} />
    </div>
  );
});

export default SystemHealthTab;