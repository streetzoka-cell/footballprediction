import React, { memo } from 'react';
import { Activity, AlertTriangle, Cpu, Database, Zap, Clock } from 'lucide-react';
import { useSystemObservability } from '../../../hooks/useAdmin';
import { Skel, Empty } from './common';

const LogRow = memo(function LogRow({ log }) {
  const color = log.type === 'offline' || log.type === 'server_error' ? '#ef4444' : log.type === 'timeout' ? '#fbbf24' : '#94a3b8';
  return (
    <div className="aur" style={{ borderBottom: '1px solid var(--border)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '.72rem', fontWeight: 700, color: color, textTransform: 'uppercase' }}>
          {log.type || 'Error'}
        </span>
        <span style={{ fontSize: '.6rem', color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}>
          {new Date(log.timestamp).toLocaleTimeString()}
        </span>
      </div>
      <div style={{ fontSize: '.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{log.message}</div>
      {log.endpoint && <div style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>Endpoint: {log.endpoint}</div>}
    </div>
  );
});

const LogsTab = memo(function LogsTab() {
  const { apiMetrics, errorLogs, cacheHitRatio, apiSuccessRate, clearLogs } = useSystemObservability();

  const sortedMetrics = Object.entries(apiMetrics).sort((a, b) => b[1].avgLatency - a[1].avgLatency);

  return (
    <div className="ae">
      <div className="asec">
        <h3 className="ast"><Activity size={15} /> Network Operations Centre (NOC)</h3>
        <div className="asg">
          <div className="astat">
            <span className="n gn">{apiSuccessRate}%</span>
            <span className="l">API Success</span>
          </div>
          <div className="astat">
            <span className="n bl">{cacheHitRatio}%</span>
            <span className="l">Cache Hit Ratio</span>
          </div>
          <div className="astat">
            <span className="n rd">{errorLogs.length}</span>
            <span className="l">Active Errors</span>
          </div>
          <div className="astat">
            <span className="n gd">{Object.keys(apiMetrics).length}</span>
            <span className="l">Tracked Endpoints</span>
          </div>
        </div>
      </div>

      <div className="asec">
        <h3 className="ast"><Cpu size={15} /> API Latency Monitor</h3>
        {sortedMetrics.length === 0 ? (
          <Empty icon={Zap} title="No API calls tracked yet" hint="Make a request to see latency metrics." />
        ) : (
          <div className="aur" style={{ flexDirection: 'column', padding: 0 }}>
            {sortedMetrics.map(([endpoint, metrics]) => (
              <div key={endpoint} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{endpoint}</div>
                  <div style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>{metrics.count} calls · {metrics.failures} failed</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="abdg pn" style={{ background: metrics.avgLatency > 2000 ? 'rgba(239,68,68,.1)' : 'rgba(16,185,129,.1)', color: metrics.avgLatency > 2000 ? '#ef4444' : '#10b981' }}>
                    {Math.round(metrics.avgLatency)}ms
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="asec">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="ast" style={{ margin: 0 }}><AlertTriangle size={15} /> Error Logs</h3>
          {errorLogs.length > 0 && (
            <button className="ab ab-sm ab-gh" onClick={clearLogs}>Clear Logs</button>
          )}
        </div>
        <div style={{ marginTop: '12px' }}>
          {errorLogs.length === 0 ? (
            <Empty icon={Activity} title="No errors detected" hint="The application is running smoothly." />
          ) : (
            <div className="aur" style={{ flexDirection: 'column', padding: 0, maxHeight: '400px', overflowY: 'auto' }}>
              {errorLogs.map((log, i) => <LogRow key={i} log={log} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default LogsTab;