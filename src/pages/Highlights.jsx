import React, { useState, useEffect, useMemo, useRef } from "react";

// UTILS
const slugify = (s) => s.toLowerCase().trim().replace(/[^\w\s-]/g,'').replace(/[\s_-]+/g,'-').replace(/^-+|-+$/g,'');
const getSeoImageUrl = (url, w=1200) => url ? `${url}?auto=format&fit=crop&w=${w}&q=80` : '/og-fallback.jpg';
const BULLET = '•';

export const formatTimestamp = (iso) => {
  const d = new Date(iso); const diff = Date.now()-d.getTime();
  if(diff<60000) return 'just now';
  if(diff<3600000) return `${Math.floor(diff/60000)}m ago`;
  if(diff<86400000) return `${Math.floor(diff/3600000)}h ago`;
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
};

export const calcReadTime = (text) => Math.max(1, Math.ceil(text.split(/\s+/).length/220));

export const BADGES = {
  transfer: { label:'Transfer', color:'#10b981', dot:'#34d399' },
  injury: { label:'Injury', color:'#ef4444', dot:'#f87171' },
  analysis: { label:'Analysis', color:'#8b5cf6', dot:'#a78bfa' },
  breaking: { label:'Breaking', color:'#f59e0b', dot:'#fbbf24' },
  interview: { label:'Interview', color:'#06b6d4', dot:'#22d3ee' },
  highlight: { label:'Highlight', color:'#ec4899', dot:'#f472b6' },
};

export const CATEGORIES = ['all','transfer','injury','analysis','breaking','interview','highlight'];

export const REACTIONS = [
  { id:'fire', emoji:'🔥', label:'Fire' },
  { id:'clap', emoji:'👏', label:'Clap' },
  { id:'mind', emoji:'🤯', label:'Mindblown' },
  { id:'love', emoji:'❤️', label:'Love' },
  { id:'angry', emoji:'😡', label:'Angry' }
];

// HOOKS
export function useReadingProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const scrolled = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
      setProgress(Math.min(100, Math.max(0, scrolled)));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return progress;
}

// COMPONENTS
function CommentSection({ postId, inline = false }) {
  const [comments, setComments] = useState([
    { id:'1', author:'ZokaFan', text:'What a story!', avatar:'ZF', time:'2h ago' },
    { id:'2', author:'Scout', text:'More details on fee?', avatar:'SC', time:'1h ago' },
  ]);
  const [input, setInput] = useState('');

  return (
    <div className={inline ? "comments-wrap inline" : "comments-wrap"}>
      {comments.map(c => (
        <div key={c.id} className="comment-row">
          <div className="comment-avatar">{c.avatar}</div>
          <div className="comment-bubble">
            <b>{c.author}</b> <span>{c.text}</span>
            <small>{c.time}</small>
          </div>
        </div>
      ))}
      <div className="comment-row">
        <div className="comment-avatar">ME</div>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Add comment..." className="comment-input" />
        <button onClick={() => { if(input){ setComments([...comments, {id:Date.now()+'', author:'You', text:input, avatar:'ME', time:'now'}]); setInput(''); } }}>Post</button>
      </div>
    </div>
  );
}

