import React, { useState, useEffect, memo } from 'react';
import { ScrollText, Activity, AlertTriangle } from 'lucide-react';
import { Skel, Empty } from './common';

const LogsTab = memo(function LogsTab() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/v1/system/status');
        if (!res.ok) throw new Error('Not found');
        const data = await res.json();
        setHealth(data);
        setError(false);
      } catch (err) {
        console.error('Log fetch error', err);
        setError(true);
      }
      setLoading(false);
    };
    
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !health) return <Skel n={3} />;

  if (error || !health) {
    return (
      <div className="ae">
        <div className="asec">
          <Empty 
            icon={AlertTriangle} 
            title="Backend Logs Unavailable" 
            hint="Ensure your backend server is running and the /api/v1/system/status route is active." 
          />
        </div>
      </div>
    );
  }

  return (
    <div className="ae">
      <div className="asec">
        <h3 className="ast"><Activity size={15} /> Network Operations Centre</h3>
        <div className="asg">
          <div className="astat">
            <span className="n" style={{ color: '#10b981' }}>{health?.status === 'healthy' ? '🟢' : '🔴'}</span>
            <span className="l">System Status</span>
          </div>
          <div className="astat">
            <span className="n bl">{health?.budget?.football ?? 'N/A'}</span>
            <span className="l">API Budget (Today)</span>
          </div>
          <div className="astat">
            <span className="n gn">{Math.round((health?.uptime || 0) / 60)} min</span>
            <span className="l">Backend Uptime</span>
          </div>
          <div className="astat">
            <span className="n gd">{health?.cache?.keys || 0}</span>
            <span className="l">Cache Keys</span>
          </div>
        </div>
      </div>
      
      <div className="asec">
        <h3 className="ast"><ScrollText size={15} /> Scheduler Jobs</h3>
        {health?.scheduler?.jobs && Object.entries(health.scheduler.jobs).map(([name, job]) => (
          <div key={name} className="aur">
            <span style={{ color: job.status === 'success' ? '#10b981' : job.status === 'error' ? '#ef4444' : '#64748b' }}>
              ● {name}
            </span>
            <span className="abdg pn" style={{ marginLeft: 'auto' }}>
              {job.status === 'running' ? 'Syncing...' : job.lastSync ? `Last: ${new Date(job.lastSync).toLocaleTimeString()}` : 'Never'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

export default LogsTab;