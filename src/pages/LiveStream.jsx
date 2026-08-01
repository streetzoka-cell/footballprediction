import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ExternalLink, Tv, Search, Globe, Info,
  Play, Star, Shield, Radio, MonitorSmartphone, Wifi,
  ChevronRight, Zap, Eye, X, Bell, Clock, Signal, Crown
} from 'lucide-react';
import SEO from "../components/SEO";

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

function LiveMatchHero() {
  return (
    <div className="glass-card flex-col gap-16 p-20 mb-24">
      <div className="flex-between">
        <div className="flex-center gap-8 text-muted text-xs font-bold">
          {LIVE_MATCH.leagueLogo && <img src={LIVE_MATCH.leagueLogo} alt="" width="16" height="16" />}
          <span>{LIVE_MATCH.league}</span>
        </div>
        <div className="badge badge-danger">
          <span className="zk-live-pulse-dot mr-2" /> LIVE {LIVE_MATCH.minute}'
        </div>
      </div>

      <div className="flex-between gap-12">
        <div className="flex-col items-center gap-8" style={{ width: '40%' }}>
          <img src={LIVE_MATCH.homeLogo} alt={LIVE_MATCH.homeName} width="48" height="48" />
          <span className="text-primary font-bold text-sm">{LIVE_MATCH.homeName}</span>
        </div>
        <div className="text-primary font-extrabold" style={{ fontSize: 'var(--fs-2xl)' }}>
          {LIVE_MATCH.scoreHome} - {LIVE_MATCH.scoreAway}
        </div>
        <div className="flex-col items-center gap-8" style={{ width: '40%' }}>
          <img src={LIVE_MATCH.awayLogo} alt={LIVE_MATCH.awayName} width="48" height="48" />
          <span className="text-primary font-bold text-sm">{LIVE_MATCH.awayName}</span>
        </div>
      </div>

      <div className="flex-col gap-8 mt-8">
        <div className="flex-between text-muted text-xs font-bold">
          <span>{LIVE_MATCH.stats.possession[0]}%</span>
          <span>POSSESSION</span>
          <span>{LIVE_MATCH.stats.possession[1]}%</span>
        </div>
        <div className="flex h-6 rounded-md overflow-hidden bg-elevated">
          <div style={{ width: `${LIVE_MATCH.stats.possession[0]}%`, background: 'var(--accent)' }}></div>
          <div style={{ width: `${LIVE_MATCH.stats.possession[1]}%`, background: 'var(--gold)' }}></div>
        </div>
      </div>

      <div className="flex-col gap-8 mt-8">
        <span className="text-muted text-xs font-bold">Available On:</span>
        <div className="flex gap-8 flex-wrap">
          {LIVE_MATCH.providers.map(p => (
            <div key={p.name} className="badge" style={{ background: `${p.color}20`, border: `1px solid ${p.color}40`, color: 'var(--text-primary)' }}>
              {p.name}
            </div>
          ))}
        </div>
      </div>

      <button className="btn btn-primary w-full mt-8">
        <Play size={14} fill="#fff" /> Open Watch Guide
      </button>
    </div>
  );
}

function UpcomingMatchCard({ match }) {
  const time = useCountdown(match.time);
  return (
    <div className="glass-card flex-col gap-8 p-12">
      <div className="flex-center gap-4 text-muted text-xs font-bold">
        <Clock size={12} />
        {time.done ? 'Started' : `Starts in ${time.h}:${time.m}:${time.s}`}
      </div>
      <div className="flex-center gap-8 text-primary font-bold text-sm">
        <span>{match.homeName}</span>
        <span className="text-muted text-xs">VS</span>
        <span>{match.awayName}</span>
      </div>
      <div className="flex-between">
        <span className="text-muted text-xs">{match.league}</span>
        <button className="btn btn-ghost btn-sm">
          <Bell size={12} /> Notify Me
        </button>
      </div>
    </div>
  );
}

