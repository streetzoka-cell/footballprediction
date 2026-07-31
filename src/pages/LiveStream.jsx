import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ExternalLink, Tv, Search, Globe, Info,
  Play, Star, Shield, Radio, MonitorSmartphone, Wifi,
  ChevronRight, Zap, Eye, X, Bell, Clock, Signal, Crown
} from 'lucide-react';
import SEO from "../components/SEO";

/* ═══════════════════════════════════════════════════════════════
   DATA & CONFIG
   ═══════════════════════════════════════════════════════════════ */
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

// Mock Live Match Data for the Hero (In production, map this to real fixtures)
const LIVE_MATCH = {
  homeName: "Manchester United", homeLogo: "https://media.api-sports.io/football/teams/33.png",
  awayName: "Arsenal", awayLogo: "https://media.api-sports.io/football/teams/42.png",
  minute: 78, scoreHome: 1, scoreAway: 0,
  league: "Premier League", leagueLogo: "https://media.api-sports.io/football/leagues/39.png",
  stats: { possession: [55, 45], shots: [12, 8] },
  providers: [{ name: "Sky Sports", color: "#0072c6" }, { name: "Peacock", color: "#000000" }, { name: "SuperSport", color: "#009a44" }]
};

const UPCOMING_MATCHES = [
  { id: 1, time: Date.now() + 1000 * 60 * 60 * 2, homeName: "Chelsea", awayName: "Liverpool", league: "Premier League" },
  { id: 2, time: Date.now() + 1000 * 60 * 60 * 4, homeName: "Real Madrid", awayName: "Barcelona", league: "LaLiga" },
  { id: 3, time: Date.now() + 1000 * 60 * 60 * 24, homeName: "Bayern", awayName: "Dortmund", league: "Bundesliga" },
];

// Countdown Hook
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

/* ═══════════════════════════════════════════════════════════════
   COMPONENTS
   ═══════════════════════════════════════════════════════════════ */
function LiveMatchHero() {
  const [notify, setNotify] = useState(false);
  return (
    <div className="ls-hero-card">
      <div className="ls-hero-bg" style={{ background: `linear-gradient(135deg, ${LIVE_MATCH.league === 'Premier League' ? '#3d195b' : '#0f172a'}, var(--bg-deep))` }} />
      
      <div className="ls-hero-top">
        <div className="ls-hero-league">
          {LIVE_MATCH.leagueLogo && <img src={LIVE_MATCH.leagueLogo} alt="" />}
          <span>{LIVE_MATCH.league}</span>
        </div>
        <div className="ls-hero-live-badge">
          <span className="ls-pulse-dot" /> LIVE {LIVE_MATCH.minute}'
        </div>
      </div>

      <div className="ls-hero-teams">
        <div className="ls-hero-team">
          <img src={LIVE_MATCH.homeLogo} alt={LIVE_MATCH.homeName} />
          <span>{LIVE_MATCH.homeName}</span>
        </div>
        <div className="ls-hero-score">
          <span>{LIVE_MATCH.scoreHome} - {LIVE_MATCH.scoreAway}</span>
        </div>
        <div className="ls-hero-team">
          <img src={LIVE_MATCH.awayLogo} alt={LIVE_MATCH.awayName} />
          <span>{LIVE_MATCH.awayName}</span>
        </div>
      </div>

      <div className="ls-hero-stats">
        <div className="ls-stat-row">
          <span>{LIVE_MATCH.stats.possession[0]}%</span>
          <div className="ls-stat-bar"><div style={{ width: `${LIVE_MATCH.stats.possession[0]}%`, background: '#60a5fa' }} /></div>
          <span>{LIVE_MATCH.stats.possession[1]}%</span>
        </div>
        <div className="ls-stat-row">
          <span>{LIVE_MATCH.stats.shots[0]}</span>
          <span style={{fontSize:'.6rem', color:'#64748b'}}>SHOTS</span>
          <span>{LIVE_MATCH.stats.shots[1]}</span>
        </div>
      </div>

      <div className="ls-hero-providers">
        <span className="ls-providers-label">Available On:</span>
        <div className="ls-providers-logos">
          {LIVE_MATCH.providers.map(p => (
            <div key={p.name} className="ls-provider-chip" style={{ background: `${p.color}20`, border: `1px solid ${p.color}40`, color: '#fff' }}>
              {p.name}
            </div>
          ))}
        </div>
      </div>

      <button className="ls-watch-guide-btn">
        <Play size={14} fill="#fff" /> Open Watch Guide
      </button>
    </div>
  );
}

function UpcomingMatchCard({ match }) {
  const time = useCountdown(match.time);
  return (
    <div className="ls-upcoming-card">
      <div className="ls-upcoming-time">
        <Clock size={12} />
        {time.done ? 'Started' : `Starts in ${time.h}:${time.m}:${time.s}`}
      </div>
      <div className="ls-upcoming-teams">
        <span>{match.homeName}</span>
        <span className="ls-vs">VS</span>
        <span>{match.awayName}</span>
      </div>
      <div className="ls-upcoming-footer">
        <span className="ls-upcoming-league">{match.league}</span>
        <button className="ls-notify-btn" onClick={(e) => { e.currentTarget.classList.toggle('on'); }}>
          <Bell size={12} /> Notify Me
        </button>
      </div>
    </div>
  );
}

