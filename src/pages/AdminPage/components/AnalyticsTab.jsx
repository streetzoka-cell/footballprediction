import React, { memo } from 'react';
import { BarChart3, Eye, Users, MousePointerClick, TrendingUp } from 'lucide-react';
import { useAdminAnalytics } from '../../../hooks/useAdmin'; 
import { Skel } from './common';

const AnalyticsTab = memo(function AnalyticsTab() {
  // Leverage the optimized React Query hook (uses Firestore server-side counts)
  const { data: stats, isLoading: loading } = useAdminAnalytics();

  if (loading) return <Skel n={3} />;

  const totalUsers = stats?.totalUsers || 0;
  const totalPredictions = stats?.totalPredictions || 0;

  return (
    <div className="ae">
      <div className="asec">
        <h3 className="ast"><BarChart3 size={15} /> Platform Analytics</h3>
        <div className="asg">
          <div className="astat">
            <span className="n bl"><Users size={18} /></span>
            <span className="l">{totalUsers.toLocaleString()} Users</span>
          </div>
          <div className="astat">
            <span className="n gn"><MousePointerClick size={18} /></span>
            <span className="l">{totalPredictions.toLocaleString()} Predictions</span>
          </div>
          <div className="astat">
            <span className="n gd"><Eye size={18} /></span>
            <span className="l">Connect GA</span>
          </div>
          <div className="astat">
            <span className="n rd"><TrendingUp size={18} /></span>
            <span className="l">Growth</span>
          </div>
        </div>
        <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', margin: '12px 0 0', fontWeight: 600, lineHeight: 1.4 }}>
          For detailed page views, integrate Google Analytics API.
          <br />Currently displaying high-level Firestore stats.
        </p>
      </div>
    </div>
  );
});

export default AnalyticsTab;