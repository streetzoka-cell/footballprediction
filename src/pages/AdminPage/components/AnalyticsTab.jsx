import React, { memo } from 'react';
import { BarChart3, Eye, Users, MousePointerClick, TrendingUp } from 'lucide-react';
import { useAdminAnalytics } from '../../../hooks/useAdmin'; 
import { Skel } from './common';

const AnalyticsTab = memo(function AnalyticsTab() {
  const { data: stats, isLoading: loading } = useAdminAnalytics();

  if (loading) return <Skel n={3} />;

  const totalUsers = stats?.totalUsers || 0;
  const totalPredictions = stats?.totalPredictions || 0;

  return (
    <div className="glass-card p-16 flex flex-col gap-12">
      <h3 className="text-primary font-bold flex-center gap-8"><BarChart3 size={15} /> Platform Analytics</h3>
      <div className="admin-grid-150">
        <div className="glass-card p-12 flex flex-col items-center gap-4">
          <Users size={18} className="text-accent" />
          <span className="font-extrabold text-primary">{totalUsers.toLocaleString()}</span>
          <span className="text-muted text-xs">Users</span>
        </div>
        <div className="glass-card p-12 flex flex-col items-center gap-4">
          <MousePointerClick size={18} className="text-primary" />
          <span className="font-extrabold text-primary">{totalPredictions.toLocaleString()}</span>
          <span className="text-muted text-xs">Predictions</span>
        </div>
        <div className="glass-card p-12 flex flex-col items-center gap-4">
          <Eye size={18} className="text-gold" />
          <span className="font-extrabold text-primary">Connect GA</span>
          <span className="text-muted text-xs">Page Views</span>
        </div>
        <div className="glass-card p-12 flex flex-col items-center gap-4">
          <TrendingUp size={18} className="text-danger" />
          <span className="font-extrabold text-primary">Growth</span>
          <span className="text-muted text-xs">Analytics</span>
        </div>
      </div>
      <p className="text-muted text-xs mt-8">For detailed page views, integrate Google Analytics API. Currently displaying high-level Firestore stats.</p>
    </div>
  );
});

export default AnalyticsTab;