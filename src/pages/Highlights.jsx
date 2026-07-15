// ═══════════════════════════════════════════════════════════════
// FILE: src/pages/Highlights.jsx (Now Football News Hub)
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { 
  Newspaper, X, AlertCircle, Clock, Heart, MessageCircle, 
  Plus, Pencil, Trash2, Send, Tag, Image as ImageIcon, Loader 
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../utils/firebase';
import { 
  collection, query, orderBy, onSnapshot, addDoc, updateDoc, 
  deleteDoc, doc, serverTimestamp, increment, arrayUnion, arrayRemove 
} from 'firebase/firestore';
import SEO from "../components/SEO";

/* ═══════════════════════════════════════════════════════════════
   STYLE INJECTION
   ═══════════════════════════════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('news-hub-css')) return;
  const s = document.createElement('style');
  s.id = 'news-hub-css';
  s.textContent = `
    @keyframes nh_fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
    @keyframes nh_pop{0%{transform:scale(.9);opacity:0}100%{transform:scale(1);opacity:1}}
    @keyframes nh_shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    
    body{overflow-x:hidden;width:100%;max-width:100vw}
    
    .nh-enter{animation:nh_fadeUp .5s cubic-bezier(.22,1,.36,1) both}
    .nh-pop{animation:nh_pop .3s cubic-bezier(.22,1,.36,1) both}
    .nh-shimmer{background:linear-gradient(90deg,var(--bg-surface) 25%,var(--bg-card) 50%,var(--bg-surface) 75%);background-size:200% 100%;animation:nh_shimmer 1.5s ease-in-out infinite}
    
    .nh-btn{transition:all .18s cubic-bezier(.22,1,.36,1);cursor:pointer;outline:none}
    .nh-btn:hover{transform:translateY(-2px)}
    .nh-card{transition:all .22s cubic-bezier(.22,1,.36,1)}
    .nh-card:hover{transform:translateY(-4px);box-shadow:0 12px 30px rgba(0,0,0,.3)}
    
    .nh-scroll::-webkit-scrollbar{width:6px}
    .nh-scroll::-webkit-scrollbar-track{background:transparent}
    .nh-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:10px}
    
    @media(prefers-reduced-motion:reduce){
      *,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}
    }
  `;
  document.head.appendChild(s);
};

const formatTimeAgo = (date) => {
  if (!date) return 'Just now';
  const diff = Date.now() - (date.toMillis ? date.toMillis() : new Date(date).getTime());
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return `${Math.floor(diff / (1000 * 60))}m ago`;
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const CATEGORIES = [
  { key: 'All', label: 'All News' },
  { key: 'Transfers', label: 'Transfers' },
  { key: 'Injuries', label: 'Injuries' },
  { key: 'Match Updates', label: 'Match Updates' },
  { key: 'Official', label: 'Official' },
];

/* ═══════════════════════════════════════════════════════════════
   MAIN NEWS COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function Highlights() {
  injectStyles();
  const { currentUser, userProfile } = useAuth();
  const user = currentUser; // Alias it so the rest of the code works
  const isAdmin = userProfile?.role === 'admin';

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');
  
  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [activePost, setActivePost] = useState(null); // For reading full post & comments
  
  // Form State
  const [formData, setFormData] = useState({ title: '', category: 'Official', body: '', imageUrl: '' });
  const [saving, setSaving] = useState(false);

  // Comments State
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);

  // Fetch Posts
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'news_posts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPosts(data);
      setLoading(false);
    }, (err) => {
      console.error("News fetch error:", err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Fetch Comments for Active Post
  useEffect(() => {
    if (!activePost || !db) return setComments([]);
    setLoadingComments(true);
    const q = query(collection(db, 'news_posts', activePost.id, 'comments'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingComments(false);
    }, () => setLoadingComments(false));
    return () => unsub();
  }, [activePost]);

  const filteredPosts = activeFilter === 'All' ? posts : posts.filter(p => p.category === activeFilter);

  const openCreate = () => {
    setEditingPost(null);
    setFormData({ title: '', category: 'Official', body: '', imageUrl: '' });
    setIsFormOpen(true);
  };

  const openEdit = (post) => {
    setEditingPost(post);
    setFormData({ title: post.title, category: post.category, body: post.body, imageUrl: post.imageUrl || '' });
    setActivePost(null);
    setIsFormOpen(true);
  };

   const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.body) return;
    if (!user) return alert("You must be logged in to do this.");
    
    setSaving(true);

    try {
      if (editingPost) {
        await updateDoc(doc(db, 'news_posts', editingPost.id), {
          ...formData,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'news_posts'), {
          ...formData,
          authorId: user.uid,
          authorName: userProfile?.displayName || 'Admin',
          createdAt: serverTimestamp(),
          likesCount: 0,
          commentsCount: 0,
          likedBy: []
        });
      }
      setIsFormOpen(false);
    } catch (err) {
      console.error("Save post error:", err);
      alert("Failed to save post. Check console for details.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (postId) => {
    if (!window.confirm("Are you sure you want to delete this post?")) return;
    try {
      await deleteDoc(doc(db, 'news_posts', postId));
      setActivePost(null);
    } catch (err) {
      console.error("Delete error:", err);
      alert("Failed to delete.");
    }
  };

  const handleLike = async (post) => {
    if (!user) return alert("Please log in to like posts.");
    const postRef = doc(db, 'news_posts', post.id);
    const hasLiked = post.likedBy?.includes(user.uid);

    try {
      await updateDoc(postRef, {
        likedBy: hasLiked ? arrayRemove(user.uid) : arrayUnion(user.uid),
        likesCount: increment(hasLiked ? -1 : 1)
      });
    } catch (err) {
      console.error("Like error:", err);
    }
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !activePost) return;
    
    try {
      await addDoc(collection(db, 'news_posts', activePost.id, 'comments'), {
        body: newComment.trim(),
        authorId: user?.uid || 'guest',
        authorName: userProfile?.displayName || (user ? 'User' : 'Guest'),
        createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'news_posts', activePost.id), {
        commentsCount: increment(1)
      });
      setNewComment('');
    } catch (err) {
      console.error("Comment error:", err);
      alert("Failed to post comment.");
    }
  };

  const SkeletonCard = () => <div className="nh-shimmer" style={{ borderRadius: 16, height: 320 }} />;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep, #0a0f1a)' }}>
      <SEO
        title="Football News Hub | ZOKASCORE"
        description="The latest official football news, injury updates, transfer done deals, and match reports."
        keywords="football news, soccer news, transfers, injuries, official updates"
        path="/highlights"
        robots="index,follow"
      />

      {/* HEADER */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(10,15,26,.88)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--border, #1e293b)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent, #10b981)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0a0f1a' }}>
              <Newspaper size={18} />
            </div>
            <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary, #f1f5f9)' }}>News Hub</span>
          </div>
          {isAdmin && (
            <button onClick={openCreate} className="nh-btn" style={{ background: 'var(--accent, #10b981)', color: '#0a0f1a', padding: '8px 16px', borderRadius: 8, border: 'none', fontWeight: 800, fontSize: '.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> New Post
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 80px' }}>
        <div className="nh-enter" style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-primary, #f1f5f9)', margin: 0, letterSpacing: '-.02em' }}>Football News & Updates</h1>
          <p style={{ fontSize: '.88rem', color: 'var(--text-muted, #64748b)', marginTop: 6, fontWeight: 500 }}>Official announcements, transfer done deals, and injury reports.</p>
        </div>

        {/* FILTER TABS */}
        <div className="nh-enter" style={{ display: 'flex', gap: 8, marginBottom: 24, overflowX: 'auto', paddingBottom: 4 }} className="nh-scroll">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => setActiveFilter(cat.key)}
              className="nh-btn"
              style={{
                padding: '8px 16px',
                borderRadius: 20,
                border: `1px solid ${activeFilter === cat.key ? 'var(--accent, #10b981)' : 'var(--border, #1e293b)'}`,
                background: activeFilter === cat.key ? 'rgba(16,185,129,.1)' : 'var(--bg-card, #111827)',
                color: activeFilter === cat.key ? 'var(--accent, #10b981)' : 'var(--text-muted, #64748b)',
                fontWeight: 700,
                fontSize: '.75rem',
                whiteSpace: 'nowrap'
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* LOADING SKELETONS */}
        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* NO POSTS */}
        {!loading && filteredPosts.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <Newspaper size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
            <p>No news articles found.</p>
          </div>
        )}

        {/* NEWS GRID */}
        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
            {filteredPosts.map((post, i) => (
              <div 
                key={post.id} 
                className="nh-card nh-enter" 
                style={{ 
                  background: 'var(--bg-card, #111827)', 
                  border: '1px solid var(--border, #1e293b)', 
                  borderRadius: 16, 
                  overflow: 'hidden',
                  animationDelay: `${i * 50}ms`,
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Image Thumbnail */}
                <div onClick={() => setActivePost(post)} style={{ cursor: 'pointer', position: 'relative', paddingTop: '56.25%', background: 'var(--bg-surface)' }}>
                  {post.imageUrl ? (
                    <img src={post.imageUrl} alt={post.title} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                  ) : (
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', opacity: 0.2 }}>
                      <Newspaper size={48} />
                    </div>
                  )}
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.8), transparent 50%)' }} />
                  
                  {/* Category Badge */}
                  <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', padding: '4px 10px', borderRadius: 6, fontSize: '.62rem', fontWeight: 800, color: 'var(--accent, #10b981)', textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid rgba(16,185,129,0.2)' }}>
                    {post.category || 'General'}
                  </div>
                </div>

                {/* Info */}
                <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column' }} onClick={() => setActivePost(post)}>
                  <h3 style={{ margin: 0, fontSize: '.95rem', fontWeight: 700, color: 'var(--text-primary, #f1f5f9)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}>
                    {post.title}
                  </h3>
                  <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', flex: 1 }}>
                    {post.body}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.68rem', color: 'var(--text-muted)' }}>
                      <Clock size={12} /> {formatTimeAgo(post.createdAt)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '.72rem', color: post.likedBy?.includes(user?.uid) ? '#ef4444' : 'var(--text-muted)' }}>
                        <Heart size={14} fill={post.likedBy?.includes(user?.uid) ? '#ef4444' : 'none'} /> {post.likesCount || 0}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '.72rem', color: 'var(--text-muted)' }}>
                        <MessageCircle size={14} /> {post.commentsCount || 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          READ FULL POST MODAL (with comments)
          ═══════════════════════════════════════════════════════════════ */}
      {activePost && (
        <div onClick={() => setActivePost(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(8px)' }}>
          <div onClick={e => e.stopPropagation()} className="nh-pop" style={{ width: '100%', maxWidth: 700, maxHeight: '90vh', background: 'var(--bg-deep, #0a0f1a)', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border, #1e293b)', display: 'flex', flexDirection: 'column' }}>
            
            {/* Post Header */}
            <div style={{ position: 'relative', padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--accent)', background: 'rgba(16,185,129,.1)', padding: '4px 10px', borderRadius: 6, textTransform: 'uppercase' }}>
                {activePost.category}
              </div>
              <button onClick={() => setActivePost(null)} className="nh-btn" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '6px', borderRadius: 8, display: 'flex' }}>
                <X size={18} />
              </button>
            </div>

            {/* Post Content Scroll Area */}
            <div className="nh-scroll" style={{ overflowY: 'auto', padding: 24 }}>
              {activePost.imageUrl && (
                <img src={activePost.imageUrl} alt={activePost.title} style={{ width: '100%', maxHeight: 300, objectFit: 'cover', borderRadius: 12, marginBottom: 20 }} />
              )}
              
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 12px' }}>{activePost.title}</h1>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: 20 }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{activePost.authorName || 'Admin'}</span>
                <span>•</span>
                <span>{formatTimeAgo(activePost.createdAt)}</span>
              </div>

              <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, fontSize: '.95rem', whiteSpace: 'pre-wrap' }}>{activePost.body}</p>

              {/* Action Bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                <button onClick={() => handleLike(activePost)} className="nh-btn" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: activePost.likedBy?.includes(user?.uid) ? '#ef4444' : 'var(--text-muted)', fontWeight: 700, fontSize: '.85rem' }}>
                  <Heart size={18} fill={activePost.likedBy?.includes(user?.uid) ? '#ef4444' : 'none'} /> {activePost.likesCount || 0} Likes
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontWeight: 700, fontSize: '.85rem' }}>
                  <MessageCircle size={18} /> {activePost.commentsCount || 0} Comments
                </div>

                {isAdmin && (
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button onClick={() => openEdit(activePost)} className="nh-btn" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '6px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: '.75rem' }}>
                      <Pencil size={14} /> Edit
                    </button>
                    <button onClick={() => handleDelete(activePost.id)} className="nh-btn" style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)', color: '#ef4444', padding: '6px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: '.75rem' }}>
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                )}
              </div>

              {/* Comments Section */}
              <div style={{ marginTop: 32 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Comments</h3>
                
                <form onSubmit={handleComment} style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                  <input 
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder={user ? "Add a comment..." : "Commenting as Guest..."}
                    style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', color: 'var(--text-primary)', fontSize: '.85rem', outline: 'none' }}
                  />
                  <button type="submit" disabled={!newComment.trim()} className="nh-btn" style={{ background: 'var(--accent)', color: '#0a0f1a', border: 'none', borderRadius: 10, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <Send size={16} />
                  </button>
                </form>

                {loadingComments ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '.8rem' }}>Loading comments...</div>
                ) : comments.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '.8rem', padding: 20 }}>No comments yet. Start the conversation!</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {comments.map(c => (
                      <div key={c.id} style={{ display: 'flex', gap: 12 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.75rem', fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>
                          {c.authorName?.[0]?.toUpperCase() || 'G'}
                        </div>
                        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, fontSize: '.75rem', color: 'var(--text-primary)' }}>{c.authorName || 'Guest'}</span>
                            <span style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>{formatTimeAgo(c.createdAt)}</span>
                          </div>
                          <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--text-muted)' }}>{c.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          CREATE / EDIT POST MODAL
          ═══════════════════════════════════════════════════════════════ */}
      {isFormOpen && (
        <div onClick={() => setIsFormOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(8px)' }}>
          <div onClick={e => e.stopPropagation()} className="nh-pop" style={{ width: '100%', maxWidth: 600, background: 'var(--bg-deep, #0a0f1a)', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border, #1e293b)' }}>
            
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{editingPost ? 'Edit Post' : 'Create News Post'}</h2>
              <button onClick={() => setIsFormOpen(false)} className="nh-btn" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '6px', borderRadius: 8, display: 'flex' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Title</label>
                <input 
                  value={formData.title}
                  onChange={e => setFormData(d => ({ ...d, title: e.target.value }))}
                  required
                  placeholder="e.g. Mbappe ruled out for 3 weeks"
                  style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', color: 'var(--text-primary)', fontSize: '.9rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Category</label>
                <select 
                  value={formData.category}
                  onChange={e => setFormData(d => ({ ...d, category: e.target.value }))}
                  style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', color: 'var(--text-primary)', fontSize: '.9rem', outline: 'none', boxSizing: 'border-box' }}
                >
                  {CATEGORIES.filter(c => c.key !== 'All').map(c => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Image URL (Optional)</label>
                <input 
                  value={formData.imageUrl}
                  onChange={e => setFormData(d => ({ ...d, imageUrl: e.target.value }))}
                  placeholder="https://image-url.jpg"
                  style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', color: 'var(--text-primary)', fontSize: '.9rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Body / Content</label>
                <textarea 
                  value={formData.body}
                  onChange={e => setFormData(d => ({ ...d, body: e.target.value }))}
                  required
                  rows={6}
                  placeholder="Write the news details here..."
                  style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', color: 'var(--text-primary)', fontSize: '.9rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
              </div>

              <button type="submit" disabled={saving} className="nh-btn" style={{ background: 'var(--accent, #10b981)', color: '#0a0f1a', border: 'none', borderRadius: 10, padding: '14px', fontWeight: 800, fontSize: '.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
                {saving ? <Loader size={16} className="animate-spin" /> : <Plus size={16} />}
                {saving ? 'Saving...' : (editingPost ? 'Update Post' : 'Publish Post')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}