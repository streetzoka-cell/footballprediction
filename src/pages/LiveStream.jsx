// FILE: src/pages/LiveStream.jsx
import { useState, useMemo, useCallback } from 'react';
import {
  ExternalLink, Tv, Search, Globe, Filter, X, Info,
  Play, Star, Shield, Radio, MonitorSmartphone, Wifi,
  ChevronRight, Zap, Eye
} from 'lucide-react';
import SEO from "../components/SEO";

/* ═══════════════════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════════════════ */
const streamingServices = [
  { id: 1, name: "FIFA+", description: "Official FIFA platform with selected live matches, full match replays, highlights and original documentaries from World Cups and international competitions.", competitions: "World Cup, Club World Cup", category: "governing", color: "#dd2848", url: "https://www.plus.fifa.com", featured: true },
  { id: 2, name: "UEFA.tv", description: "Official UEFA platform featuring live matches, highlights, classic games and behind-the-scenes content from Champions League, Europa League and Euro.", competitions: "UCL, UEL, Euro, Nations League", category: "governing", color: "#00349e", url: "https://www.uefa.tv", featured: true },
  { id: 3, name: "Premier League", description: "Official PL website with live match center, comprehensive stats, highlights and official broadcaster listings sorted by your country.", competitions: "Premier League", category: "league", color: "#3d195b", url: "https://www.premierleague.com", featured: true },
  { id: 4, name: "LaLiga", description: "Official LaLiga platform with live scoring, match replays, news and complete broadcaster information for Spain's top division.", competitions: "LaLiga, Copa del Rey", category: "league", color: "#ee8707", url: "https://www.laliga.com", featured: false },
  { id: 5, name: "Serie A", description: "Official Serie A website with live match tracker, video highlights, broadcaster details and in-depth statistics for Italy's top flight.", competitions: "Serie A, Coppa Italia", category: "league", color: "#024494", url: "https://www.legaseriea.it", featured: false },
  { id: 6, name: "Bundesliga", description: "Official Bundesliga platform with live match center, highlights, official streaming partners and comprehensive stats for Germany's top division.", competitions: "Bundesliga, DFB-Pokal", category: "league", color: "#d20515", url: "https://www.bundesliga.com", featured: false },
  { id: 7, name: "Ligue 1", description: "Official Ligue 1 website with live match updates, video highlights, TV schedule and official broadcasting partner details for French football.", competitions: "Ligue 1, Coupe de France", category: "league", color: "#091c3e", url: "https://www.ligue1.com", featured: false },
  { id: 8, name: "beIN SPORTS", description: "Major sports broadcaster covering top European leagues, international tournaments and exclusive live coverage in MENA, France, and other regions.", competitions: "Ligue 1, LaLiga, Serie A, CAF", category: "broadcaster", color: "#fa9000", url: "https://www.beinsports.com", featured: true },
  { id: 9, name: "ESPN+", description: "Premium streaming service with extensive live football coverage including FA Cup, LaLiga, Bundesliga, Eredivisie and MLS matches.", competitions: "FA Cup, LaLiga, Bundesliga, MLS", category: "broadcaster", color: "#d00d1e", url: "https://www.espn.com", featured: false },
  { id: 10, name: "DAZN", description: "Global sports streaming platform with live coverage of top European leagues including Serie A, Ligue 1, LaLiga and major fight nights.", competitions: "Serie A, Ligue 1, LaLiga, Boxing", category: "broadcaster", color: "#f8f8f8", lightText: true, url: "https://www.dazn.com", featured: true },
  { id: 11, name: "Sky Sports", description: "Leading UK sports broadcaster with exclusive Premier League coverage, EFL matches, and comprehensive football analysis and highlights.", competitions: "Premier League, EFL, Scottish Prem", category: "broadcaster", color: "#0072c6", url: "https://www.skysports.com", featured: false },
  { id: 12, name: "Paramount+", description: "Streaming service with Champions League, Europa League and Serie A rights in the United States, plus original football programming.", competitions: "UCL, UEL, Serie A, NWSL", category: "broadcaster", color: "#0064ff", url: "https://www.paramountplus.com", featured: false },
  { id: 13, name: "fuboTV", description: "Sports-first streaming TV service with access to beIN, ESPN, and regional sports networks for comprehensive football coverage.", competitions: "Multiple leagues via channel add-ons", category: "broadcaster", color: "#7800ff", url: "https://www.fubo.tv", featured: false },
  { id: 14, name: "ONEFOOTBALL", description: "Free-to-air platform legally streaming live football matches from top European leagues to millions of fans globally.", competitions: "Premier League, Serie A, Ligue 1, LaLiga", category: "free", color: "#10b981", url: "https://www.onefootball.com", featured: true },
  { id: 15, name: "CONCACAF GO", description: "Official CONCACAF streaming platform for Champions League, Gold Cup, and World Cup qualifiers across North and Central America.", competitions: "Concacaf CL, Gold Cup, WCQ", category: "governing", color: "#003876", url: "https://www.concacafgo.com", featured: false },
  { id: 16, name: "CAF TV", description: "Confederation of African Football's official platform for streaming AFCON, Champions League and World Cup qualifying matches.", competitions: "AFCON, CAF CL, WCQ Africa", category: "governing", color: "#009639", url: "https://www.cafonline.com", featured: false },
  { id: 17, name: "AFC TV", description: "Asian Football Confederation's streaming platform covering Asian Cup, Champions League, and World Cup qualifiers.", competitions: "Asian Cup, AFC CL, WCQ Asia", category: "governing", color: "#c8102e", url: "https://www.the-afc.com", featured: false },
  { id: 18, name: "Flashscore", description: "Not a stream but the fastest live scores platform — follow every match in real-time across all leagues worldwide while you watch on your chosen broadcaster.", competitions: "All leagues worldwide", category: "scores", color: "#1a8c1a", url: "https://www.flashscore.com", featured: false },
];

