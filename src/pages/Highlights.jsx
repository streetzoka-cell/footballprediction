// ═══════════════════════════════════════════════════════════════
// FILE: src/pages/Highlights.jsx (Pro News Hub)
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Newspaper, X, AlertCircle, Clock, Heart, MessageCircle, 
  Plus, Pencil, Trash2, Send, Tag, Image as ImageIcon, Loader, 
  Sun, Moon, ThumbsUp
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../utils/firebase';
import { 
  collection, query, orderBy, onSnapshot, addDoc, updateDoc, 
  deleteDoc, doc, serverTimestamp, increment, arrayUnion, arrayRemove 
} from 'firebase/firestore';
import SEO from "../components/SEO";

/* ═══════════════════════════════════════════════════════════════
   STYLE INJECTION (Themed)
   ═══════════════════════════════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('news-hub-pro-css')) return;
  const s = document.createElement('style');
  s.id = 'news-hub-pro-css';
  s.textContent = `
    /* THEME VARIABLES */
    .nh-dark {
      --nh-bg: #0b1018;
      --nh-surface: #141a24;
      --nh-surface-hover: #1a212e;
      --nh-border: rgba(255,255,255,0.08);
      --nh-text: #f1f5f9;
      --nh-text-muted: #94a3b8;
      --nh-accent: #3b82f6;
      --nh-accent-bg: rgba(59,130,246,0.1);
      --nh-danger: #ef4444;
      --nh-danger-bg: rgba(239,68,68,0.1);
      --nh-shadow: 0 8px 24px rgba(0,0,0,0.3);
    }
    .nh-light {
      --nh-bg: #f0f2f5;
      --nh-surface: #ffffff;
      --nh-surface-hover: #f8fafc;
      --nh-border: #e2e8f0;
      --nh-text: #1e293b;
      --nh-text-muted: #64748b;
      --nh-accent: #2563eb;
      --nh-accent-bg: #eff6ff;
      --nh-danger: #dc2626;
      --nh-danger-bg: #fee2e2;
      --nh-shadow: 0 8px 24px rgba(0,0,0,0.05);
    }

    @keyframes nh_fadeUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes nh_pop { 0% { transform: scale(1); } 50% { transform: scale(1.3); } 100% { transform: scale(1); } }
    @keyframes nh_shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    
    .nh-shimmer { background: linear-gradient(90deg, var(--nh-surface) 25%, var(--nh-surface-hover) 50%, var(--nh-surface) 75%); background-size: 200% 100%; animation: nh_shimmer 1.5s ease-in-out infinite; }
    .nh-enter { animation: nh_fadeUp .5s cubic-bezier(.22,1,.36,1) both; }
    .nh-btn { transition: all .18s cubic-bezier(.22,1,.36,1); cursor: pointer; outline: none; border: none; font-family: inherit; }
    .nh-btn:hover { transform: translateY(-1px); }
    .nh-btn:active { transform: scale(0.96); }
    
    .nh-like-anim { animation: nh_pop 0.3s ease-in-out; }
    
    .nh-scroll::-webkit-scrollbar { width: 6px; }
    .nh-scroll::-webkit-scrollbar-track { background: transparent; }
    .nh-scroll::-webkit-scrollbar-thumb { background: var(--nh-border); border-radius: 10px; }
    
    /* Dropzone */
    .nh-dropzone { border: 2px dashed var(--nh-border); background: var(--nh-surface-hover); border-radius: 12px; padding: 24px; text-align: center; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--nh-text-muted); }
    .nh-dropzone:hover { border-color: var(--nh-accent); color: var(--nh-accent); }
  `;
  document.head.appendChild(s);
};

const formatTimeAgo = (date) => {
  if (!date) return 'Just now';
  const diff = Date.now() - (date.toMillis ? date.toMillis() : new Date(date).getTime());
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
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
  const user = currentUser; // Alias
  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';

  const [theme, setTheme] = useState('dark');
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');
  const [expandedComments, setExpandedComments] = useState({}); // { postId: true }
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [formData, setFormData] = useState({ title: '', category: 'Official', body: '', imageUrl: '' });
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [comments, setComments] = useState({});
  const [newComments, setNewComments] = useState({}); // { postId: 'text' }
  const fileInputRef = useRef(null);

  // Fetch Posts
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'news_posts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Fetch Comments for expanded posts
  useEffect(() => {
    const expandedIds = Object.keys(expandedComments).filter(id => expandedComments[id]);
    expandedIds.forEach(postId => {
      if (!comments[postId]) {
        const q = query(collection(db, 'news_posts', postId, 'comments'), orderBy('createdAt', 'desc'));
        onSnapshot(q, (snap) => {
          setComments(prev => ({ ...prev, [postId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
        });
      }
    });
  }, [expandedComments]);

  const filteredPosts = activeFilter === 'All' ? posts : posts.filter(p => p.category === activeFilter);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const openCreate = () => {
    setEditingPost(null);
    setFormData({ title: '', category: 'Official', body: '', imageUrl: '' });
    setIsFormOpen(true);
  };

  const openEdit = (post) => {
    setEditingPost(post);
    setFormData({ title: post.title, category: post.category, body: post.body, imageUrl: post.imageUrl || '' });
    setIsFormOpen(true);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 800000) return alert("Image too large (max 800KB for fast loading)");
    
    setUploadingImage(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(d => ({ ...d, imageUrl: reader.result }));
      setUploadingImage(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.body) return;
    if (!user) return alert("Authentication error. Please log in again.");
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
      alert("Failed to save post. Check Firestore rules.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (postId) => {
    if (!window.confirm("Delete this post permanently?")) return;
    try {
      await deleteDoc(doc(db, 'news_posts', postId));
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  // ★ OPTIMISTIC LIKE UPDATE (Instant reaction, no delay)
  const handleLike = async (post) => {
    if (!user) return alert("Please log in to like posts.");
    const hasLiked = post.likedBy?.includes(user.uid);

    // 1. Instant UI Update
    setPosts(prev => prev.map(p => p.id === post.id ? {
      ...p,
      likedBy: hasLiked ? p.likedBy.filter(id => id !== user.uid) : [...(p.likedBy || []), user.uid],
      likesCount: hasLiked ? (p.likesCount || 1) - 1 : (p.likesCount || 0) + 1
    } : p));

    // 2. Background Firebase Update
    try {
      const postRef = doc(db, 'news_posts', post.id);
      await updateDoc(postRef, {
        likedBy: hasLiked ? arrayRemove(user.uid) : arrayUnion(user.uid),
        likesCount: increment(hasLiked ? -1 : 1)
      });
    } catch (err) {
      console.error("Like error:", err);
      // Revert on failure
      setPosts(prev => prev.map(p => p.id === post.id ? {
        ...p,
        likedBy: hasLiked ? [...(p.likedBy || []), user.uid] : p.likedBy.filter(id => id !== user.uid),
        likesCount: hasLiked ? (p.likesCount || 0) + 1 : (p.likesCount || 1) - 1
      } : p));
    }
  };

  const handleComment = async (postId) => {
    const text = newComments[postId]?.trim();
    if (!text || !user) return;
    
    // Optimistic comment update
    const tempComment = {
      id: `temp_${Date.now()}`,
      body: text,
      authorId: user.uid,
      authorName: userProfile?.displayName || 'User',
      createdAt: { toMillis: () => Date.now() }
    };
    setComments(prev => ({ ...prev, [postId]: [tempComment, ...(prev[postId] || [])] }));
    setNewComments(prev => ({ ...prev, [postId]: '' }));

    try {
      await addDoc(collection(db, 'news_posts', postId, 'comments'), {
        body: text,
        authorId: user.uid,
        authorName: userProfile?.displayName || 'User',
        createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'news_posts', postId), { commentsCount: increment(1) });
    } catch (err) {
      console.error("Comment error:", err);
      // Revert UI
      setComments(prev => ({ ...prev, [postId]: prev[postId].filter(c => c.id !== tempComment.id) }));
    }
  };

  return (
    <div className={theme === 'dark' ? 'nh-dark' : 'nh-light'} style={{ minHeight: '100vh', background: 'var(--nh-bg)', color: 'var(--nh-text)', transition: 'background 0.3s' }}>
      <SEO title="Football News Hub | ZOKASCORE" description="Official football news, transfers, and injuries." path="/highlights" />

      {/* HEADER */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--nh-surface)', borderBottom: '1px solid var(--nh-border)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--nh-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <Newspaper size={18} />
            </div>
            <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>News Hub</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={toggleTheme} className="nh-btn" style={{ background: 'var(--nh-surface-hover)', color: 'var(--nh-text-muted)', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            {isAdmin && (
              <button onClick={openCreate} className="nh-btn" style={{ background: 'var(--nh-accent)', color: '#fff', padding: '0 16px', borderRadius: 8, fontWeight: 700, fontSize: '.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Plus size={16} /> New Post
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px 80px' }}>
        {/* FILTER TABS */}
        <div className="nh-scroll" style={{ display: 'flex', gap: 8, marginBottom: 24, overflowX: 'auto', paddingBottom: 4 }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => setActiveFilter(cat.key)}
              className="nh-btn"
              style={{
                padding: '8px 16px',
                borderRadius: 20,
                background: activeFilter === cat.key ? 'var(--nh-accent-bg)' : 'var(--nh-surface)',
                color: activeFilter === cat.key ? 'var(--nh-accent)' : 'var(--nh-text-muted)',
                border: `1px solid ${activeFilter === cat.key ? 'var(--nh-accent)' : 'var(--nh-border)'}`,
                fontWeight: 700,
                fontSize: '.8rem',
                whiteSpace: 'nowrap',
                boxShadow: 'none'
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* LOADING SKELETONS */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[1, 2, 3].map(i => <div key={i} className="nh-shimmer" style={{ height: 300, borderRadius: 16 }} />)}
          </div>
        )}

        {/* NEWS FEED */}
        {!loading && filteredPosts.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--nh-text-muted)', background: 'var(--nh-surface)', borderRadius: 16, border: '1px solid var(--nh-border)' }}>
            <Newspaper size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
            <p>No news articles found.</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {filteredPosts.map((post, i) => {
            const isExpanded = expandedComments[post.id];
            const hasLiked = post.likedBy?.includes(user?.uid);

            return (
              <div key={post.id} className="nh-enter" style={{ animationDelay: `${i * 50}ms`, background: 'var(--nh-surface)', borderRadius: 16, border: '1px solid var(--nh-border)', overflow: 'hidden', boxShadow: 'var(--nh-shadow)' }}>
                
                {/* Post Header */}
                <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--nh-accent-bg)', color: 'var(--nh-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                      {(post.authorName || 'A')[0]}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '.9rem' }}>{post.authorName || 'Admin'}</div>
                      <div style={{ fontSize: '.75rem', color: 'var(--nh-text-muted)' }}>{formatTimeAgo(post.createdAt)} • {post.category}</div>
                    </div>
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => openEdit(post)} className="nh-btn" style={{ background: 'var(--nh-surface-hover)', color: 'var(--nh-text-muted)', padding: 6, borderRadius: 8, border: '1px solid var(--nh-border)' }}><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(post.id)} className="nh-btn" style={{ background: 'var(--nh-danger-bg)', color: 'var(--nh-danger)', padding: 6, borderRadius: 8, border: '1px solid var(--nh-danger-bg)' }}><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>

                {/* Post Body */}
                <div style={{ padding: '0 16px 12px' }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 700, lineHeight: 1.4 }}>{post.title}</h3>
                  <p style={{ margin: 0, color: 'var(--nh-text-muted)', lineHeight: 1.6, fontSize: '.9rem', whiteSpace: 'pre-wrap' }}>{post.body}</p>
                </div>

                {/* Post Image */}
                {post.imageUrl && (
                  <img src={post.imageUrl} alt={post.title} style={{ width: '100%', maxHeight: 400, objectFit: 'cover', borderBottom: '1px solid var(--nh-border)' }} loading="lazy" />
                )}

                {/* Post Stats & Actions */}
                <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--nh-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '.8rem', color: 'var(--nh-text-muted)', fontWeight: 600 }}>
                    <ThumbsUp size={14} fill="var(--nh-accent)" color="var(--nh-accent)" /> 
                    <span>{post.likesCount || 0}</span>
                  </div>
                  <div style={{ fontSize: '.8rem', color: 'var(--nh-text-muted)', cursor: 'pointer', fontWeight: 600 }} onClick={() => setExpandedComments(p => ({ ...p, [post.id]: !p[post.id] }))}>
                    {post.commentsCount || 0} Comments
                  </div>
                </div>

                <div style={{ display: 'flex', padding: '4px 8px', borderTop: '1px solid var(--nh-border)' }}>
                  <button 
                    onClick={() => handleLike(post)} 
                    className="nh-btn nh-like-anim" 
                    key={hasLiked} /* Key forces re-render for animation */
                    style={{ flex: 1, padding: '10px', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: hasLiked ? 'var(--nh-accent)' : 'var(--nh-text-muted)', fontWeight: 600, background: 'transparent' }}
                  >
                    <Heart size={18} fill={hasLiked ? 'var(--nh-accent)' : 'none'} /> Like
                  </button>
                  <button 
                    onClick={() => setExpandedComments(p => ({ ...p, [post.id]: !p[post.id] }))} 
                    className="nh-btn" 
                    style={{ flex: 1, padding: '10px', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--nh-text-muted)', fontWeight: 600, background: 'transparent' }}
                  >
                    <MessageCircle size={18} /> Comment
                  </button>
                </div>

                {/* Comments Section */}
                {isExpanded && (
                  <div style={{ padding: '16px', background: 'var(--nh-bg)', borderTop: '1px solid var(--nh-border)' }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                      <input 
                        value={newComments[post.id] || ''}
                        onChange={e => setNewComments(prev => ({ ...prev, [post.id]: e.target.value }))}
                        placeholder="Write a comment..."
                        style={{ flex: 1, background: 'var(--nh-surface)', border: '1px solid var(--nh-border)', borderRadius: 20, padding: '10px 16px', color: 'var(--nh-text)', fontSize: '.85rem', outline: 'none' }}
                      />
                      <button onClick={() => handleComment(post.id)} className="nh-btn" style={{ background: 'var(--nh-accent)', color: '#fff', borderRadius: 20, padding: '0 16px', display: 'flex', alignItems: 'center' }}>
                        <Send size={16} />
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {comments[post.id]?.length === 0 && <p style={{ fontSize: '.8rem', color: 'var(--nh-text-muted)', textAlign: 'center' }}>No comments yet.</p>}
                      {comments[post.id]?.map(c => (
                        <div key={c.id} style={{ display: 'flex', gap: 10 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--nh-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem', fontWeight: 700, color: 'var(--nh-text-muted)', flexShrink: 0 }}>
                            {c.authorName?.[0] || 'G'}
                          </div>
                          <div style={{ background: 'var(--nh-surface)', borderRadius: 12, padding: '10px 14px', flex: 1 }}>
                            <div style={{ fontSize: '.75rem', fontWeight: 700, marginBottom: 2 }}>{c.authorName || 'Guest'}</div>
                            <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--nh-text)' }}>{c.body}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          CREATE / EDIT POST MODAL
          ═══════════════════════════════════════════════════════════════ */}
      {isFormOpen && (
        <div onClick={() => setIsFormOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(8px)' }}>
          <div onClick={e => e.stopPropagation()} className="nh-enter" style={{ width: '100%', maxWidth: 550, maxHeight: '90vh', background: 'var(--nh-surface)', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--nh-border)', display: 'flex', flexDirection: 'column' }}>
            
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--nh-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>{editingPost ? 'Edit Post' : 'Create New Post'}</h2>
              <button onClick={() => setIsFormOpen(false)} className="nh-btn" style={{ background: 'var(--nh-surface-hover)', color: 'var(--nh-text)', padding: 6, borderRadius: 8, border: '1px solid var(--nh-border)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }} className="nh-scroll">
              <div>
                <label style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--nh-text-muted)', marginBottom: 6, display: 'block' }}>Title</label>
                <input 
                  value={formData.title}
                  onChange={e => setFormData(d => ({ ...d, title: e.target.value }))}
                  required
                  placeholder="e.g. Mbappe ruled out for 3 weeks"
                  style={{ width: '100%', background: 'var(--nh-bg)', border: '1px solid var(--nh-border)', borderRadius: 10, padding: '12px 16px', color: 'var(--nh-text)', fontSize: '.9rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--nh-text-muted)', marginBottom: 6, display: 'block' }}>Category</label>
                <select 
                  value={formData.category}
                  onChange={e => setFormData(d => ({ ...d, category: e.target.value }))}
                  style={{ width: '100%', background: 'var(--nh-bg)', border: '1px solid var(--nh-border)', borderRadius: 10, padding: '12px 16px', color: 'var(--nh-text)', fontSize: '.9rem', outline: 'none', boxSizing: 'border-box' }}
                >
                  {CATEGORIES.filter(c => c.key !== 'All').map(c => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* IMAGE UPLOAD ZONE */}
              <div>
                <label style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--nh-text-muted)', marginBottom: 6, display: 'block' }}>Attachment (Optional)</label>
                {formData.imageUrl ? (
                  <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--nh-border)' }}>
                    <img src={formData.imageUrl} alt="Preview" style={{ width: '100%', maxHeight: 200, objectFit: 'cover' }} />
                    <button type="button" onClick={() => setFormData(d => ({ ...d, imageUrl: '' }))} className="nh-btn" style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 8, padding: 6, border: 'none' }}>
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="nh-dropzone" onClick={() => fileInputRef.current?.click()}>
                    {uploadingImage ? <Loader size={24} className="animate-spin" /> : <ImageIcon size={24} />}
                    <span style={{ fontSize: '.85rem', fontWeight: 600 }}>Click to upload from device</span>
                    <span style={{ fontSize: '.7rem' }}>Max 800KB</span>
                    <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} style={{ display: 'none' }} />
                  </div>
                )}
              </div>

              <div>
                <label style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--nh-text-muted)', marginBottom: 6, display: 'block' }}>Body / Content</label>
                <textarea 
                  value={formData.body}
                  onChange={e => setFormData(d => ({ ...d, body: e.target.value }))}
                  required
                  rows={6}
                  placeholder="Write the news details here..."
                  style={{ width: '100%', background: 'var(--nh-bg)', border: '1px solid var(--nh-border)', borderRadius: 10, padding: '12px 16px', color: 'var(--nh-text)', fontSize: '.9rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5 }}
                />
              </div>

              <button type="submit" disabled={saving} className="nh-btn" style={{ background: 'var(--nh-accent)', color: '#fff', border: 'none', borderRadius: 10, padding: '14px', fontWeight: 800, fontSize: '.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {saving ? <Loader size={18} className="animate-spin" /> : <Plus size={18} />}
                {saving ? 'Saving...' : (editingPost ? 'Update Post' : 'Publish Post')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}