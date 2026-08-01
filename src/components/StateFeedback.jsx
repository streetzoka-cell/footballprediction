import React from 'react';
import { WifiOff, AlertCircle, RefreshCw } from 'lucide-react';
import { ERROR_TYPES } from '../utils/errorHandler';

export const SkeletonBox = ({ width = '100%', height = 16, radius = 8, mb = 8 }) => (
  <div 
    className="skeleton" 
    style={{ width, height, borderRadius: radius, marginBottom: mb }} 
  />
);

export const MatchCardSkeleton = () => (
  <div className="glass-card flex-col gap-8 p-16 mb-8">
    <div className="flex-between">
      <SkeletonBox width="60px" height={10} mb={0} />
      <SkeletonBox width="40px" height={12} radius={4} mb={0} />
    </div>
    <div className="flex-center gap-8">
      <SkeletonBox width={30} height={30} radius={8} mb={0} />
      <SkeletonBox width="70%" height={14} mb={0} />
    </div>
    <div className="flex-center gap-8">
      <SkeletonBox width={30} height={30} radius={8} mb={0} />
      <SkeletonBox width="50%" height={14} mb={0} />
    </div>
  </div>
);

export const ListSkeleton = ({ count = 5 }) => (
  <div>
    {Array.from({ length: count }).map((_, i) => <MatchCardSkeleton key={i} />)}
  </div>
);

export const ErrorState = ({ error, onRetry }) => {
  const isOffline = error?.type === ERROR_TYPES.OFFLINE;
  
  return (
    <div className="glass-card flex-col items-center gap-12 p-32 text-center">
      <div className="flex-center" style={{ width: 52, height: 52, borderRadius: '50%', background: isOffline ? 'rgba(var(--danger-rgb), 0.1)' : 'rgba(var(--gold-rgb), 0.1)', color: isOffline ? 'var(--danger)' : 'var(--gold)' }}>
        {isOffline ? <WifiOff size={24} /> : <AlertCircle size={24} />}
      </div>
      <div className="text-primary font-bold text-md">
        {isOffline ? 'Connection Lost' : 'Something went wrong'}
      </div>
      <div className="text-muted text-sm" style={{ maxWidth: 360, lineHeight: 1.5 }}>
        {error?.friendlyMessage || 'An unexpected error occurred while fetching data.'}
      </div>
      {onRetry && (
        <button className="btn btn-primary" onClick={onRetry}>
          <RefreshCw size={14} /> Retry
        </button>
      )}
    </div>
  );
};