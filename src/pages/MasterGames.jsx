import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Brain, Flame, Target, TrendingUp, ChevronRight } from 'lucide-react';
import { useEngineGlobalMatches } from '../zokascore_engine/hooks';
import { todayStr, yesterdayStr, tomorrowStr } from '../utils/dates';
import SEO from '../components/SEO';
import MatchCard from '../components/MatchCard';
import EmptyState from '../components/EmptyState';

export default function MasterGames() {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const { data: allMatches = [], isLoading } = useEngineGlobalMatches();
  
  const dateMatches = useMemo(() => {
    return allMatches.filter(m => m.dateStr === selectedDate);
  }, [allMatches, selectedDate]);

  // Smart Filtering: Only include matches that are Featured OR have AI Probabilities OR High MatchScore
  const smartMatches = useMemo(() => {
    return dateMatches.filter(m => 
      m.category === 'FEATURED' || 
      m.homeWinProb != null || 
      m.matchScore > 50
    ).sort((a, b) => (b.importance || 0) - (a.importance || 0));
  }, [dateMatches]);

  // Categorize for display
  const highConf = smartMatches.filter(m => Math.max(m.homeWinProb || 0, m.awayWinProb || 0) >= 55);
  const medConf = smartMatches.filter(m => {
    const max = Math.max(m.homeWinProb || 0, m.awayWinProb || 0);
    return max >= 40 && max < 55;
  });
  const otherSmart = smartMatches.filter(m => Math.max(m.homeWinProb || 0, m.awayWinProb || 0) < 40);

  return (
    <div className="zoka-page">
      <SEO title="Football AI Predictions, Smart Value Picks & Match Intelligence" />
      <div className="zoka-wrap">
        <div className="zoka-hdr">
          <div className="zoka-hdr-title">
            <h1><Brain size={18} style={{ color: '#10b981' }} /> Zoka <span>Intelligence</span></h1>
            <div className="zoka-hdr-sub">{smartMatches.length} Smart Matches Found</div>
          </div>
        </div>

        <div className="zoka-datenav">
          <button className={`zoka-nav-btn ${selectedDate === yesterdayStr() ? 'active' : ''}`} onClick={() => setSelectedDate(yesterdayStr())}>Yesterday</button>
          <button className={`zoka-nav-btn ${selectedDate === todayStr() ? 'active' : ''}`} onClick={() => setSelectedDate(todayStr())}>Today</button>
          <button className={`zoka-nav-btn ${selectedDate === tomorrowStr() ? 'active' : ''}`} onClick={() => setSelectedDate(tomorrowStr())}>Tomorrow</button>
        </div>

        {isLoading && smartMatches.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading Smart Matches...</div>
        ) : smartMatches.length === 0 ? (
          <EmptyState icon={Brain} title="No smart matches or AI predictions available for this date." hint="Check back later or view all standard fixtures." action={<Link to="/fixtures" className="zoka-cta" style={{ display: 'inline-block', marginTop: 16, padding: '10px 20px', borderRadius: 8, background: 'rgba(16,185,129,.1)', color: '#10b981', textDecoration: 'none', fontWeight: 700, fontSize: '.85rem' }}>View All Fixtures <ChevronRight size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /></Link>} />
        ) : (
          <>
            {highConf.length > 0 && (
              <div className="zoka-section">
                <div className="zoka-league-hd"><Flame size={18} style={{ color: '#ef4444' }} /><span className="zoka-league-name">High Confidence Value</span></div>
                {highConf.map((m, i) => <MatchCard key={m.id} match={m} index={i} />)}
              </div>
            )}
            {medConf.length > 0 && (
              <div className="zoka-section">
                <div className="zoka-league-hd"><Target size={18} style={{ color: '#fbbf24' }} /><span className="zoka-league-name">Medium Confidence</span></div>
                {medConf.map((m, i) => <MatchCard key={m.id} match={m} index={i} />)}
              </div>
            )}
            {otherSmart.length > 0 && (
              <div className="zoka-section">
                <div className="zoka-league-hd"><TrendingUp size={18} style={{ color: '#3b82f6' }} /><span className="zoka-league-name">Smart Featured Matches</span></div>
                {otherSmart.map((m, i) => <MatchCard key={m.id} match={m} index={i} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}