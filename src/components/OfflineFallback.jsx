import React from 'react';
import { Database, CloudOff, RefreshCw } from 'lucide-react';

export default function OfflineFallback({ onRetry, hasCachedData=false, lastUpdated=null }) {
  const timeAgo = (ts) => {
    if(!ts) return 'recently';
    const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if(mins < 1) return 'just now';
    if(mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

  return (
    <div className="zk-offline-fallback">
      <div className="zk-offline-card anim-pop">
        <div className="zk-offline-icon">
          {hasCachedData ? <Database size={36} className="text-primary" /> : <CloudOff size={36} className="text-danger" />}
        </div>
        <h1 className="zk-offline-title">{hasCachedData ? 'Offline Mode' : 'No Connection'}</h1>
        <p className="zk-offline-desc">
          {hasCachedData ? `Offline — showing data from ${timeAgo(lastUpdated)}.` : 'Connect to internet to load ZOKASCORE.'}
        </p>
        <button onClick={onRetry || (() => window.location.reload())} className="btn btn-primary">
          <RefreshCw size={16} /> Retry
        </button>
      </div>
    </div>
  );
}