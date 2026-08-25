import { useState, useMemo, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ExternalLink, Tv, Search, Globe, Info,
  Play, Shield, Radio, MonitorSmartphone, Wifi,
  ChevronRight, Zap, Eye, X, Bell, Clock, Signal, Crown, ArrowRight
} from 'lucide-react';

import SEO from "../components/SEO";
import AdSlot from '../components/AdSlot'; 
import { useFixtures } from '../hooks/useFixtures';
import { todayStr } from '../utils/dates';
import { buildMatchRoute } from '../utils/routes';
import { isLiveStatus, isFinishedStatus, SPORT } from '../utils/constants';

const COUNTRIES = [
  { code: 'ALL', name: 'Global', flag: '🌍' },
  { code: 'KE', name: 'Kenya', flag: '🇰🇪' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬' },
  { code: 'US', name: 'USA', flag: '🇺🇸' },
  { code: 'GB', name: 'UK', flag: '🇬🇧' },
];

const streamingServices = [
  { id: 1, name: "FIFA+", description: "Official FIFA platform with selected live matches, full match replays, highlights and original documentaries.", competitions: "World Cup, Club World Cup", category: "governing", color: "#dd2848", url: "https://www.plus.fifa.com", featured: true, tier: "FREE", quality: ["HD", "4K"], countries: ['ALL'] },
  { id: 2, name: "UEFA.tv", description: "Official UEFA platform featuring live matches, highlights, classic games and behind-the-scenes content.", competitions: "UCL, UEL, Euro, Nations League", category: "governing", color: "#00349e", url: "https://www.uefa.tv", featured: true, tier: "FREE", quality: ["HD"], countries: ['ALL'] },
  { id: 3, name: "Premier League", description: "Official PL website with live match center, comprehensive stats, highlights and official broadcaster listings.", competitions: "Premier League", category: "league", color: "#3d195b", url: "https://www.premierleague.com", featured: true, tier: "FREE", quality: ["HD"], countries: ['ALL'] },
  { id: 4, name: "beIN SPORTS", description: "Major sports broadcaster covering top European leagues, international tournaments and exclusive live coverage.", competitions: "Ligue 1, LaLiga, Serie A, CAF", category: "broadcaster", color: "#fa9000", url: "https://www.beinsports.com", featured: true, tier: "PREMIUM", quality: ["HD", "4K"], countries: ['KE', 'NG', 'ALL'] },
  { id: 5, name: "ESPN+", description: "Premium streaming service with extensive live football coverage including FA Cup, LaLiga, Bundesliga and MLS.", competitions: "FA Cup, LaLiga, Bundesliga, MLS", category: "broadcaster", color: "#d00d1e", url: "https://www.espn.com", featured: false, tier: "PREMIUM", quality: ["HD", "4K"], countries: ['US', 'ALL'] },
  { id: 6, name: "DAZN", description: "Global sports streaming platform with live coverage of top European leagues including Serie A and LaLiga.", competitions: "Serie A, LaLiga, Boxing", category: "broadcaster", color: "#f8f8f8", lightText: true, url: "https://www.dazn.com", featured: true, tier: "PREMIUM", quality: ["HD", "4K"], countries: ['US', 'GB', 'ALL'] },
  { id: 7, name: "Sky Sports", description: "Leading UK sports broadcaster with exclusive Premier League coverage, EFL matches, and comprehensive analysis.", competitions: "Premier League, EFL, Scottish Prem", category: "broadcaster", color: "#0072c6", url: "https://www.skysports.com", featured: false, tier: "PREMIUM", quality: ["HD", "4K"], countries: ['GB', 'ALL'] },
  { id: 8, name: "Paramount+", description: "Streaming service with Champions League, Europa League and Serie A rights in the United States.", competitions: "UCL, UEL, Serie A, NWSL", category: "broadcaster", color: "#0064ff", url: "https://www.paramountplus.com", featured: false, tier: "PREMIUM", quality: ["HD"], countries: ['US', 'ALL'] },
  { id: 9, name: "SuperSport", description: "Premier sports broadcaster in Sub-Saharan Africa, covering the English Premier League, LaLiga, and UCL.", competitions: "EPL, LaLiga, UCL, CAF", category: "broadcaster", color: "#009a44", url: "https://www.supersport.com", featured: true, tier: "PREMIUM", quality: ["HD", "4K"], countries: ['KE', 'NG', 'ALL'] },
  { id: 10, name: "ONEFOOTBALL", description: "Free-to-air platform legally streaming live football matches from top European leagues globally.", competitions: "Premier League, Serie A, LaLiga", category: "free", color: "var(--accent)", url: "https://www.onefootball.com", featured: true, tier: "FREE", quality: ["HD"], countries: ['ALL'] },
];

const categories = [
  { key: 'all', label: 'All', Icon: Tv },
  { key: 'governing', label: 'Official Bodies', Icon: Shield },
  { key: 'broadcaster', label: 'Broadcasters', Icon: Radio },
  { key: 'free', label: 'Free / Legal', Icon: Eye },
];

function useCountdown(targetDate) {
  const calc = () => {
    const diff = targetDate - Date.now();
    if (diff <= 0) return { h: '00', m: '00', s: '00', done: true };
    return {
      h: String(Math.floor(diff / 3600000)).padStart(2, '0'),
      m: String(Math.floor((diff / 60000) % 60)).padStart(2, '0'),
      s: String(Math.floor((diff / 1000) % 60)).padStart(2, '0'),
      done: false
    };
  };
  const [time, setTime] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setTime(calc()), 1000);
    return () => clearInterval(id);
  }, [targetDate]);
  return time;
}