function PostCard({ post, isExpanded, showComments, isSaved, onToggleExpand, onToggleSave, onShare }) {
  const [localReactions, setLocalReactions] = useState(post.reactions || {});
  const [activeReaction, setActiveReaction] = useState(null);
  const badge = BADGES[post.category] || BADGES.highlight;
  const trending = post.views > 5000;

  return (
    <article className={`news-card ${isExpanded ? 'expanded' : ''} ${trending ? 'trending' : ''}`}>
      <div className="news-img-wrap">
        <img src={getSeoImageUrl(post.image, 600)} alt={post.title} className="news-img" loading="lazy" />
        <div className="news-hero-meta">
          <span className="badge" style={{ background: badge.color }}>{badge.label}</span>
          {trending && <span className="trending-badge">🔥 TRENDING</span>}
          <span className="read-time">{calcReadTime(post.content)} min {BULLET} {formatTimestamp(post.createdAt)}</span>
        </div>
      </div>
      <div className="news-body">
        <h3 className="news-title">{post.title}</h3>
        <p className={`news-excerpt ${isExpanded ? '' : 'clamp-3'}`}>{post.excerpt}</p>
        <div className="news-author-row">
          <div className="news-avatar">{post.author[0]}</div>
          <span>{post.author} {BULLET} {post.league}</span>
        </div>
        {isExpanded && <div className="news-full" dangerouslySetInnerHTML={{ __html: post.content }} />}
        <div className="news-stats">
          <span>👁 {post.views}</span><span>💬 {post.commentsCount}</span><span>↗ {post.shares}</span>
        </div>
        <div className="news-actions">
          <div className="reactions">
            {REACTIONS.map(r => (
              <button 
                key={r.id} 
                className={`reaction-btn ${activeReaction === r.id ? 'active' : ''}`} 
                onClick={() => { 
                  const n = (localReactions[r.id] || 0) + (activeReaction === r.id ? -1 : 1); 
                  setLocalReactions({...localReactions, [r.id]: Math.max(0, n)}); 
                  setActiveReaction(activeReaction === r.id ? null : r.id); 
                }}
              >
                {r.emoji} {localReactions[r.id] || 0}
              </button>
            ))}
          </div>
          <div className="card-cta">
            <button onClick={onToggleExpand}>{isExpanded ? 'Show less' : 'Read more'}</button>
            <button onClick={onToggleSave}>{isSaved ? '★ Saved' : '☆ Save'}</button>
            <button onClick={onShare}>Share</button>
          </div>
        </div>
        {showComments && <CommentSection postId={post.id} inline />}
      </div>
    </article>
  );
}

function SinglePostView({ post, relatedPosts, relatedMatch, onClose, isAdmin }) {
  const progress = useReadingProgress();
  const [lightbox, setLightbox] = useState(null);
  const [showShare, setShowShare] = useState(false);

  return (
    <div className="news-single">
      <div className="reading-progress" style={{ width: `${progress}%` }} />
      <button className="back-btn" onClick={onClose}>← Back to highlights</button>
      <div className="news-single-hero">
        <img src={getSeoImageUrl(post.image, 1200)} alt={post.title} onClick={() => setLightbox(post.image)} className="news-img" />
        <h1 className="news-title">{post.title}</h1>
        <div className="news-author-row">
          <div className="news-avatar">{post.author[0]}</div>
          <span>{post.author} {BULLET} {formatTimestamp(post.createdAt)}</span>
        </div>
      </div>
      <div className="news-body" dangerouslySetInnerHTML={{ __html: post.content }} />
      
      {relatedMatch && (
        <div className="related-match-box">
          <h4>Related Match: {relatedMatch.home} vs {relatedMatch.away}</h4>
          <p>{relatedMatch.league} {BULLET} {relatedMatch.time}</p>
          <a href={`/match/${relatedMatch.id}`}>View Match Center →</a>
        </div>
      )}
      
      <div className="related-grid">
        {relatedPosts.map(rp => (
          <div key={rp.id} className="trending-card">
            <img src={rp.image} className="trending-img" alt={rp.title} />
            <span>{rp.title}</span>
          </div>
        ))}
      </div>
      
      <CommentSection postId={post.id} />
      
      <div className={`admin-actions ${isAdmin ? 'flex' : 'hidden'}`}>
        <button onClick={() => console.log('edit', post.id)}>Edit Post</button>
        <button onClick={() => confirm('Delete?') && console.log('delete')}>Delete Post</button>
      </div>
      
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={getSeoImageUrl(lightbox, 1600)} alt="lightbox" />
          <button className="close">×</button>
        </div>
      )}
      
      {showShare && (
        <div className="modal-overlay" onClick={() => setShowShare(false)}>
          <div className="modal-box share-modal" onClick={e => e.stopPropagation()}>
            <h3>Share</h3>
            <div className="share-grid">
              <button>Twitter</button><button>WhatsApp</button><button>Copy Link</button>
            </div>
          </div>
        </div>
      )}
      
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({"@context":"https://schema.org","@type":"NewsArticle", headline:post.title, image:[getSeoImageUrl(post.image)], datePublished:post.createdAt, author:{name:post.author}}) }} />
    </div>
  );
}

function AdminForm({ onSave }) {
  const canvasRef = useRef(null);
  const [image, setImage] = useState(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0]; 
    if(!file) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const max = 1200; let { width, height } = img;
      if(width > max){ height = (max / width) * height; width = max; }
      if(height > max){ width = (max / height) * width; height = max; }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d'); 
      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL('image/jpeg', 0.7);
      setImage(compressed);
    };
    img.src = URL.createObjectURL(file);
  };

  return (
    <form className="admin-form" onSubmit={e => { e.preventDefault(); onSave({image}); }}>
      <input type="file" accept="image/*" onChange={handleFile} />
      {image && <img src={image} className="preview" alt="preview" />}
      <input name="title" placeholder="Title" required />
      <select name="category">
        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <textarea name="content" placeholder="Content" required />
      <button type="submit">Publish</button>
      <canvas ref={canvasRef} className="hidden" />
    </form>
  );
}

