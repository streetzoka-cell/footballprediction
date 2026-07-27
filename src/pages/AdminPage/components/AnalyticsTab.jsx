
import React, { useState, useEffect, memo } from 'react';
import { BarChart3, Eye, Users, MousePointerClick, TrendingUp } from 'lucide-react';
import { db } from '../../../utils/firebase';
import { collection, getDocs, limit as limitQ } from 'firebase/firestore';
import { Skel } from './common';

const AnalyticsTab = memo(function AnalyticsTab({ toast }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalUsers: 0, totalPredictions: 0, totalPageViews: 'N/A' });

  useEffect(() => {
    const fetchStats = async () => {
      if (!db) return;
      try {
        const userSnap = await getDocs(collection(db, 'users'), limitQ(1));
        const predSnap = await getDocs(collection(db, 'predictions_history'), limitQ(1));
        
        // Note: If you have Google Analytics connected, you would fetch it here.
        // We are mocking page views as we don't have the GA endpoint exposed here.
        setStats({
          totalUsers: userSnap.size, // This is exact if under 1 doc limit, otherwise it's just a boolean
          totalPredictions: predSnap.size,
          totalPageViews: 'Connect GA'
        });
      } catch (e) {
        toast('Analytics load failed: ' + e.message, 'er');
      }
      setLoading(false);
    };
    fetchStats();
  }, [toast]);

  if (loading) return <Skel n={3} />;

  return (
    <div className="ae">
      <div className="asec">
        <h3 className="ast"><BarChart3 size={15} /> Platform Analytics</h3>
        <div className="asg">
          <div className="astat">
            <span className="n bl"><Users size={18} /></span>
            <span className="l">{stats.totalUsers > 0 ? 'Has Users' : 'No Users'}</span>
          </div>
          <div className="astat">
            <span className="n gn"><MousePointerClick size={18} /></span>
            <span className="l">{stats.totalPredictions > 0 ? 'Has Preds' : 'No Preds'}</span>
          </div>
          <div className="astat">
            <span className="n gd"><Eye size={18} /></span>
            <span className="l">{stats.totalPageViews}</span>
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