const categories = [
  { key: 'all', label: 'All', Icon: Tv },
  { key: 'governing', label: 'Governing Bodies', Icon: Shield },
  { key: 'league', label: 'League Officials', Icon: Star },
  { key: 'broadcaster', label: 'Broadcasters', Icon: Radio },
  { key: 'free', label: 'Free / Legal', Icon: Eye },
  { key: 'scores', label: 'Live Scores', Icon: Zap },
];

/* ═══════════════════════════════════════════════════════════════
   COMPONENTS
   ═══════════════════════════════════════════════════════════════ */
function FeaturedCard({ s, i }) {
  const isLight = s.lightText;
  return (
    <a
      href={s.url}
      target="_blank"
      rel="noopener noreferrer"
      className="sc ls-pop"
      style={{
        display: 'block',
        padding: 0,
        textDecoration: 'none',
        border: `1px solid ${s.color}30`,
        animationDelay: `${i * 60}ms`,
        cursor: 'pointer'
      }}
    >
      {/* Top gradient bar */}
      <div style={{ height: 4, background: `linear-gradient(90deg, ${s.color}, ${s.color}66)` }} />

      <div style={{ padding: '22px 22px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: `linear-gradient(135deg, ${s.color}25, ${s.color}08)`,
              border: `1.5px solid ${s.color}35`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: isLight ? '#222' : s.color,
              fontWeight: 900, fontSize: '.85rem', letterSpacing: '.02em',
              fontFamily: 'var(--font-display)'
            }}>
              {s.name.length <= 3 ? s.name : s.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>{s.name}</h3>
                <span className="ls-pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
              </div>
              <span style={{
                fontSize: '.66rem', fontWeight: 700, padding: '3px 9px', borderRadius: 5,
                background: `${s.color}15`, color: isLight ? '#222' : s.color,
                border: `1px solid ${s.color}25`
              }}>{s.competitions}</span>
            </div>
          </div>
        </div>

        <p style={{ margin: '0 0 18px', fontSize: '.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {s.description}
        </p>

        <div className="sc-visit" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '10px 18px', borderRadius: 9,
          background: `${s.color}18`,
          color: isLight ? '#111' : s.color,
          fontWeight: 700, fontSize: '.82rem',
          border: `1px solid ${s.color}30`
        }}>
          <Play size={13} fill="currentColor" /> Watch Now
          <ChevronRight size={14} className="sc-arrow" />
        </div>
      </div>
    </a>
  );
}

function ServiceCard({ s, i }) {
  const isLight = s.lightText;
  return (
    <a
      href={s.url}
      target="_blank"
      rel="noopener noreferrer"
      className="sc ls-up"
      style={{
        display: 'block',
        padding: 0,
        textDecoration: 'none',
        border: '1px solid var(--border)',
        animationDelay: `${(i + 4) * 40}ms`,
        cursor: 'pointer'
      }}
    >
      {/* Left accent */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: s.color }} />

      <div style={{ padding: '20px 20px 18px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingLeft: 6 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 11,
            background: `${s.color}18`,
            border: `1px solid ${s.color}25`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isLight ? '#333' : s.color,
            fontWeight: 800, fontSize: '.75rem',
            fontFamily: 'var(--font-display)'
          }}>
            {s.name.length <= 3 ? s.name : s.name.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: '.62rem', fontWeight: 700, padding: '3px 8px', borderRadius: 5,
              background: `${s.color}12`, color: isLight ? '#333' : s.color,
              border: `1px solid ${s.color}20`, textTransform: 'uppercase', letterSpacing: '.03em'
            }}>
              {s.category}
            </span>
          </div>
        </div>

        <h3 style={{ margin: '0 0 6px 6px', fontSize: '1.02rem', fontWeight: 700, color: 'var(--text-primary)' }}>{s.name}</h3>
        <p style={{ margin: '0 0 16px 6px', fontSize: '.78rem', color: 'var(--text-muted)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {s.description}
        </p>

        <div style={{ paddingLeft: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '.7rem', color: 'var(--text-muted)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
            {s.competitions}
          </span>
          <span className="sc-visit" style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '7px 13px', borderRadius: 7,
            background: `${s.color}12`,
            color: isLight ? '#222' : s.color,
            fontWeight: 600, fontSize: '.74rem',
            border: `1px solid ${s.color}20`
          }}>
            Visit <ExternalLink size={10} className="sc-arrow" />
          </span>
        </div>
      </div>
    </a>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════ */
export default function LiveStream() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchFocused, setSearchFocused] = useState(false);

  const featured = useMemo(() => streamingServices.filter(s => s.featured), []);
  const nonFeatured = useMemo(() => streamingServices.filter(s => !s.featured), []);

  const filteredFeatured = useMemo(() => {
    const q = search.toLowerCase().trim();
    const cat = activeCategory;
    return featured.filter(s => {
      const matchSearch = !q || s.name.toLowerCase().includes(q) || s.competitions.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
      const matchCat = cat === 'all' || s.category === cat;
      return matchSearch && matchCat;
    });
  }, [search, activeCategory]);

  const filteredRest = useMemo(() => {
    const q = search.toLowerCase().trim();
    const cat = activeCategory;
    return nonFeatured.filter(s => {
      const matchSearch = !q || s.name.toLowerCase().includes(q) || s.competitions.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
      const matchCat = cat === 'all' || s.category === cat;
      return matchSearch && matchCat;
    });
  }, [search, activeCategory]);

  const totalShown = filteredFeatured.length + filteredRest.length;
  const hasFilters = search.trim() || activeCategory !== 'all';

  const clearAll = useCallback(() => { setSearch(''); setActiveCategory('all'); }, []);
  const clearSearch = useCallback(() => setSearch(''), []);

   return (
    <div style={{ minHeight: '100vh', overflow: 'hidden', background: 'var(--bg-deep)' }}>

      <SEO
        title="Live Football Streams & Matches | ZOKASCORE"
        description="Find where to watch live football matches through official broadcasters and legal streaming platforms worldwide. Get accurate streaming info on ZOKASCORE."
        keywords="live football streams, watch football online, live soccer, football streaming, live matches"
        robots="index,follow"
      />

      {/* ── HEADER ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(5,7,10,.85)', backdropFilter: 'blur(18px)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 940, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => window.location.href = '/'}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bg-deep)' }}>
              <Tv size={16} />
            </div>
            <span style={{ fontSize: '.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>zokascore<span style={{ color: 'var(--accent)' }}>.xyz</span></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.82rem', fontWeight: 700, color: 'var(--accent)' }}>
            <MonitorSmartphone size={15} /> Live Streams
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 940, margin: '0 auto', padding: '24px 20px 80px' }}>

        {/* ── TITLE ── */}
        <div className="ls-up" style={{ marginBottom: 28, textAlign: 'center' }}>
          <div className="ls-float" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 16, background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.12)', marginBottom: 14 }}>
            <Tv size={28} style={{ color: 'var(--accent)' }} />
          </div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-.02em' }}>Where to Watch Live Football</h1>
          <p style={{ fontSize: '.88rem', color: 'var(--text-muted)', marginTop: 6, fontWeight: 500, maxWidth: 500, marginLeft: 'auto', marginRight: 'auto' }}>
            Official broadcasters and legal streaming platforms for football worldwide
          </p>
        </div>

        {/* ── INFO BANNER ── */}
        <div className="ls-up" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderRadius: 12, background: 'rgba(59,130,246,.05)', border: '1px solid rgba(59,130,246,.12)', marginBottom: 24 }}>
          <Info size={17} style={{ color: '#60a5fa', flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: '.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Availability varies by region. All links go to official sites where you can find accurate local broadcast and streaming info.
          </p>
        </div>

        {/* ── SEARCH ── */}
        <div style={{ position: 'relative', marginBottom: 18 }}>
          <Search size={18} style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', color: searchFocused ? 'var(--accent)' : 'var(--text-muted)', transition: 'color .2s', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search by name, league, or keyword..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={{ width: '100%', padding: '13px 42px 13px 44px', borderRadius: 12, background: 'var(--bg-card)', border: `1.5px solid ${searchFocused ? 'var(--accent)' : 'var(--border)'}`, color: 'var(--text-primary)', fontSize: '.86rem', fontWeight: 500, outline: 'none', transition: 'all .2s', boxSizing: 'border-box' }}
          />
          {search && (
            <button onClick={clearSearch} className="zb" style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,.06)', border: 'none', borderRadius: 7, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* ── FILTER TABS ── */}
        <div className="hide-sb" style={{ display: 'flex', gap: 7, marginBottom: 22, overflowX: 'auto', paddingBottom: 4 }}>
          {categories.map(cat => {
            const isActive = activeCategory === cat.key;
            const count = cat.key === 'all' ? streamingServices.length : streamingServices.filter(s => s.category === cat.key).length;
            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className="zb"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 8, flexShrink: 0,
                  background: isActive ? 'var(--accent)' : 'var(--bg-card)',
                  border: `1.5px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                  color: isActive ? 'var(--bg-deep)' : 'var(--text-muted)',
                  fontSize: '.76rem', fontWeight: 700
                }}
              >
                <cat.Icon size={13} />
                {cat.label}
                <span style={{
                  fontSize: '.6rem', fontWeight: 800, padding: '2px 6px', borderRadius: 5,
                  background: isActive ? 'rgba(0,0,0,.2)' : 'rgba(255,255,255,.05)',
                  color: isActive ? 'var(--bg-deep)' : 'var(--text-secondary)'
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── RESULTS COUNT ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
            Showing <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{totalShown}</strong> of {streamingServices.length} services
          </span>
          {hasFilters && (
            <button onClick={clearAll} className="zb" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '.76rem', fontWeight: 600 }}>
              <X size={13} /> Clear filters
            </button>
          )}
        </div>

        {/* ── EMPTY STATE ── */}
        {totalShown === 0 ? (
          <div className="ls-up" style={{ textAlign: 'center', padding: '44px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--text-muted)' }}>
              <Wifi size={24} />
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>No services found</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: '.84rem' }}>Try adjusting your search or filters</p>
            <button onClick={clearAll} className="zb" style={{ padding: '8px 18px', borderRadius: 8, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '.82rem', fontWeight: 600 }}>
              Clear All Filters
            </button>
          </div>
        ) : (
          <>
            {/* ── FEATURED SECTION ── */}
            {filteredFeatured.length > 0 && !hasFilters && (
              <div style={{ marginBottom: 28 }}>
                <div className="ls-slide" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <Star size={14} style={{ color: 'var(--gold)' }} />
                  <span style={{ fontSize: '.74rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Top Picks</span>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(245,197,66,.2), transparent)', borderRadius: 1 }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
                  {filteredFeatured.map((s, i) => <FeaturedCard key={s.id} s={s} i={i} />)}
                </div>
              </div>
            )}

            {/* ── ALL SERVICES GRID ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
              {filteredRest.map((s, i) => <ServiceCard key={s.id} s={s} i={i} />)}
            </div>
          </>
        )}

        {/* ── DISCLAIMER ── */}
        <div className="ls-up" style={{ marginTop: 32, display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 20px', borderRadius: 12, background: 'rgba(245,197,66,.04)', border: '1px solid rgba(245,197,66,.1)' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(245,197,66,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold)', flexShrink: 0 }}>
            <Globe size={15} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '.76rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Regional availability:</strong> Streaming rights vary by country. These links direct to official platforms where you can find accurate local broadcasting information. We do not host or link to unofficial streams.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}