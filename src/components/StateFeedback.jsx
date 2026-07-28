// src/components/StateFeedback.jsx
import React from 'react';
import { WifiOff, AlertCircle, RefreshCw } from 'lucide-react';
import { ERROR_TYPES } from '../utils/errorHandler';

// ★ Centralized Skeleton Block
export const SkeletonBox = ({ width = '100%', height = 16, radius = 8, mb = 8 }) => (
  <div 
    className="zoka-skel" 
    style={{ width, height, borderRadius: radius, marginBottom: mb }} 
  />
);

// ★ Centralized Match Card Skeleton
export const MatchCardSkeleton = () => (
  <div className="zoka-sk-card">
    <div className="zoka-sk-row" style={{ justifyContent: 'space-between', marginBottom: '12px' }}>
      <SkeletonBox width="60px" height={10} mb={0} />
      <SkeletonBox width="40px" height={12} radius={4} mb={0} />
    </div>
    <div className="zoka-sk-row">
      <SkeletonBox width={30} height={30} radius={8} mb={0} />
      <SkeletonBox width="70%" height={14} mb={0} />
    </div>
    <div className="zoka-sk-row" style={{ marginTop: '8px' }}>
      <SkeletonBox width={30} height={30} radius={8} mb={0} />
      <SkeletonBox width="50%" height={14} mb={0} />
    </div>
  </div>
);

// ★ Centralized List Skeleton
export const ListSkeleton = ({ count = 5 }) => (
  <div>
    {Array.from({ length: count }).map((_, i) => <MatchCardSkeleton key={i} />)}
  </div>
);

// ★ Centralized Error State
export const ErrorState = ({ error, onRetry }) => {
  const isOffline = error?.type === ERROR_TYPES.OFFLINE;
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '36px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14 }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isOffline ? 'rgba(239,68,68,.1)' : 'rgba(245,197,66,.1)', color: isOffline ? '#ef4444' : 'var(--gold)' }}>
        {isOffline ? <WifiOff size={24} /> : <AlertCircle size={24} />}
      </div>
      <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
        {isOffline ? 'Connection Lost' : 'Something went wrong'}
      </div>
      <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', maxWidth: 360, lineHeight: 1.5, textAlign: 'center' }}>
        {error?.friendlyMessage || 'An unexpected error occurred while fetching data.'}
      </div>
      {onRetry && (
        <button 
          className="zoka-btn" 
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 8, background: '#10b981', color: '#fff', fontWeight: 600, fontSize: '.82rem', border: 'none' }} 
          onClick={onRetry}
        >
          <RefreshCw size={14} /> Retry
        </button>
      )}
    </div>
  );
};