import React from 'react';
import { Database, CloudOff, RefreshCw } from 'lucide-react';

export default function OfflineFallback({ onRetry, hasCachedData = false, lastUpdated = null }) {
  
  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'recently';
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} minute${mins > 1 ? 's' : ''} ago`;
    const hours = Math.floor(mins / 60);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  };

  return (
    <div className="zoka-page flex-center p-20">
      <div className="glass-card flex-col items-center text-center p-32 gap-16 anim-pop" style={{ maxWidth: '440px', width: '100%' }}>
        <div className="flex-center relative" style={{ width: 80, height: 80, borderRadius: 'var(--r-20)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div className="absolute inset-0 anim-pulse" style={{ background: hasCachedData ? 'rgba(var(--primary-rgb), 0.1)' : 'rgba(var(--danger-rgb), 0.1)' }}></div>
          {hasCachedData ? <Database size={36} className="text-primary" /> : <CloudOff size={36} className="text-danger" />}
        </div>
        
        <h1 className="text-primary font-extrabold text-md">
          {hasCachedData ? 'Offline Mode Active' : 'No Internet Connection'}
        </h1>
        
        <p className="text-muted text-sm" style={{ maxWidth: 360, lineHeight: 1.5 }}>
          {hasCachedData 
            ? `You're offline. Showing scores from ${formatTimeAgo(lastUpdated)}. Reconnect to refresh live data.`
            : 'ZOKASCORE needs an internet connection to load this page for the first time. Please check your network and try again.'
          }
        </p>

        <div className="badge gap-8" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: hasCachedData ? 'var(--primary)' : 'var(--danger)', boxShadow: `0 0 8px ${hasCachedData ? 'var(--primary)' : 'var(--danger)'}` }}></span>
          {hasCachedData ? 'Cached Data Available' : 'Awaiting Connection'}
        </div>

        <button onClick={onRetry || (() => window.location.reload())} className="btn btn-primary">
          <RefreshCw size={16} /> Retry Connection
        </button>
      </div>
    </div>
  );
}