function AdSlot({ index }) { 
  return <div className="ad-slot">Ad {BULLET} slot {index}</div>; 
}

export default function Highlights() {
  const [posts, setPosts] = useState(() => Array.from({length: 12}, (_, i) => ({
    id: String(i), 
    title: `ZokaScore Analysis #${i+1}: Title goes here with ${['Transfer','Injury','Tactics'][i%3]}`,
    excerpt: 'Lorem ipsum dolor sit amet consectetur adipisicing elit...', 
    content: '<p>Full content with <b>bold</b> and tactics...</p>'.repeat(6),
    image: `https://picsum.photos/seed/${i}/800/450`, 
    category: CATEGORIES[(i % CATEGORIES.length)], 
    author: 'Zoka Team', 
    league: 'Premier League',
    createdAt: new Date(Date.now() - i * 3600000).toISOString(), 
    views: Math.floor(Math.random() * 12000), 
    commentsCount: Math.floor(Math.random() * 40), 
    shares: Math.floor(Math.random() * 100), 
    reactions: { fire: 12, clap: 4 }
  })));
  
  const [activeCat, setActiveCat] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [saved, setSaved] = useState(new Set());
  const [visibleCount, setVisibleCount] = useState(6);
  const [showTop, setShowTop] = useState(false);
  const progress = useReadingProgress();

  useEffect(() => { 
    const onScroll = () => setShowTop(window.scrollY > 600); 
    window.addEventListener('scroll', onScroll); 
    return () => window.removeEventListener('scroll', onScroll); 
  }, []);

  const filtered = useMemo(() => posts.filter(p => {
    const cat = activeCat === 'all' || p.category === activeCat;
    const q = !search || p.title.toLowerCase().includes(search.toLowerCase());
    return cat && q;
  }), [posts, activeCat, search]);

  const trendingPosts = useMemo(() => [...posts].sort((a, b) => b.views - a.views).slice(0, 4), [posts]);

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage", 
    name: "Highlights", 
    itemListElement: filtered.slice(0, 10).map((p, i) => ({
      "@type": "ListItem", 
      position: i + 1, 
      url: `/highlights/${slugify(p.title)}`
    }))
  };

  return (
    <div className="highlights-page">
      <div className="reading-progress" style={{ width: `${progress}%` }} />
      
      <div className="sticky-top">
        <div className="filter-row">
          {CATEGORIES.map(c => (
            <button key={c} className={activeCat === c ? 'active' : ''} onClick={() => setActiveCat(c)}>
              {c}
            </button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search highlights..." className="search-bar" />
      </div>
      
      <div className="trending-row">
        {trendingPosts.map(p => (
          <div key={p.id} className="trending-card">
            <img src={getSeoImageUrl(p.image, 300)} className="trending-img" alt={p.title} />
            <span>{p.title}</span>
          </div>
        ))}
      </div>
      
      <div className="news-grid">
        {filtered.slice(0, visibleCount).map((post, idx) => (
          <React.Fragment key={post.id}>
            <PostCard 
              post={post} 
              isExpanded={expandedId === post.id} 
              showComments={expandedId === post.id} 
              isSaved={saved.has(post.id)} 
              onToggleExpand={() => setExpandedId(expandedId === post.id ? null : post.id)} 
              onToggleSave={() => setSaved(s => {
                const n = new Set(s); 
                n.has(post.id) ? n.delete(post.id) : n.add(post.id); 
                return n;
              })} 
              onShare={() => navigator.share?.({title: post.title, url: location.href})} 
            />
            {(idx + 1) % 4 === 0 && <AdSlot index={(idx + 1) / 4} />}
          </React.Fragment>
        ))}
      </div>
      
      {visibleCount < filtered.length && (
        <button className="load-more" onClick={() => setVisibleCount(v => v + 4)}>
          Load more
        </button>
      )}
      
      {showTop && (
        <button className="scroll-top-btn" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>
          ↑
        </button>
      )}
      
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />
    </div>
  );
}