function ServiceCard({ s, i }) {
  const isLight = s.lightText;
  return (
    <a
      href={s.url}
      target="_blank"
      rel="noopener noreferrer"
      className="ls-service-card"
      style={{ animationDelay: `${i * 50}ms` }}
    >
      <div className="ls-card-accent" style={{ background: `linear-gradient(135deg, ${s.color}, ${s.color}80)` }} />
      
      <div className="ls-card-head">
        <div className="ls-provider-logo" style={{ background: `linear-gradient(135deg, ${s.color}, ${s.color}40)`, color: isLight ? '#111' : '#fff' }}>
          {s.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="ls-quality-badges">
          {s.quality.map(q => <span key={q} className="ls-q-badge">{q}</span>)}
          {s.tier === 'FREE' && <span className="ls-tier-free">FREE</span>}
          {s.tier === 'PREMIUM' && <span className="ls-tier-premium"><Crown size={8} /> PREMIUM</span>}
        </div>
      </div>

      <h3 className="ls-card-title">{s.name}</h3>
      <p className="ls-card-desc">{s.description}</p>

      <div className="ls-card-footer">
        <span className="ls-card-cats">{s.competitions}</span>
        <span className="ls-visit-btn">
          Visit <ExternalLink size={12} />
        </span>
      </div>
    </a>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */
export default function LiveStream() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedCountry, setSelectedCountry] = useState('ALL');
  const [searchFocused, setSearchFocused] = useState(false);

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

  return (
    <div className="ls-page">
      <SEO
        title="Live Football Matches, TV Guide & Streaming Information"
        description="Follow live football matches, kickoff times, live scores, and official TV and streaming information for major leagues and competitions on ZOKASCORE."
        keywords="live football matches, football TV guide, football streaming information, live soccer, live scores, football fixtures, watch football legally, ZOKASCORE"
        robots="index,follow"
        breadcrumbs={[{ name: "Home", path: "/" }, { name: "Live Stream", path: "/livestream" }]}
      />

      {/* Header */}
      <div className="ls-header">
        <div className="ls-header-inner">
          <div className="ls-logo-btn" onClick={() => window.location.href = '/'}>
            <div className="ls-logo-icon"><Tv size={16} /></div>
            <span>Live Streams</span>
          </div>
          <div className="ls-header-right">
            <MonitorSmartphone size={15} /> Official Partners
          </div>
        </div>
      </div>

      <div className="ls-container">
        
        {/* Title */}
        <div className="ls-title-wrap">
          <div className="ls-title-icon"><Tv size={28} /></div>
          <h1>Where to Watch Live Football</h1>
          <p>Official broadcasters and legal streaming platforms for football worldwide</p>
        </div>

        {/* Hero Live Match */}
        <LiveMatchHero />

        {/* Country Selector */}
        <div className="ls-country-wrap">
          <Globe size={16} className="ls-country-globe" />
          <div className="ls-country-scroll">
            {COUNTRIES.map(c => (
              <button 
                key={c.code} 
                className={`ls-country-btn ${selectedCountry === c.code ? 'on' : ''}`}
                onClick={() => setSelectedCountry(c.code)}
              >
                <span>{c.flag}</span> {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Upcoming Schedule */}
        <div className="ls-section-head">
          <Clock size={16} /> <span>Today's Schedule</span>
        </div>
        <div className="ls-upcoming-grid">
          {UPCOMING_MATCHES.map(m => <UpcomingMatchCard key={m.id} match={m} />)}
        </div>

        {/* Search */}
        <div className="ls-search-wrap">
          <Search size={18} className="ls-search-icon" style={{ color: searchFocused ? 'var(--accent)' : '#64748b' }} />
          <input
            type="text"
            placeholder="Search provider, league, or channel..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="ls-search-input"
          />
          {search && <button onClick={() => setSearch('')} className="ls-search-clear"><X size={14} /></button>}
        </div>

        {/* Filter Tabs */}
        <div className="ls-filter-tabs">
          {categories.map(cat => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`ls-filter-btn ${activeCategory === cat.key ? 'on' : ''}`}
            >
              <cat.Icon size={13} />
              {cat.label}
            </button>
          ))}
        </div>

        {/* Results Count */}
        <div className="ls-results-bar">
          <span>Showing <strong>{filteredServices.length}</strong> services</span>
          {(search || activeCategory !== 'all' || selectedCountry !== 'ALL') && (
            <button onClick={clearAll} className="ls-clear-btn"><X size={12} /> Clear filters</button>
          )}
        </div>

        {/* Services Grid */}
        {filteredServices.length === 0 ? (
          <div className="ls-empty-state">
            <Wifi size={24} />
            <h3>No services found</h3>
            <p>Try adjusting your search or country filter</p>
          </div>
        ) : (
          <div className="ls-services-grid">
            {filteredServices.map((s, i) => <ServiceCard key={s.id} s={s} i={i} />)}
          </div>
        )}

        {/* Partner Marquee */}
        <div className="ls-marquee-wrap">
          <div className="ls-marquee-track">
            {[...streamingServices, ...streamingServices].map((s, i) => (
              <div key={i} className="ls-marquee-item" style={{ color: s.color }}>
                <Signal size={12} /> {s.name}
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="ls-disclaimer">
          <Info size={16} className="ls-disclaimer-icon" />
          <p><strong>Regional availability:</strong> Streaming rights vary by country. These links direct to official platforms where you can find accurate local broadcasting information. We do not host or link to unofficial streams.</p>
        </div>

        {/* Footer */}
        <div className="ls-footer">
          <p>Football never sleeps. Official partners only. Updated every minute.</p>
          <span>Powered by ZOKASCORE Intelligence</span>
        </div>
      </div>
    </div>
  );
}