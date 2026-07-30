import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Brain, Flame, Target, TrendingUp, ChevronRight } from 'lucide-react';
import { useFixtures } from '../hooks/useFixtures'; // ★ FIX: Use standard hook
import { todayStr, yesterdayStr, tomorrowStr } from '../utils/dates';
import SEO from '../components/SEO';
import MatchCard from '../components/MatchCard';
import EmptyState from '../components/EmptyState';

export default function MasterGames() {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  
  // ★ FIX: Fetch fixtures for the selected date using the standard hook
  const { data: dateMatches = [], isLoading } = useFixtures(selectedDate);
  
  // Smart Filtering: Only include matches that are Featured OR have High MatchScore
  const smartMatches = useMemo(() => {
    if (!dateMatches) return [];
    return dateMatches.filter(m => 
      m.category === 'FEATURED' || 
      (m.matchScore && m.matchScore > 50)
    ).sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  }, [dateMatches]);

  // Categorize for display based on match importance score
  const highConf = smartMatches.filter(m => (m.matchScore || 0) >= 80);
  const medConf = smartMatches.filter(m => {
    const score = m.matchScore || 0;
    return score >= 60 && score < 80;
  });
  const otherSmart = smartMatches.filter(m => (m.matchScore || 0) < 60);

  return (
    <div className="zoka-page">
      <SEO
  title="Football AI Predictions, Smart Value Picks & Match Intelligence"
  description="Discover AI-powered football predictions, high-confidence value picks, featured matches, and advanced match intelligence on ZOKASCORE."
  keywords="AI football predictions, smart football picks, value bets, football analytics, match intelligence, featured matches"
  path="/mastergames"
  robots="index,follow"
  breadcrumbs={[
    { name: "Home", path: "/" },
    { name: "Master Games", path: "/mastergames" }
  ]}
/>
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
                {highConf.map((m, i) => <MatchCard key={m.id} m={m} i={i} />)}
              </div>
            )}
            {medConf.length > 0 && (
              <div className="zoka-section">
                <div className="zoka-league-hd"><Target size={18} style={{ color: '#fbbf24' }} /><span className="zoka-league-name">Medium Confidence</span></div>
                {medConf.map((m, i) => <MatchCard key={m.id} m={m} i={i} />)}
              </div>
            )}
            {otherSmart.length > 0 && (
              <div className="zoka-section">
                <div className="zoka-league-hd"><TrendingUp size={18} style={{ color: '#3b82f6' }} /><span className="zoka-league-name">Smart Featured Matches</span></div>
                {otherSmart.map((m, i) => <MatchCard key={m.id} m={m} i={i} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}