function ServiceCard({ s, i }) {
  const isLight = s.lightText;
  return (
    <a href={s.url} target="_blank" rel="noopener noreferrer" className="glass-card flex-col gap-12 p-16 anim-fade-up" style={{ animationDelay: `${i * 50}ms`, textDecoration: 'none' }}>
      <div className="flex-between">
        <div className="flex-center gap-8 font-bold text-primary">
          <div className="flex-center" style={{ width: '32px', height: '32px', borderRadius: 'var(--r-8)', background: `linear-gradient(135deg, ${s.color}, ${s.color}40)`, color: isLight ? '#111' : '#fff', fontSize: '10px' }}>
            {s.name.slice(0, 2).toUpperCase()}
          </div>
          {s.name}
        </div>
        <div className="flex gap-4">
          {s.quality.map(q => <span key={q} className="badge badge-muted">{q}</span>)}
          {s.tier === 'FREE' && <span className="badge badge-primary">FREE</span>}
          {s.tier === 'PREMIUM' && <span className="badge badge-gold"><Crown size={8} /> PREMIUM</span>}
        </div>
      </div>
      <p className="text-muted text-sm">{s.description}</p>
      <div className="flex-between mt-8 pt-8" style={{ borderTop: '1px solid var(--border)' }}>
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
    <div className="zoka-page">
      <SEO
        title="Live Football Matches, TV Guide & Streaming Information"
        description="Follow live football matches, kickoff times, live scores, and official TV and streaming information for major leagues and competitions on ZOKASCORE."
        keywords="live football matches, football TV guide, football streaming information, live soccer, live scores, football fixtures, watch football legally, ZOKASCORE"
        robots="index,follow"
        />

      <div className="zoka-wrap">
        <div className="flex-col items-center gap-8 mb-24 mt-16">
          <div className="glass-card flex-center mb-12" style={{ width: '48px', height: '48px', borderRadius: 'var(--r-12)', background: 'rgba(var(--primary-rgb), 0.1)' }}>
            <Tv size={24} className="text-primary" />
          </div>
          <h1 className="text-primary font-extrabold">Where to Watch Live Football</h1>
          <p className="text-muted text-sm">Official broadcasters and legal streaming platforms for football worldwide</p>
        </div>

        <LiveMatchHero />

        <div className="glass-card flex-center gap-12 p-12 mb-24">
          <Globe size={16} className="text-muted" />
          <div className="flex gap-8 overflow-x-auto">
            {COUNTRIES.map(c => (
              <button key={c.code} className={`btn btn-sm ${selectedCountry === c.code ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSelectedCountry(c.code)}>
                <span>{c.flag}</span> {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-center gap-8 text-muted text-xs font-bold uppercase mb-12">
          <Clock size={16} /> <span>Today's Schedule</span>
        </div>
        <div className="grid gap-12 mb-24" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {UPCOMING_MATCHES.map(m => <UpcomingMatchCard key={m.id} match={m} />)}
        </div>

        <div className={`glass-card flex-center gap-12 p-12 mb-16 ${searchFocused ? 'border-primary' : ''}`}>
          <Search size={18} style={{ color: searchFocused ? 'var(--primary)' : 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search provider, league, or channel..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="flex-1 bg-transparent border-none outline-none text-primary text-sm"
          />
          {search && <button onClick={() => setSearch('')} className="btn-icon-sm"><X size={14} /></button>}
        </div>

        <div className="flex gap-8 mb-24 overflow-x-auto">
          {categories.map(cat => (
            <button key={cat.key} onClick={() => setActiveCategory(cat.key)} className={`btn btn-sm ${activeCategory === cat.key ? 'btn-primary' : 'btn-secondary'}`}>
              <cat.Icon size={13} /> {cat.label}
            </button>
          ))}
        </div>

        <div className="flex-between mb-16 text-muted text-xs">
          <span>Showing <strong className="text-primary">{filteredServices.length}</strong> services</span>
          {(search || activeCategory !== 'all' || selectedCountry !== 'ALL') && (
            <button onClick={clearAll} className="btn btn-ghost btn-sm"><X size={12} /> Clear filters</button>
          )}
        </div>

        {filteredServices.length === 0 ? (
          <div className="glass-card flex-col items-center gap-12 p-32 text-center">
            <Wifi size={24} className="text-muted" />
            <h3 className="text-primary font-bold">No services found</h3>
            <p className="text-muted text-sm">Try adjusting your search or country filter</p>
          </div>
        ) : (
          <div className="grid gap-16" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
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