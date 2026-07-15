// ═══════════════════════════════════════════════════════════════
// FILE: src/pages/Highlights.jsx (Ultimate Pro News Hub - Polished)
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Newspaper, X, Clock, Heart, MessageCircle, Plus, Pencil, Trash2, 
  Send, Image as ImageIcon, Loader, Sun, Moon, ArrowLeft, Eye, 
  Bookmark, Share2, Flame, Link as LinkIcon, ArrowUp, ChevronDown
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../utils/firebase';
import { 
  collection, query, orderBy, onSnapshot, addDoc, updateDoc, 
  deleteDoc, doc, serverTimestamp, increment, arrayUnion, arrayRemove, getDoc
} from 'firebase/firestore';
import SEO from "../components/SEO";

/* ═══════════════════════════════════════════════════════════════
   STYLE INJECTION (Themed & Polished)
   ═══════════════════════════════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('news-hub-ultimate-css')) return;
  const s = document.createElement('style');
  s.id = 'news-hub-ultimate-css';
  s.textContent = `
    .nh-dark { --nh-bg: #0b1018; --nh-surface: #141a24; --nh-surface-hover: #1a212e; --nh-border: rgba(255,255,255,0.08); --nh-text: #f1f5f9; --nh-text-muted: #94a3b8; --nh-accent: #3b82f6; --nh-accent-bg: rgba(59,130,246,0.1); --nh-danger: #ef4444; --nh-danger-bg: rgba(239,68,68,0.1); --nh-shadow: 0 8px 24px rgba(0,0,0,0.3); --nh-gold: #f5c542; }
    .nh-light { --nh-bg: #f0f2f5; --nh-surface: #ffffff; --nh-surface-hover: #f8fafc; --nh-border: #e2e8f0; --nh-text: #1e293b; --nh-text-muted: #64748b; --nh-accent: #2563eb; --nh-accent-bg: #eff6ff; --nh-danger: #dc2626; --nh-danger-bg: #fee2e2; --nh-shadow: 0 8px 24px rgba(0,0,0,0.05); --nh-gold: #eab308; }
    
    @keyframes nh_fadeUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes nh_pop { 0% { transform: scale(1); } 50% { transform: scale(1.3); } 100% { transform: scale(1); } }
    @keyframes nh_shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    @keyframes nh_modal_pop { 0% { transform: scale(0.95); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
    
    .nh-shimmer { background: linear-gradient(90deg, var(--nh-surface) 25%, var(--nh-surface-hover) 50%, var(--nh-surface) 75%); background-size: 200% 100%; animation: nh_shimmer 1.5s ease-in-out infinite; }
    .nh-enter { animation: nh_fadeUp .5s cubic-bezier(.22,1,.36,1) both; }
    .nh-modal-pop { animation: nh_modal_pop 0.25s cubic-bezier(0.22, 1, 0.36, 1) both; }
    
    .nh-btn { transition: all .18s cubic-bezier(.22,1,.36,1); cursor: pointer; outline: none; border: none; font-family: inherit; }
    .nh-btn:hover { transform: translateY(-1px); }
    .nh-btn:active { transform: scale(0.96); }
    
    .nh-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
    .nh-scroll::-webkit-scrollbar-track { background: transparent; }
    .nh-scroll::-webkit-scrollbar-thumb { background: var(--nh-border); border-radius: 10px; }
    
    .nh-dropzone { border: 2px dashed var(--nh-border); background: var(--nh-surface-hover); border-radius: 12px; padding: 24px; text-align: center; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--nh-text-muted); }
    .nh-dropzone:hover { border-color: var(--nh-accent); color: var(--nh-accent); }
    
    .nh-fab { position: fixed; bottom: 24px; right: 24px; width: 48px; height: 48px; border-radius: 50%; background: var(--nh-accent); color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.3); cursor: pointer; z-index: 50; border: none; transition: transform 0.2s, opacity 0.3s; }
    .nh-fab:hover { transform: scale(1.1) translateY(-2px); }
    
    .nh-read-more { color: var(--nh-accent); font-weight: 700; cursor: pointer; display: inline-block; margin-top: 4px; font-size: 0.8rem; }
    .nh-load-more { width: 100%; padding: 14px; border-radius: 12px; background: var(--nh-surface); border: 1px solid var(--nh-border); color: var(--nh-text-muted); font-weight: 700; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .nh-load-more:hover { color: var(--nh-accent); border-color: var(--nh-accent); background: var(--nh-accent-bg); }
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

const calcReadTime = (body) => {
  const words = body?.trim().split(/\s+/).length || 1;
  return Math.max(1, Math.ceil(words / 200));
};

const BADGES = {
  'Breaking': { color: '#ef4444', bg: 'rgba(239,68,68,.15)', label: '🔴 BREAKING' },
  'Official': { color: '#10b981', bg: 'rgba(16,185,129,.15)', label: '🟢 OFFICIAL' },
  'Rumour': { color: '#f5c542', bg: 'rgba(245,197,66,.15)', label: '🟡 RUMOUR' },
  'Match Report': { color: '#3b82f6', bg: 'rgba(59,130,246,.15)', label: '🔵 MATCH REPORT' },
  'Transfers': { color: '#f97316', bg: 'rgba(249,115,22,.15)', label: '🟠 TRANSFERS' },
  'Injuries': { color: '#a855f7', bg: 'rgba(168,85,247,.15)', label: '🟣 INJURIES' },
};

const CATEGORIES = [
  { key: 'All', label: 'All News' },
  { key: 'Breaking', label: 'Breaking' },
  { key: 'Official', label: 'Official' },
  { key: 'Transfers', label: 'Transfers' },
  { key: 'Match Report', label: 'Match Reports' },
  { key: 'Injuries', label: 'Injuries' },
];

const REACTIONS = [
  { key: 'like', icon: '👍', label: 'Like' },
  { key: 'fire', icon: '🔥', label: 'Fire' },
  { key: 'wow', icon: '😮', label: 'Wow' },
  { key: 'funny', icon: '😂', label: 'Funny' },
  { key: 'sad', icon: '😢', label: 'Sad' },
];

/* ═══════════════════════════════════════════════════════════════
   MAIN NEWS COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function Highlights() {
  injectStyles();
  const { currentUser, userProfile } = useAuth();
  const user = currentUser;
  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';
  
  const { id: urlPostId, author: authorFilter } = useParams();
  const navigate = useNavigate();

  const [theme, setTheme] = useState('dark');
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');
  const [expandedComments, setExpandedComments] = useState({});
  const [activePost, setActivePost] = useState(null);
  const [relatedMatch, setRelatedMatch] = useState(null);
  const [savedPosts, setSavedPosts] = useState(() => JSON.parse(localStorage.getItem('nh_saved') || '[]'));
  const [shareData, setShareData] = useState(null);
  
  // Pagination & Scroll
  const [visibleCount, setVisibleCount] = useState(15);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [formData, setFormData] = useState({ title: '', category: 'Breaking', body: '', imageUrl: '', relatedMatchId: '' });
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [comments, setComments] = useState({});
  const [newComments, setNewComments] = useState({});
  const fileInputRef = useRef(null);

  // Scroll Listener for Back to Top
  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 500);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Reset visible count on filter change
  useEffect(() => { setVisibleCount(15); }, [activeFilter, authorFilter]);

  // Fetch Feed Posts
  useEffect(() => {
    if (!db) return;
    setLoading(true);
    let q = query(collection(db, 'news_posts'), orderBy('createdAt', 'desc'));
    
    const unsub = onSnapshot(q, (snap) => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [db]);

  // Fetch Single Post if URL changes
  useEffect(() => {
    if (!db || !urlPostId) {
      setActivePost(null);
      setRelatedMatch(null);
      return;
    }
    setLoading(true);
    getDoc(doc(db, 'news_posts', urlPostId)).then(snap => {
      if (snap.exists()) {
        const postData = { id: snap.id, ...snap.data() };
        setActivePost(postData);
        updateDoc(doc(db, 'news_posts', urlPostId), { views: increment(1) }).catch(()=>{});

        if (postData.relatedMatchId) {
          getDoc(doc(db, 'active_predictions', postData.relatedMatchId)).then(mSnap => {
            if (mSnap.exists()) setRelatedMatch({ id: mSnap.id, ...mSnap.data() });
          });
        }
      } else {
        navigate('/highlights'); 
      }
      setLoading(false);
    });
  }, [db, urlPostId, navigate]);

  // Fetch Comments
  useEffect(() => {
    const targetId = activePost ? activePost.id : Object.keys(expandedComments).find(id => expandedComments[id]);
    if (!targetId || comments[targetId]) return;

    const q = query(collection(db, 'news_posts', targetId, 'comments'), orderBy('createdAt', 'desc'));
    onSnapshot(q, (snap) => {
      setComments(prev => ({ ...prev, [targetId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
    });
  }, [expandedComments, activePost]);

  const toggleSave = (postId) => {
    setSavedPosts(prev => {
      const newArr = prev.includes(postId) ? prev.filter(id => id !== postId) : [...prev, postId];
      localStorage.setItem('nh_saved', JSON.stringify(newArr));
      return newArr;
    });
  };

  const filteredPosts = useMemo(() => {
    let list = posts;
    if (authorFilter) list = list.filter(p => p.authorId === authorFilter);
    if (activeFilter === 'Saved') list = list.filter(p => savedPosts.includes(p.id));
    else if (activeFilter !== 'All') list = list.filter(p => p.category === activeFilter);
    return list;
  }, [posts, activeFilter, authorFilter, savedPosts]);

  const trendingPosts = useMemo(() => [...posts].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5), [posts]);
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const openCreate = () => {
    setEditingPost(null);
    setFormData({ title: '', category: 'Breaking', body: '', imageUrl: '', relatedMatchId: '' });
    setIsFormOpen(true);
  };

  const openEdit = (post) => {
    setEditingPost(post);
    setFormData({ title: post.title, category: post.category, body: post.body, imageUrl: post.imageUrl || '', relatedMatchId: post.relatedMatchId || '' });
    setIsFormOpen(true);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingImage(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const MAX_WIDTH = 1200;
        if (width > MAX_WIDTH) { height = Math.round((height * MAX_WIDTH) / width); width = MAX_WIDTH; }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        setFormData(d => ({ ...d, imageUrl: canvas.toDataURL('image/jpeg', 0.7) }));
        setUploadingImage(false);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.body) return;
    if (!user) return alert("Authentication error.");
    setSaving(true);

    try {
      const payload = { ...formData, relatedMatchId: formData.relatedMatchId || null };
      if (editingPost) {
        await updateDoc(doc(db, 'news_posts', editingPost.id), { ...payload, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'news_posts'), {
          ...payload,
          authorId: user.uid,
          authorName: userProfile?.displayName || 'Admin',
          authorRole: userProfile?.role || 'admin',
          createdAt: serverTimestamp(),
          views: 0, commentsCount: 0, likedBy: [], reactions: { like: 0, fire: 0, wow: 0, funny: 0, sad: 0 }
        });
      }
      setIsFormOpen(false);
    } catch (err) {
      console.error("Save post error:", err);
      alert("Failed to save post.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (postId) => {
    if (!window.confirm("Delete this post permanently?")) return;
    try { await deleteDoc(doc(db, 'news_posts', postId)); navigate('/highlights'); } 
    catch (err) { console.error("Delete error:", err); }
  };

  const handleReaction = async (post, type) => {
    if (!user) return alert("Please log in to react.");
    const currentReactions = post.reactions || {};
    const userReactedKey = `reacted_${type}_${user.uid}`;
    const hasReacted = post[userReactedKey];

    const updateState = (p) => p.id === post.id ? {
      ...p,
      [userReactedKey]: !hasReacted,
      reactions: { ...currentReactions, [type]: (currentReactions[type] || 0) + (hasReacted ? -1 : 1) }
    } : p;

    if (activePost) setActivePost(updateState);
    else setPosts(prev => prev.map(updateState));

    try {
      const updateObj = {
        [`reactions.${type}`]: increment(hasReacted ? -1 : 1),
        [userReactedKey]: !hasReacted
      };
      await updateDoc(doc(db, 'news_posts', post.id), updateObj);
    } catch (err) {
      console.error("Reaction error:", err);
    }
  };

  const handleComment = async (postId) => {
    const text = newComments[postId]?.trim();
    if (!text || !user) return;
    
    const tempComment = { id: `temp_${Date.now()}`, body: text, authorId: user.uid, authorName: userProfile?.displayName || 'User', createdAt: { toMillis: () => Date.now() } };
    setComments(prev => ({ ...prev, [postId]: [tempComment, ...(prev[postId] || [])] }));
    setNewComments(prev => ({ ...prev, [postId]: '' }));

    try {
      await addDoc(collection(db, 'news_posts', postId, 'comments'), { body: text, authorId: user.uid, authorName: userProfile?.displayName || 'User', createdAt: serverTimestamp() });
      await updateDoc(doc(db, 'news_posts', postId), { commentsCount: increment(1) });
    } catch (err) {
      console.error("Comment error:", err);
      setComments(prev => ({ ...prev, [postId]: prev[postId].filter(c => c.id !== tempComment.id) }));
    }
  };

  const handleShare = (post) => {
    const url = `https://zokascore.xyz/highlights/${post.id}`;
    if (navigator.share) {
      navigator.share({ title: post.title, text: post.body.substring(0, 100), url }).catch(()=>{});
    } else {
      setShareData({ ...post, url });
    }
  };

  const generateJsonLd = (post) => {
    if (!post) return null;
    return {
      "@context": "https://schema.org", "@type": "NewsArticle",
      "headline": post.title, "image": [post.imageUrl || "https://zokascore.xyz/logo.png"],
      "datePublished": post.createdAt?.toMillis ? new Date(post.createdAt.toMillis()).toISOString() : new Date().toISOString(),
      "author": [{ "@type": "Person", "name": post.authorName || "Admin" }],
      "publisher": { "@type": "Organization", "name": "ZOKASCORE" },
      "description": post.body.substring(0, 150), "articleSection": post.category
    };
  };

  const seoPost = activePost || posts[0]; 

  return (
    <div className={theme === 'dark' ? 'nh-dark' : 'nh-light'} style={{ minHeight: '100vh', background: 'var(--nh-bg)', color: 'var(--nh-text)', transition: 'background 0.3s' }}>
      
      <SEO 
        title={seoPost ? seoPost.title : "Football News Hub | ZOKASCORE"}
        description={seoPost ? seoPost.body.substring(0, 150) : "Official football news, transfers, and injuries."}
        path={seoPost ? `/highlights/${seoPost.id}` : '/highlights'}
        image={seoPost?.imageUrl}
        type="article"
        structuredData={generateJsonLd(seoPost)}
      />

      {/* HEADER */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--nh-surface)', borderBottom: '1px solid var(--nh-border)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => { navigate('/highlights'); setActiveFilter('All'); }}>
            {activePost && <ArrowLeft size={18} />}
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

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '20px 16px 80px' }}>
        
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[1, 2, 3].map(i => <div key={i} className="nh-shimmer" style={{ height: 300, borderRadius: 16 }} />)}
          </div>
        ) : activePost ? (
          <SinglePostView 
            post={activePost} 
            comments={comments[activePost.id] || []} 
            relatedMatch={relatedMatch}
            isAdmin={isAdmin} 
            user={user} 
            savedPosts={savedPosts}
            onToggleSave={toggleSave}
            onShare={handleShare}
            onReaction={handleReaction} 
            onEdit={openEdit} 
            onDelete={handleDelete}
            onAuthorClick={() => navigate(`/highlights/author/${activePost.authorId}`)}
            relatedPosts={posts.filter(p => p.category === activePost.category && p.id !== activePost.id).slice(0, 3)}
            onRelatedClick={(id) => navigate(`/highlights/${id}`)}
            newComments={newComments}
            setNewComments={setNewComments}
            handleComment={handleComment}
          />
        ) : (
          // FEED VIEW
          <>
            {/* FILTER TABS */}
            <div className="nh-scroll" style={{ display: 'flex', gap: 8, marginBottom: 24, overflowX: 'auto', paddingBottom: 4 }}>
              {CATEGORIES.map(cat => (
                <button key={cat.key} onClick={() => setActiveFilter(cat.key)} className="nh-btn" style={{ padding: '8px 16px', borderRadius: 20, background: activeFilter === cat.key ? 'var(--nh-accent-bg)' : 'var(--nh-surface)', color: activeFilter === cat.key ? 'var(--nh-accent)' : 'var(--nh-text-muted)', border: `1px solid ${activeFilter === cat.key ? 'var(--nh-accent)' : 'var(--nh-border)'}`, fontWeight: 700, fontSize: '.8rem', whiteSpace: 'nowrap' }}>
                  {cat.label}
                </button>
              ))}
              {savedPosts.length > 0 && (
                <button onClick={() => setActiveFilter('Saved')} className="nh-btn" style={{ padding: '8px 16px', borderRadius: 20, background: activeFilter === 'Saved' ? 'var(--nh-accent-bg)' : 'var(--nh-surface)', color: activeFilter === 'Saved' ? 'var(--nh-accent)' : 'var(--nh-text-muted)', border: `1px solid ${activeFilter === 'Saved' ? 'var(--nh-accent)' : 'var(--nh-border)'}`, fontWeight: 700, fontSize: '.8rem', whiteSpace: 'nowrap' }}>
                  Saved ({savedPosts.length})
                </button>
              )}
            </div>

            {authorFilter && (
              <div style={{ marginBottom: 20, padding: '10px 16px', background: 'var(--nh-accent-bg)', border: '1px solid var(--nh-accent)', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--nh-accent)', fontWeight: 700, fontSize: '.85rem' }}>Showing posts by specific author</span>
                <button onClick={() => navigate('/highlights')} className="nh-btn" style={{ color: 'var(--nh-accent)', background: 'transparent', fontWeight: 800 }}>Clear</button>
              </div>
            )}

            {/* TRENDING CAROUSEL */}
            {trendingPosts.length > 1 && activeFilter === 'All' && !authorFilter && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <Flame size={16} style={{ color: '#ef4444' }} />
                  <span style={{ fontSize: '.85rem', fontWeight: 800 }}>Trending Now</span>
                </div>
                <div className="nh-scroll" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
                  {trendingPosts.map(p => (
                    <div key={p.id} onClick={() => navigate(`/highlights/${p.id}`)} style={{ minWidth: 200, maxWidth: 200, background: 'var(--nh-surface)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--nh-border)', cursor: 'pointer', transition: 'transform 0.2s' }} className="nh-btn">
                      <img src={p.imageUrl || 'https://via.placeholder.com/200x100'} style={{ width: '100%', height: 100, objectFit: 'cover' }} alt="" />
                      <div style={{ padding: 10 }}>
                        <div style={{ fontSize: '.6rem', fontWeight: 800, color: BADGES[p.category]?.color || 'var(--nh-text-muted)', marginBottom: 4 }}>{BADGES[p.category]?.label || p.category}</div>
                        <div style={{ fontSize: '.75rem', fontWeight: 700, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.title}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {filteredPosts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--nh-text-muted)', background: 'var(--nh-surface)', borderRadius: 16, border: '1px solid var(--nh-border)' }}>
                <Newspaper size={40} style={{ opacity: 0.3, marginBottom: 12 }} /><p>No news articles found.</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {filteredPosts.slice(0, visibleCount).map((post, i) => (
                    <PostCard 
                      key={post.id} 
                      post={post} 
                      index={i} 
                      isAdmin={isAdmin} 
                      user={user} 
                      savedPosts={savedPosts}
                      onToggleSave={toggleSave}
                      onShare={handleShare}
                      onReaction={handleReaction} 
                      onEdit={openEdit} 
                      onDelete={handleDelete}
                      onExpand={(postId) => navigate(`/highlights/${postId}`)}
                      onAuthorClick={() => navigate(`/highlights/author/${post.authorId}`)}
                      isHero={i === 0 && activeFilter === 'All' && !authorFilter}
                    />
                  ))}
                </div>

                {/* LOAD MORE BUTTON */}
                {filteredPosts.length > visibleCount && (
                  <button onClick={() => setVisibleCount(c => c + 15)} className="nh-load-more" style={{ marginTop: 24 }}>
                    <ChevronDown size={16} /> Load More Articles
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* FLOATING BACK TO TOP */}
      {showScrollTop && (
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="nh-fab nh-enter" style={{ animationDuration: '0.3s' }}>
          <ArrowUp size={24} />
        </button>
      )}

      {/* CREATE / EDIT MODAL */}
      {isFormOpen && (
        <div onClick={() => setIsFormOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(8px)' }}>
          <div onClick={e => e.stopPropagation()} className="nh-modal-pop" style={{ width: '100%', maxWidth: 550, maxHeight: '90vh', background: 'var(--nh-surface)', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--nh-border)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--nh-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>{editingPost ? 'Edit Post' : 'Create New Post'}</h2>
              <button onClick={() => setIsFormOpen(false)} className="nh-btn" style={{ background: 'var(--nh-surface-hover)', color: 'var(--nh-text)', padding: 6, borderRadius: 8, border: '1px solid var(--nh-border)' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }} className="nh-scroll">
              <div>
                <label style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--nh-text-muted)', marginBottom: 6, display: 'block' }}>Title</label>
                <input value={formData.title} onChange={e => setFormData(d => ({ ...d, title: e.target.value }))} required placeholder="e.g. Mbappe ruled out for 3 weeks" style={{ width: '100%', background: 'var(--nh-bg)', border: '1px solid var(--nh-border)', borderRadius: 10, padding: '12px 16px', color: 'var(--nh-text)', fontSize: '.9rem', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--nh-text-muted)', marginBottom: 6, display: 'block' }}>Category</label>
                  <select value={formData.category} onChange={e => setFormData(d => ({ ...d, category: e.target.value }))} style={{ width: '100%', background: 'var(--nh-bg)', border: '1px solid var(--nh-border)', borderRadius: 10, padding: '12px 16px', color: 'var(--nh-text)', fontSize: '.9rem', outline: 'none', boxSizing: 'border-box' }}>
                    {Object.keys(BADGES).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--nh-text-muted)', marginBottom: 6, display: 'block' }}>Match ID (Optional)</label>
                  <input value={formData.relatedMatchId} onChange={e => setFormData(d => ({ ...d, relatedMatchId: e.target.value }))} placeholder="e.g. feat_2023-10-01_123" style={{ width: '100%', background: 'var(--nh-bg)', border: '1px solid var(--nh-border)', borderRadius: 10, padding: '12px 16px', color: 'var(--nh-text)', fontSize: '.9rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--nh-text-muted)', marginBottom: 6, display: 'block' }}>Attachment (Optional)</label>
                {formData.imageUrl ? (
                  <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--nh-border)' }}>
                    <img src={formData.imageUrl} alt="Preview" style={{ width: '100%', maxHeight: 200, objectFit: 'cover' }} />
                    <button type="button" onClick={() => setFormData(d => ({ ...d, imageUrl: '' }))} className="nh-btn" style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 8, padding: 6, border: 'none' }}><X size={16} /></button>
                  </div>
                ) : (
                  <div className="nh-dropzone" onClick={() => fileInputRef.current?.click()}>
                    {uploadingImage ? <Loader size={24} className="animate-spin" /> : <ImageIcon size={24} />}
                    <span style={{ fontSize: '.85rem', fontWeight: 600 }}>Click to upload from device</span>
                    <span style={{ fontSize: '.7rem' }}>Auto-compresses for fast loading</span>
                    <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} style={{ display: 'none' }} />
                  </div>
                )}
              </div>
              <div>
                <label style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--nh-text-muted)', marginBottom: 6, display: 'block' }}>Body / Content</label>
                <textarea value={formData.body} onChange={e => setFormData(d => ({ ...d, body: e.target.value }))} required rows={6} placeholder="Write the news details here..." style={{ width: '100%', background: 'var(--nh-bg)', border: '1px solid var(--nh-border)', borderRadius: 10, padding: '12px 16px', color: 'var(--nh-text)', fontSize: '.9rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5 }} />
              </div>
              <button type="submit" disabled={saving} className="nh-btn" style={{ background: 'var(--nh-accent)', color: '#fff', border: 'none', borderRadius: 10, padding: '14px', fontWeight: 800, fontSize: '.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {saving ? <Loader size={18} className="animate-spin" /> : <Plus size={18} />}
                {saving ? 'Saving...' : (editingPost ? 'Update Post' : 'Publish Post')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SHARE MODAL */}
      {shareData && (
        <div onClick={() => setShareData(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} className="nh-modal-pop" style={{ background: 'var(--nh-surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 320, textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 16px' }}>Share Article</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <a href={`https://wa.me/?text=${encodeURIComponent(shareData.title + " " + shareData.url)}`} target="_blank" rel="noreferrer" className="nh-btn" style={{ background: '#25D366', color: '#fff', padding: '12px', borderRadius: 10, textDecoration: 'none' }}>WhatsApp</a>
              <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareData.title)}&url=${encodeURIComponent(shareData.url)}`} target="_blank" rel="noreferrer" className="nh-btn" style={{ background: '#1DA1F2', color: '#fff', padding: '12px', borderRadius: 10, textDecoration: 'none' }}>Twitter</a>
              <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareData.url)}`} target="_blank" rel="noreferrer" className="nh-btn" style={{ background: '#1877F2', color: '#fff', padding: '12px', borderRadius: 10, textDecoration: 'none' }}>Facebook</a>
              <a href={`https://t.me/share/url?url=${encodeURIComponent(shareData.url)}&text=${encodeURIComponent(shareData.title)}`} target="_blank" rel="noreferrer" className="nh-btn" style={{ background: '#0088cc', color: '#fff', padding: '12px', borderRadius: 10, textDecoration: 'none' }}>Telegram</a>
            </div>
            <button onClick={() => { navigator.clipboard.writeText(shareData.url); alert('Link copied!'); }} className="nh-btn" style={{ width: '100%', marginTop: 12, background: 'var(--nh-surface-hover)', color: 'var(--nh-text)', padding: '12px', borderRadius: 10, border: '1px solid var(--nh-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <LinkIcon size={16} /> Copy Link
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   POST CARD COMPONENT (For Feed)
   ═══════════════════════════════════════════════════════════════ */
function PostCard({ post, index, isAdmin, user, savedPosts, onToggleSave, onShare, onReaction, onEdit, onDelete, onExpand, onAuthorClick, isHero }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isSaved = savedPosts.includes(post.id);
  const badge = BADGES[post.category] || { color: 'var(--nh-text-muted)', bg: 'var(--nh-surface-hover)', label: post.category };

  const heroStyles = isHero ? { border: '1px solid var(--nh-border)', boxShadow: 'var(--nh-shadow)' } : {};

  return (
    <div className="nh-enter" style={{ animationDelay: `${index * 50}ms`, background: 'var(--nh-surface)', borderRadius: 16, overflow: 'hidden', ...heroStyles }}>
      {isHero && post.imageUrl && (
        <div onClick={() => onExpand(post.id)} style={{ cursor: 'pointer', position: 'relative', height: 240, overflow: 'hidden' }}>
          <img src={post.imageUrl} alt={post.title} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.5s' }} loading="lazy" />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent 60%)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16 }}>
            <span style={{ display: 'inline-block', padding: '4px 8px', borderRadius: 4, background: badge.bg, color: badge.color, fontSize: '.65rem', fontWeight: 800, marginBottom: 8 }}>{badge.label}</span>
            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#fff', lineHeight: 1.3, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{post.title}</h2>
          </div>
        </div>
      )}

      <div style={{ padding: 16 }}>
        {/* HEADER */}
        {!isHero && (
          <div onClick={() => onExpand(post.id)} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div onClick={(e) => { e.stopPropagation(); onAuthorClick(); }} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--nh-accent-bg)', color: 'var(--nh-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, cursor: 'pointer' }}>{(post.authorName || 'A')[0]}</div>
              <div style={{ flex: 1 }}>
                <div onClick={(e) => { e.stopPropagation(); onAuthorClick(); }} style={{ fontWeight: 700, fontSize: '.8rem', cursor: 'pointer' }}>{post.authorName || 'Admin'}</div>
                <div style={{ fontSize: '.7rem', color: 'var(--nh-text-muted)' }}>{formatTimeAgo(post.createdAt)} • {calcReadTime(post.body)} min read • <Eye size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> {post.views || 0}</div>
              </div>
              <span style={{ padding: '4px 8px', borderRadius: 4, background: badge.bg, color: badge.color, fontSize: '.6rem', fontWeight: 800 }}>{badge.label}</span>
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 700, lineHeight: 1.4 }}>{post.title}</h3>
            
            <p style={{ margin: 0, color: 'var(--nh-text-muted)', lineHeight: 1.6, fontSize: '.9rem', display: isExpanded ? 'block' : '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {post.body}
            </p>
            {!isExpanded && post.body.length > 100 && <span className="nh-read-more" onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }}>Read more</span>}
            {isExpanded && <span className="nh-read-more" onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}>Show less</span>}
          </div>
        )}

        {isHero && (
           <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
             <div onClick={() => onAuthorClick()} style={{ fontSize: '.75rem', color: 'var(--nh-text-muted)', cursor: 'pointer' }}>By <span style={{ color: 'var(--nh-text)', fontWeight: 700 }}>{post.authorName || 'Admin'}</span> • {calcReadTime(post.body)} min read • <Eye size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> {post.views || 0}</div>
             <div style={{ display: 'flex', gap: 8 }}>
               <button onClick={() => onToggleSave(post.id)} className="nh-btn" style={{ background: 'none', color: isSaved ? 'var(--nh-gold)' : 'var(--nh-text-muted)' }}><Bookmark size={18} fill={isSaved ? 'var(--nh-gold)' : 'none'} /></button>
               <button onClick={() => onShare(post)} className="nh-btn" style={{ background: 'none', color: 'var(--nh-text-muted)' }}><Share2 size={18} /></button>
             </div>
           </div>
        )}

        {/* ACTIONS */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--nh-border)' }}>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }} className="nh-scroll">
            {REACTIONS.map(r => {
              const count = post.reactions?.[r.key] || 0;
              const hasReacted = post[`reacted_${r.key}_${user?.uid}`];
              return (
                <button key={r.key} onClick={() => onReaction(post, r.key)} className="nh-btn" style={{ padding: '6px 10px', borderRadius: 20, background: hasReacted ? 'var(--nh-accent-bg)' : 'var(--nh-surface-hover)', color: hasReacted ? 'var(--nh-accent)' : 'var(--nh-text-muted)', fontSize: '.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: '1rem' }}>{r.icon}</span> {count > 0 && count}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {!isHero && <button onClick={() => onToggleSave(post.id)} className="nh-btn" style={{ background: 'none', color: isSaved ? 'var(--nh-gold)' : 'var(--nh-text-muted)' }}><Bookmark size={18} fill={isSaved ? 'var(--nh-gold)' : 'none'} /></button>}
            {!isHero && <button onClick={() => onShare(post)} className="nh-btn" style={{ background: 'none', color: 'var(--nh-text-muted)' }}><Share2 size={18} /></button>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SINGLE POST VIEW 
   ═══════════════════════════════════════════════════════════════ */
function SinglePostView({ post, comments, relatedMatch, isAdmin, user, savedPosts, onToggleSave, onShare, onReaction, onEdit, onDelete, onAuthorClick, relatedPosts, onRelatedClick, newComments, setNewComments, handleComment }) {
  const isSaved = savedPosts.includes(post.id);
  const badge = BADGES[post.category] || { color: 'var(--nh-text-muted)', bg: 'var(--nh-surface-hover)', label: post.category };

  return (
    <div className="nh-enter" style={{ background: 'var(--nh-surface)', borderRadius: 16, border: '1px solid var(--nh-border)', overflow: 'hidden', boxShadow: 'var(--nh-shadow)' }}>
      {/* Header */}
      <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div onClick={onAuthorClick} style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--nh-accent-bg)', color: 'var(--nh-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, cursor: 'pointer' }}>{(post.authorName || 'A')[0]}</div>
          <div>
            <div onClick={onAuthorClick} style={{ fontWeight: 700, fontSize: '.9rem', cursor: 'pointer' }}>{post.authorName || 'Admin'}</div>
            <div style={{ fontSize: '.75rem', color: 'var(--nh-text-muted)' }}>{formatTimeAgo(post.createdAt)} • {calcReadTime(post.body)} min read • <Eye size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> {post.views || 0} views</div>
          </div>
        </div>
        <span style={{ padding: '4px 8px', borderRadius: 4, background: badge.bg, color: badge.color, fontSize: '.65rem', fontWeight: 800 }}>{badge.label}</span>
      </div>

      {/* Body */}
      <div style={{ padding: '0 16px 12px' }}>
        <h1 style={{ margin: '0 0 12px', fontSize: '1.8rem', fontWeight: 800, lineHeight: 1.3 }}>{post.title}</h1>
        <p style={{ margin: 0, color: 'var(--nh-text-muted)', lineHeight: 1.8, fontSize: '1rem', whiteSpace: 'pre-wrap' }}>{post.body}</p>
      </div>

      {/* Match Link */}
      {relatedMatch && (
        <div style={{ margin: '0 16px 16px', padding: 16, background: 'var(--nh-bg)', borderRadius: 12, border: '1px solid var(--nh-border)' }}>
          <div style={{ fontSize: '.7rem', fontWeight: 800, color: 'var(--nh-accent)', marginBottom: 8 }}>RELATED MATCH</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700 }}>{relatedMatch.homeTeam?.name || 'Home'}</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--nh-accent)' }}>{relatedMatch.homeScore ?? '-'} - {relatedMatch.awayScore ?? '-'}</span>
            <span style={{ fontWeight: 700 }}>{relatedMatch.awayTeam?.name || 'Away'}</span>
          </div>
        </div>
      )}

      {/* Image */}
      {post.imageUrl && <img src={post.imageUrl} alt={post.title} style={{ width: '100%', maxHeight: 500, objectFit: 'cover', borderBottom: '1px solid var(--nh-border)' }} loading="lazy" />}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderTop: '1px solid var(--nh-border)' }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }} className="nh-scroll">
          {REACTIONS.map(r => {
            const count = post.reactions?.[r.key] || 0;
            const hasReacted = post[`reacted_${r.key}_${user?.uid}`];
            return (
              <button key={r.key} onClick={() => onReaction(post, r.key)} className="nh-btn" style={{ padding: '8px 14px', borderRadius: 20, background: hasReacted ? 'var(--nh-accent-bg)' : 'var(--nh-surface-hover)', color: hasReacted ? 'var(--nh-accent)' : 'var(--nh-text-muted)', fontSize: '.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: '1.1rem' }}>{r.icon}</span> {count > 0 && count}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onToggleSave(post.id)} className="nh-btn" style={{ background: 'var(--nh-surface-hover)', color: isSaved ? 'var(--nh-gold)' : 'var(--nh-text-muted)', padding: 8, borderRadius: 8, border: '1px solid var(--nh-border)' }}><Bookmark size={18} fill={isSaved ? 'var(--nh-gold)' : 'none'} /></button>
          <button onClick={() => onShare(post)} className="nh-btn" style={{ background: 'var(--nh-surface-hover)', color: 'var(--nh-text-muted)', padding: 8, borderRadius: 8, border: '1px solid var(--nh-border)' }}><Share2 size={18} /></button>
        </div>
      </div>

      {/* Admin Controls */}
      {isAdmin && (
        <div style={{ padding: '0 16px 16px', display: 'flex', gap: 8 }}>
          <button onClick={() => onEdit(post)} className="nh-btn" style={{ flex: 1, background: 'var(--nh-surface-hover)', color: 'var(--nh-text)', padding: 10, borderRadius: 8, border: '1px solid var(--nh-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Pencil size={14} /> Edit</button>
          <button onClick={() => onDelete(post.id)} className="nh-btn" style={{ flex: 1, background: 'var(--nh-danger-bg)', color: 'var(--nh-danger)', padding: 10, borderRadius: 8, border: '1px solid var(--nh-danger-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Trash2 size={14} /> Delete</button>
        </div>
      )}

      <CommentSection postId={post.id} comments={comments} newComments={newComments} setNewComments={setNewComments} handleComment={handleComment} />

      {/* Related Articles */}
      {relatedPosts.length > 0 && (
        <div style={{ padding: 16, borderTop: '1px solid var(--nh-border)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 12px' }}>You might also like</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {relatedPosts.map(p => (
              <div key={p.id} onClick={() => onRelatedClick(p.id)} style={{ display: 'flex', gap: 12, cursor: 'pointer' }}>
                {p.imageUrl && <img src={p.imageUrl} style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover' }} alt="" />}
                <div>
                  <div style={{ fontSize: '.65rem', fontWeight: 800, color: BADGES[p.category]?.color || 'var(--nh-text-muted)', marginBottom: 4 }}>{BADGES[p.category]?.label || p.category}</div>
                  <div style={{ fontSize: '.85rem', fontWeight: 700, lineHeight: 1.3 }}>{p.title}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   COMMENT SECTION COMPONENT
   ═══════════════════════════════════════════════════════════════ */
function CommentSection({ postId, comments, newComments, setNewComments, handleComment }) {
  return (
    <div style={{ padding: 16, background: 'var(--nh-bg)', borderTop: '1px solid var(--nh-border)' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input 
          value={newComments[postId] || ''}
          onChange={e => setNewComments(prev => ({ ...prev, [postId]: e.target.value }))}
          placeholder="Write a comment..."
          style={{ flex: 1, background: 'var(--nh-surface)', border: '1px solid var(--nh-border)', borderRadius: 20, padding: '10px 16px', color: 'var(--nh-text)', fontSize: '.85rem', outline: 'none' }}
        />
        <button onClick={() => handleComment(postId)} className="nh-btn" style={{ background: 'var(--nh-accent)', color: '#fff', borderRadius: 20, padding: '0 16px', display: 'flex', alignItems: 'center' }}>
          <Send size={16} />
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(comments || []).length === 0 && <p style={{ fontSize: '.8rem', color: 'var(--nh-text-muted)', textAlign: 'center' }}>No comments yet.</p>}
        {(comments || []).map(c => (
          <div key={c.id} className="nh-enter" style={{ display: 'flex', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--nh-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem', fontWeight: 700, color: 'var(--nh-text-muted)', flexShrink: 0 }}>{c.authorName?.[0] || 'G'}</div>
            <div style={{ background: 'var(--nh-surface)', borderRadius: 12, padding: '10px 14px', flex: 1, border: '1px solid var(--nh-border)' }}>
              <div style={{ fontSize: '.75rem', fontWeight: 700, marginBottom: 4 }}>{c.authorName || 'Guest'}</div>
              <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--nh-text)' }}>{c.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}