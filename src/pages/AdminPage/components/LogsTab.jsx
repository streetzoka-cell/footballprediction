// footballprediction/src/pages/AdminPage/components/LogsTab.jsx

import React, { memo } from 'react';
import { Activity, AlertTriangle, Cpu, Zap } from 'lucide-react';
import { useSystemObservability } from '../../../hooks/useAdmin';
import { Skel, Empty } from './common';

const LogsTab = memo(function LogsTab() {
  const { apiMetrics, errorLogs, cacheHitRatio, apiSuccessRate, clearLogs } = useSystemObservability();
  const sortedMetrics = Object.entries(apiMetrics).sort((a, b) => b[1].avgLatency - a[1].avgLatency);

  return (
    <div className="flex-col gap-16">
      <div className="glass-card p-16 flex-col gap-12">
        <h3 className="text-primary font-bold flex-center gap-8"><Activity size={15} /> Network Operations Centre (NOC)</h3>
        <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
          <div className="glass-card p-12 flex-col items-center gap-4"><span className="font-extrabold text-primary">{apiSuccessRate}%</span><span className="text-muted text-xs">API Success</span></div>
          <div className="glass-card p-12 flex-col items-center gap-4"><span className="font-extrabold text-accent">{cacheHitRatio}%</span><span className="text-muted text-xs">Cache Hit Ratio</span></div>
          <div className="glass-card p-12 flex-col items-center gap-4"><span className="font-extrabold text-danger">{errorLogs.length}</span><span className="text-muted text-xs">Active Errors</span></div>
          <div className="glass-card p-12 flex-col items-center gap-4"><span className="font-extrabold text-gold">{Object.keys(apiMetrics).length}</span><span className="text-muted text-xs">Tracked Endpoints</span></div>
        </div>
      </div>

      <div className="glass-card p-16 flex-col gap-12">
        <h3 className="text-primary font-bold flex-center gap-8"><Cpu size={15} /> API Latency Monitor</h3>
        {sortedMetrics.length === 0 ? (
          <Empty icon={Zap} title="No API calls tracked yet" hint="Make a request to see latency metrics." />
        ) : (
          <div className="flex-col gap-8">
            {sortedMetrics.map(([endpoint, metrics]) => (
              <div key={endpoint} className="flex-between p-12 glass-card">
                <div className="flex-col gap-4">
                  <span className="text-primary font-bold text-sm">{endpoint}</span>
                  <span className="text-muted text-xs">{metrics.count} calls Â· {metrics.failures} failed</span>
                </div>
                <span className={`badge ${metrics.avgLatency > 2000 ? 'badge-danger' : 'badge-primary'}`}>{Math.round(metrics.avgLatency)}ms</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card p-16 flex-col gap-12">
        <div className="flex-between">
          <h3 className="text-primary font-bold flex-center gap-8"><AlertTriangle size={15} /> Error Logs</h3>
          {errorLogs.length > 0 && <button className="btn btn-ghost btn-sm" onClick={clearLogs}>Clear Logs</button>}
        </div>
        <div className="flex-col gap-8 max-h-400 overflow-y-auto">
          {errorLogs.length === 0 ? (
            <Empty icon={Activity} title="No errors detected" hint="The application is running smoothly." />
          ) : (
            errorLogs.map((log, i) => (
              <div key={i} className="glass-card p-12 flex-col gap-4">
                <div className="flex-between">
                  <span className={`badge ${log.type === 'offline' || log.type === 'server_error' ? 'badge-danger' : log.type === 'timeout' ? 'badge-gold' : 'badge-muted'}`}>{log.type || 'Error'}</span>
                  <span className="text-muted text-xs">{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
                <p className="text-secondary text-sm">{log.message}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
});

export default LogsTab;