function LiveMatchHero({ match }) {
  if (!match) return null;

  const isLive = isLiveStatus(match.status, SPORT.FOOTBALL) || match.isLive;
  const isFinished = isFinishedStatus(match.status, SPORT.FOOTBALL) || match.isFinished;
  
  return (
    <div className={`ls-live-hero ${isLive ? 'bg-danger-10' : ''}`}>
      <div className="ls-hero-top">
        <div className="flex-center gap-8 text-muted text-xs font-bold">
          {match.leagueLogo && <img src={match.leagueLogo} alt="" width="16" height="16" />}
          <span>{match.leagueName || 'Featured Match'}</span>
        </div>
        {isLive ? (
          <div className="badge badge-danger flex-center gap-4">
            <span className="zk-live-pulse-dot" /> LIVE {match.displayMinute || match.minute || 0}'
          </div>
        ) : isFinished ? (
          <div className="badge badge-primary">FULL TIME</div>
        ) : (
          <div className="badge badge-muted">{match.kickoff || 'Upcoming'}</div>
        )}
      </div>

      <div className="ls-hero-teams">
        <div className="ls-team flex-col items-center gap-8" style={{ width: '40%' }}>
          {match.homeLogo && <img src={match.homeLogo} alt={match.homeName} width="48" height="48" />}
          <span className="ls-team-name">{match.homeName}</span>
        </div>
        <div className="ls-score">
          {(isLive || isFinished) ? `${match.homeScore ?? 0} - ${match.awayScore ?? 0}` : 'VS'}
        </div>
        <div className="ls-team flex-col items-center gap-8" style={{ width: '40%' }}>
          {match.awayLogo && <img src={match.awayLogo} alt={match.awayName} width="48" height="48" />}
          <span className="ls-team-name">{match.awayName}</span>
        </div>
      </div>

      {match.stats && (match.stats.possession || match.stats.shots) ? (
        <div className="ls-stats-bar flex-col gap-8 mt-8">
          {match.stats.possession && (
            <div className="ls-stat">
              <span>{match.stats.possession.home}%</span>
              <span>POSSESSION</span>
              <span>{match.stats.possession.away}%</span>
            </div>
          )}
        </div>
      ) : (
        <div className="ls-stats-bar flex-col gap-8 mt-8 text-center">
           <span className="text-muted text-xs font-bold">Match statistics will be available shortly</span>
        </div>
      )}

      <div className="ls-available-on mt-8">
        <span>Available On (Check Local Listings):</span>
        <div className="badge" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
           Official Broadcasters
        </div>
      </div>

      <Link to={buildMatchRoute(match.id, match.homeName, match.awayName)} className="btn btn-primary w-full mt-8 flex-center gap-8">
        <Play size={14} fill="#fff" /> View Match Center & Stats
      </Link>
    </div>
  );
}

