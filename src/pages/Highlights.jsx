import { useState, useEffect } from 'react';
import { PlayCircle, X, AlertCircle, Tv, Clock } from 'lucide-react';
import { fetchHighlights } from '../utils/youtubeApi';
import SEO from "../components/SEO";
/* ═══════════════════════════════════════════════════════════════
   STYLE INJECTION
   ═══════════════════════════════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('yt-pro-v1')) return;
  const s = document.createElement('style');
  s.id = 'yt-pro-v1';
  s.textContent = `
    @keyframes yt_fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
    @keyframes yt_pop{0%{transform:scale(.9);opacity:0}100%{transform:scale(1);opacity:1}}
    @keyframes yt_shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    .yt-enter{animation:yt_fadeUp .5s cubic-bezier(.22,1,.36,1) both}
    .yt-pop{animation:yt_pop .3s cubic-bezier(.22,1,.36,1) both}
    .yt-shimmer{background:linear-gradient(90deg,var(--bg-surface) 25%,var(--bg-card) 50%,var(--bg-surface) 75%);background-size:200% 100%;animation:yt_shimmer 1.5s ease-in-out infinite}
    .zoka-btn{transition:all .18s cubic-bezier(.22,1,.36,1);cursor:pointer;outline:none}
    .zoka-btn:hover{transform:translateY(-2px)}
    .zoka-card{transition:all .22s cubic-bezier(.22,1,.36,1)}
    .zoka-card:hover{transform:translateY(-4px);box-shadow:0 12px 30px rgba(0,0,0,.3)}
  `;
  document.head.appendChild(s);
};

const formatTimeAgo = (dateStr) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/* ═══════════════════════════════════════════════════════════════
   MAIN HIGHLIGHTS COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function Highlights() {
  injectStyles();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeVideo, setActiveVideo] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const res = await fetchHighlights();
      if (res.error) setError(res.error);
      setVideos(res.videos || []);
      setLoading(false);
    };
    load();
  }, []);

  const SkeletonCard = () => (
    <div className="yt-shimmer" style={{ borderRadius: 14, height: 220 }} />
  );

   return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)' }}>
      <SEO
        title="Match Highlights"
        description="Watch the latest football match highlights, goals and action from Europe's top leagues."
        keywords="football highlights, goals, Premier League highlights, Champions League highlights"
        url="https://zokascore.com/highlights"
      />    
      {/* INTERNAL VIDEO PLAYER MODAL */}
      {activeVideo && (
        <div onClick={() => setActiveVideo(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(8px)' }}>
          <div onClick={e => e.stopPropagation()} className="yt-pop" style={{ width: '100%', maxWidth: 900, background: 'var(--bg-card)', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
            <div style={{ position: 'relative', paddingTop: '56.25%', background: '#000' }}>
              <iframe 
                src={`https://www.youtube.com/embed/${activeVideo.id}?autoplay=1&rel=0`} 
                title={activeVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
              />
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{activeVideo.title}</h3>
                <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{activeVideo.channel}</span>
              </div>
              <button className="zoka-btn" onClick={() => setActiveVideo(null)} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <X size={16} /> Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(10,10,10,.88)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: '#FF0000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <PlayCircle size={16} />
            </div>
            <span style={{ fontSize: '.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>zokascore<span style={{ color: 'var(--accent)' }}>.xyz</span></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.82rem', fontWeight: 700, color: '#ef4444' }}>
            <PlayCircle size={16} /> Highlights
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 80px' }}>
        <div className="yt-enter" style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-.02em' }}>Match Highlights</h1>
          <p style={{ fontSize: '.88rem', color: 'var(--text-muted)', marginTop: 6, fontWeight: 500 }}>Catch up on the latest goals and action from Europe's top leagues.</p>
        </div>

        {/* ERROR STATE */}
        {error && (
          <div className="yt-enter" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 40, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, textAlign: 'center' }}>
            <AlertCircle size={36} style={{ color: '#ef4444' }} />
            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Failed to load highlights</div>
            <div style={{ fontSize: '.84rem', color: 'var(--text-muted)', maxWidth: 300 }}>
              {error === 'NO_KEY' && 'Missing YouTube API Key. Add VITE_YOUTUBE_API_KEY to your .env file.'}
              {error === 'QUOTA_EXCEEDED' && 'YouTube API quota exceeded for today. Please try again tomorrow.'}
              {error === 'NETWORK' && 'Network error. Please check your connection.'}
            </div>
          </div>
        )}

        {/* LOADING SKELETONS */}
        {loading && !error && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* VIDEO GRID */}
        {!loading && !error && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {videos.map((v, i) => (
              <div 
                key={v.id} 
                className="zoka-card yt-enter" 
                onClick={() => setActiveVideo(v)} 
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', cursor: 'pointer', animationDelay: `${i * 50}ms` }}
              >
                {/* Thumbnail */}
                <div style={{ position: 'relative', paddingTop: '56.25%', background: '#000' }}>
                  <img src={v.thumbnail} alt={v.title} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.6), transparent 40%)' }} />
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'rgba(255,255,255,0.9)' }}>
                    <PlayCircle size={48} className="zoka-btn" style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,.5))' }} />
                  </div>
                  <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.8)', padding: '3px 8px', borderRadius: 4, fontSize: '.65rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Tv size={12} /> {v.channel}
                  </div>
                </div>
                {/* Info */}
                <div style={{ padding: '14px 16px' }}>
                  <h3 style={{ margin: 0, fontSize: '.92rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {v.title}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: '.72rem', color: 'var(--text-muted)' }}>
                    <Clock size={12} /> {formatTimeAgo(v.publishedAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}