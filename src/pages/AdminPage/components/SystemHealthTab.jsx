import React, { useState, useEffect, memo } from 'react';
import { Cpu, Database, AlertTriangle } from 'lucide-react';
import { Skel, Empty } from './common';

const SystemHealthTab = memo(function SystemHealthTab() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('/health');
        if (!res.ok) throw new Error('Not found');
        const data = await res.json();
        setHealth(data);
        setError(false);
      } catch (err) {
        console.error('Health fetch error', err);
        setError(true);
      }
      setLoading(false);
    };
    
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !health) return <Skel n={3} />;

  if (error || !health) {
    return (
      <div className="ae">
        <div className="asec">
          <Empty 
            icon={AlertTriangle} 
            title="System Health Unavailable" 
            hint="Cannot connect to the /health endpoint. Make sure the backend is online." 
          />
        </div>
      </div>
    );
  }

  return (
    <div className="ae">
      <div className="asec">
        <h3 className="ast"><Cpu size={15} /> Health Check</h3>
        <div className="asg">
          <div className="astat">
            <span className="n" style={{ color: '#10b981' }}>{health?.status === 'healthy' ? '🟢' : '🔴'}</span>
            <span className="l">Overall Status</span>
          </div>
          <div className="astat">
            <span className="n bl">{health?.budget?.football ?? 'N/A'}</span>
            <span className="l">Football Budget</span>
          </div>
          <div className="astat">
            <span className="n gn">{health?.budget?.basketball ?? 'N/A'}</span>
            <span className="l">Basketball Budget</span>
          </div>
          <div className="astat">
            <span className="n gd">{health?.uptime ? Math.round(health.uptime / 60) : 0} min</span>
            <span className="l">Uptime</span>
          </div>
        </div>
      </div>
      
      <div className="asec">
        <h3 className="ast"><Database size={15} /> Cache Stats</h3>
        <div className="aur">
          <span style={{ color: 'var(--text-muted)' }}>Total Keys</span>
          <span className="abdg bl">{health?.cache?.keys || 0}</span>
        </div>
        <div className="aur">
          <span style={{ color: 'var(--text-muted)' }}>Hits</span>
          <span className="abdg gn">{health?.cache?.hits || 0}</span>
        </div>
        <div className="aur">
          <span style={{ color: 'var(--text-muted)' }}>Misses</span>
          <span className="abdg rd">{health?.cache?.misses || 0}</span>
        </div>
      </div>
    </div>
  );
});

export default SystemHealthTab;