function UpcomingMatchCard({ match }) {
  const kickoffDate = match.date || match.kickoff;
  const targetTime = kickoffDate ? new Date(kickoffDate).getTime() : Date.now() + 3600000;
  const time = useCountdown(targetTime);
  
  return (
    <Link to={buildMatchRoute(match.id, match.homeName, match.awayName)} className="ls-upcoming-card anim-fade-up">
      <div className="ls-league-row flex-center gap-4 text-muted text-xs font-bold">
        <Clock size={12} />
        {time.done ? 'Started' : `Starts in ${time.h}h ${time.m}m`}
      </div>
      <div className="ls-teams-mini flex-center gap-8">
        <span className="truncate">{match.homeName}</span>
        <span className="text-muted text-xs">VS</span>
        <span className="truncate">{match.awayName}</span>
      </div>
      <div className="flex-between">
        <span className="text-muted text-xs truncate">{match.leagueName}</span>
        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.preventDefault(); /* Add notify logic */ }}>
          <Bell size={12} /> Notify
        </button>
      </div>
    </Link>
  );
}

function ServiceCard({ s, i }) {
  const isLight = s.lightText;
  return (
    <a href={s.url} target="_blank" rel="noopener noreferrer" className="ls-service-card anim-fade-up" style={{ animationDelay: `${i * 50}ms`, borderTopColor: s.color }}>
      <div className="ls-service-head flex-between">
        <div className="flex-center gap-8 font-bold text-primary">
          <div className="ls-service-logo" style={{ background: `linear-gradient(135deg, ${s.color}, ${s.color}40)`, color: isLight ? '#111' : '#fff' }}>
            {s.name.slice(0, 2).toUpperCase()}
          </div>
          {s.name}
        </div>
        <div className="flex gap-4">
          {s.quality.map(q => <span key={q} className="badge badge-muted">{q}</span>)}
          {s.tier === 'FREE' && <span className="badge badge-primary">FREE</span>}
          {s.tier === 'PREMIUM' && <span className="badge badge-gold flex-center gap-4"><Crown size={8} /> PREMIUM</span>}
        </div>
      </div>
      <p className="text-muted text-sm">{s.description}</p>
      <div className="flex-between mt-8 pt-8 border-t">
        <span className="text-muted text-xs">{s.competitions}</span>
        <span className="text-primary font-bold text-xs flex-center gap-4">Visit <ExternalLink size={12} /></span>
      </div>
    </a>
  );
}

export default function LiveStream() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedCountry, setSelectedCountry] = useState('ALL');
  const [searchFocused, setSearchFocused] = useState(false);

  const { data: fixtures = [], isLoading } = useFixtures(todayStr());

  const liveMatches = useMemo(() => fixtures.filter(m => isLiveStatus(m.status, SPORT.FOOTBALL) || m.isLive), [fixtures]);
  const upcomingMatches = useMemo(() => {
    return fixtures
      .filter(m => !isLiveStatus(m.status, SPORT.FOOTBALL) && !isFinishedStatus(m.status, SPORT.FOOTBALL) && !m.isLive && !m.isFinished)
      .sort((a, b) => new Date(a.date || a.kickoff) - new Date(b.date || b.kickoff))
      .slice(0, 4);
  }, [fixtures]);

  const featuredMatch = liveMatches.length > 0 ? liveMatches[0] : (upcomingMatches.length > 0 ? upcomingMatches[0] : null);

  const filteredServices = useMemo(() => {
    const q = search.toLowerCase().trim();
    return streamingServices.filter(s => {
      const matchSearch = !q || s.name.toLowerCase().includes(q) || s.competitions.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
      const matchCat = activeCategory === 'all' || s.category === activeCategory;
      const matchCountry = selectedCountry === 'ALL' || s.countries.includes(selectedCountry) || s.countries.includes('ALL');
      return matchSearch && matchCat && matchCountry;
    });
  }, [search, activeCategory, selectedCountry]);

  const clearAll = useCallback(() => { setSearch(''); setActiveCategory('all'); setSelectedCountry('ALL'); }, []);

  const itemListSchema = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Legal Football Streaming Services & TV Guide",
    "itemListElement": filteredServices.slice(0, 20).map((s, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": s.name,
      "url": s.url
    }))
  }), [filteredServices]);

  return (
    <div className="zoka-page">
      <SEO
        title="Live Football Matches, TV Guide & Streaming Information | ZOKASCORE"
        description="Follow live football matches, kickoff times, live scores, and official TV and streaming information for major leagues and competitions on ZOKASCORE."
        keywords="live football matches, football TV guide, football streaming information, live soccer, live scores, football fixtures, watch football legally, ZOKASCORE"
        robots="index,follow"
        structuredData={itemListSchema}
      />

      <div className="zoka-wrap">
        <div className="company-hero-card mt-16">
          <div className="company-hero-icon"><Tv size={24} /></div>
          <h1 className="text-primary font-extrabold">Where to Watch Live Football</h1>
          <p className="text-muted text-sm">Official broadcasters and legal streaming platforms for football worldwide</p>
        </div>

        <div className="company-card mb-24" style={{ borderLeft: '4px solid var(--primary)' }}>
          <h2 className="text-primary font-bold text-lg mb-8">The Ultimate Legal Streaming Guide</h2>
          <p className="text-secondary text-sm leading-relaxed">
            Finding where to watch your favorite football teams shouldn't be a hassle. ZOKASCORE aggregates official broadcasting rights, free-to-air platforms, and premium sports networks globally. Whether you are looking for UEFA Champions League rights in the US, Premier League coverage in the UK, or free FIFA+ documentaries, our directory ensures you only access safe, legal, and high-definition streams.
          </p>
        </div>

        {isLoading ? (
          <div className="skeleton mb-24" style={{ width: '100%', height: 300, borderRadius: 'var(--r-16)' }} />
        ) : (
          <LiveMatchHero match={featuredMatch} />
        )}

        <div className="glass-card flex-center gap-12 p-12 mb-24">
          <Globe size={16} className="text-muted" />
          <div className="ls-filter-row">
            {COUNTRIES.map(c => (
              <button key={c.code} className={`filter-btn ${selectedCountry === c.code ? 'active' : ''}`} onClick={() => setSelectedCountry(c.code)}>
                <span>{c.flag}</span> {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-center gap-8 text-muted text-xs font-bold uppercase mb-12">
          <Clock size={16} /> <span>Today's Upcoming Matches</span>
        </div>
        
        {isLoading ? (
           <div className="admin-grid-200 mb-24">
             {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 'var(--r-12)' }} />)}
           </div>
        ) : upcomingMatches.length > 0 ? (
          <div className="admin-grid-200 mb-24">
            {upcomingMatches.map(m => <UpcomingMatchCard key={m.id} match={m} />)}
          </div>
        ) : (
          <div className="zk-empty-state glass-card mb-24">
             <Clock size={24} className="text-muted mb-8" />
             <p className="text-muted text-sm">No upcoming matches scheduled for today.</p>
          </div>
        )}

        <AdSlot id="live-stream-ad-1" mobile={true} desktop={true} />

        <div className={`ls-search-bar ${searchFocused ? 'focused' : ''}`}>
          <Search size={18} className={searchFocused ? 'text-primary' : 'text-muted'} />
          <input
            type="text"
            placeholder="Search provider, league, or channel..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          {search && <button onClick={() => setSearch('')} className="btn-icon-sm"><X size={14} /></button>}
        </div>

        <div className="ls-filter-row mb-24">
          {categories.map(cat => (
            <button key={cat.key} onClick={() => setActiveCategory(cat.key)} className={`filter-btn ${activeCategory === cat.key ? 'active' : ''}`}>
              <cat.Icon size={13} /> {cat.label}
            </button>
          ))}
        </div>

        <div className="ls-showing-count mb-16">
          <span>Showing <strong className="text-primary">{filteredServices.length}</strong> services</span>
          {(search || activeCategory !== 'all' || selectedCountry !== 'ALL') && (
            <button onClick={clearAll} className="btn btn-ghost btn-sm"><X size={12} /> Clear filters</button>
          )}
        </div>

        {filteredServices.length === 0 ? (
          <div className="zk-empty-state glass-card">
            <Wifi size={24} className="text-muted mb-8" />
            <h3 className="text-primary font-bold">No services found</h3>
            <p className="text-muted text-sm">Try adjusting your search or country filter</p>
          </div>
        ) : (
          <div className="ls-service-grid">
            {filteredServices.map((s, i) => <ServiceCard key={s.id} s={s} i={i} />)}
          </div>
        )}

        <div className="glass-card flex-center gap-12 p-16 mt-24 text-muted text-xs">
          <Info size={16} className="text-primary" />
          <p><strong>Regional availability:</strong> Streaming rights vary by country. These links direct to official platforms where you can find accurate local broadcasting information. We do not host or link to unofficial streams.</p>
        </div>
      </div>
    </div>
  );
}