import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  deleteDoc, doc, serverTimestamp, increment, getDoc, getDocs 
} from 'firebase/firestore';

import { usePreferencesStore } from '../store/usePreferencesStore';
import { PATHS } from '../utils/constants';
import { safeWrite } from '../services/safeWrite';
import SEO from "../components/SEO";
import AdSlot from '../components/AdSlot'; 

const slugify = (text) => String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').substring(0, 60);
const getSeoImageUrl = (post) => (!post || !post.imageUrl) ? "https://zokascore.xyz/logo.png" : `https://zokascore.xyz/api/og-image/${post.id}`;

const BULLET = '\u2022'; 

const formatTimestamp = (date) => {
  if (!date) return 'Just now';
  const now = new Date();
  const d = new Date(date.toMillis ? date.toMillis() : date);
  const diff = (now - d) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  const isToday = now.toDateString() === d.toDateString();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const isYesterday = yesterday.toDateString() === d.toDateString();
  const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today ${BULLET} ${timeStr}`;
  if (isYesterday) return `Yesterday ${BULLET} ${timeStr}`;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

const calcReadTime = (body) => Math.max(1, Math.ceil((body?.trim().split(/\s+/).length || 1) / 200));

const RED_CIRCLE     = '\uD83D\uDD34'; 
const GREEN_CIRCLE   = '\uD83D\uDFE2'; 
const YELLOW_CIRCLE  = '\uD83D\uDFE1'; 
const BLUE_CIRCLE    = '\uD83D\uDD35'; 
const ORANGE_CIRCLE  = '\uD83D\uDFE0'; 
const PURPLE_CIRCLE  = '\uD83D\uDFE3'; 
const THUMBS_UP      = '\uD83D\uDC4D'; 
const FIRE           = '\uD83D\uDD25'; 
const WOW_FACE       = '\uD83D\uDE2E'; 
const LAUGH_FACE     = '\uD83D\uDE02'; 
const SAD_FACE       = '\uD83D\uDE22'; 

const BADGES = {
  'Breaking':     { color: 'var(--danger)',  bg: 'rgba(var(--danger-rgb),.15)',  label: `${RED_CIRCLE} BREAKING` },
  'Official':     { color: 'var(--primary)', bg: 'rgba(var(--primary-rgb),.15)', label: `${GREEN_CIRCLE} OFFICIAL` },
  'Rumour':       { color: 'var(--gold)',    bg: 'rgba(var(--gold-rgb),.15)',    label: `${YELLOW_CIRCLE} RUMOUR` },
  'Match Report': { color: 'var(--accent)',  bg: 'rgba(var(--accent-rgb),.15)',  label: `${BLUE_CIRCLE} MATCH REPORT` },
  'Transfers':    { color: 'var(--warning)', bg: 'rgba(var(--warning-rgb),.15)', label: `${ORANGE_CIRCLE} TRANSFERS` },
  'Injuries':     { color: 'var(--accent)',  bg: 'rgba(var(--accent-rgb),.15)',  label: `${PURPLE_CIRCLE} INJURIES` },
};

const CATEGORIES = [
  { key: 'All', label: 'All News' }, { key: 'Breaking', label: 'Breaking' }, 
  { key: 'Official', label: 'Official' }, { key: 'Transfers', label: 'Transfers' }, 
  { key: 'Match Report', label: 'Match Reports' }, { key: 'Injuries', label: 'Injuries' },
];

const REACTIONS = [
  { key: 'like',   icon: THUMBS_UP,  label: 'Like' },
  { key: 'fire',   icon: FIRE,       label: 'Fire' },
  { key: 'wow',    icon: WOW_FACE,   label: 'Wow' },
  { key: 'funny',  icon: LAUGH_FACE, label: 'Funny' },
  { key: 'sad',    icon: SAD_FACE,   label: 'Sad' },
];

const useReadingProgress = () => {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const updateScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollHeight > 0) setProgress((window.scrollY / scrollHeight) * 100);
    };
    window.addEventListener('scroll', updateScroll);
    return () => window.removeEventListener('scroll', updateScroll);
  }, []);
  return progress;
};

export default function Highlights() {
  const { currentUser, userProfile } = useAuth();
  const user = currentUser;
  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';
  
  const { slugId, author: authorFilter } = useParams();
  const urlPostId = slugId && slugId !== 'author' ? slugId.split('-').pop() : null;
  const navigate = useNavigate();
  const { theme, toggleTheme } = usePreferencesStore();
  
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');
  const [activePost, setActivePost] = useState(null);
  const [relatedMatch, setRelatedMatch] = useState(null);
  const [savedPosts, setSavedPosts] = useState(() => JSON.parse(localStorage.getItem('nh_saved') || '[]'));
  const [shareData, setShareData] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);
  
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
  const scrollProgress = useReadingProgress();

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 500);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => { setVisibleCount(15); }, [activeFilter, authorFilter]);

  useEffect(() => {
    if (!db) return;
    setLoading(true);
    const q = query(collection(db, 'news_posts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [db]);

  useEffect(() => {
    if (!db || !urlPostId) { setActivePost(null); setRelatedMatch(null); return; }
    setLoading(true);
    getDoc(doc(db, 'news_posts', urlPostId)).then(snap => {
      if (snap.exists()) {
        const postData = { id: snap.id, ...snap.data() };
        setActivePost(postData);
        window.scrollTo({ top: 0, behavior: 'instant' });
        updateDoc(doc(db, 'news_posts', urlPostId), { views: increment(1) }).catch(()=>{});
        if (postData.relatedMatchId) {
          getDoc(doc(db, PATHS.ACTIVE_PREDICTIONS, postData.relatedMatchId)).then(mSnap => {
            if (mSnap.exists()) setRelatedMatch({ id: mSnap.id, ...mSnap.data() });
          });
        }
      } else { navigate('/highlights'); }
      setLoading(false);
    });
  }, [db, urlPostId, navigate]);

  useEffect(() => {
    if (!activePost) return;
    const targetId = activePost.id;
    if (comments[targetId]) return;
    const q = query(collection(db, 'news_posts', targetId, 'comments'), orderBy('createdAt', 'desc'));
    onSnapshot(q, (snap) => setComments(prev => ({ ...prev, [targetId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) })));
  }, [activePost]);

  const fetchCommentsForFeed = (postId) => {
    if (comments[postId]) return; 
    const q = query(collection(db, 'news_posts', postId, 'comments'), orderBy('createdAt', 'desc'));
    onSnapshot(q, (snap) => setComments(prev => ({ ...prev, [postId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) })));
  };

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

  const openCreate = () => { setEditingPost(null); setFormData({ title: '', category: 'Breaking', body: '', imageUrl: '', relatedMatchId: '' }); setIsFormOpen(true); };
  const openEdit = (post) => { setEditingPost(post); setFormData({ title: post.title, category: post.category, body: post.body, imageUrl: post.imageUrl || '', relatedMatchId: post.relatedMatchId || '' }); setIsFormOpen(true); };

  const handleImageUpload = (e) => {
    const file = e.target.files[0]; if (!file) return; setUploadingImage(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas'); let { width, height } = img; const MAX_WIDTH = 1200;
        if (width > MAX_WIDTH) { height = Math.round((height * MAX_WIDTH) / width); width = MAX_WIDTH; }
        canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
        setFormData(d => ({ ...d, imageUrl: canvas.toDataURL('image/jpeg', 0.7) })); setUploadingImage(false);
      }; img.src = event.target.result;
    }; reader.readAsDataURL(file);
  };

  const handleSave = async (e) => {
    e.preventDefault(); if (!formData.title || !formData.body || !user) return; setSaving(true);
    try {
      const payload = { ...formData, relatedMatchId: formData.relatedMatchId || null };
      if (editingPost) await updateDoc(doc(db, 'news_posts', editingPost.id), { ...payload, updatedAt: serverTimestamp() });
      else await addDoc(collection(db, 'news_posts'), { ...payload, authorId: user.uid, authorName: userProfile?.displayName || 'Admin', authorRole: userProfile?.role || 'admin', createdAt: serverTimestamp(), views: 0, commentsCount: 0, likedBy: [], reactions: { like: 0, fire: 0, wow: 0, funny: 0, sad: 0 } });
      setIsFormOpen(false);
    } catch (err) { console.error("Save post error:", err); alert("Failed to save post."); } finally { setSaving(false); }
  };

  const handleDelete = async (postId) => { if (!window.confirm("Delete this post permanently?")) return; try { await deleteDoc(doc(db, 'news_posts', postId)); navigate('/highlights'); } catch (err) { console.error("Delete error:", err); } };

  const handleReaction = async (post, type) => {
    if (!user) return alert("Please log in to react.");
    const currentReactions = post.reactions || {};
    const userReactedKey = `reacted_${type}_${user.uid}`;
    const hasReacted = post[userReactedKey];
    const updateState = (p) => p.id === post.id ? { ...p, [userReactedKey]: !hasReacted, reactions: { ...currentReactions, [type]: (currentReactions[type] || 0) + (hasReacted ? -1 : 1) } } : p;
    if (activePost) setActivePost(updateState); else setPosts(prev => prev.map(updateState));
    try { 
      await safeWrite('news_posts', post.id, { [`reactions.${type}`]: increment(hasReacted ? -1 : 1), [userReactedKey]: !hasReacted }, { merge: true }); 
    } catch (err) { console.error("Reaction error:", err); }
  };

  const handleComment = async (postId) => {
    const text = newComments[postId]?.trim(); if (!text || !user) return;
    const tempComment = { id: `temp_${Date.now()}`, body: text, authorId: user.uid, authorName: userProfile?.displayName || 'User', createdAt: { toMillis: () => Date.now() } };
    setComments(prev => ({ ...prev, [postId]: [tempComment, ...(prev[postId] || [])] })); setNewComments(prev => ({ ...prev, [postId]: '' }));
    try { 
      await addDoc(collection(db, 'news_posts', postId, 'comments'), { body: text, authorId: user.uid, authorName: userProfile?.displayName || 'User', createdAt: serverTimestamp() }); 
      await safeWrite('news_posts', postId, { commentsCount: increment(1) }, { merge: true }); 
    } 
    catch (err) { console.error("Comment error:", err); setComments(prev => ({ ...prev, [postId]: prev[postId].filter(c => c.id !== tempComment.id) })); }
  };

  const handleShare = (post) => {
    const url = `https://zokascore.xyz/highlights/${slugify(post.title)}-${post.id}`;
    if (navigator.share) navigator.share({ title: post.title, text: post.body.substring(0, 100), url }).catch(()=>{});
    else setShareData({ ...post, url });
  };

  const generateJsonLd = (post) => {
    if (!post) return null;
    return { "@context": "https://schema.org", "@type": "NewsArticle", "headline": post.title, "image": [getSeoImageUrl(post)], "datePublished": post.createdAt?.toMillis ? new Date(post.createdAt.toMillis()).toISOString() : new Date().toISOString(), "author": [{ "@type": "Person", "name": post.authorName || "Admin" }], "publisher": { "@type": "Organization", "name": "ZOKASCORE" }, "description": post.body.substring(0, 150), "articleSection": post.category };
  };

  const seoPost = activePost || posts[0]; 

  // ★ SEO GOLD: CollectionPage Schema for the News Feed
  const feedSchema = useMemo(() => {
    if (activePost) return null; 
    return {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": "Football News, Transfers & Match Updates",
      "description": "The latest football news, transfer rumors, and match reports from ZOKASCORE.",
      "url": `${window.location.origin}/highlights`,
      "mainEntity": {
        "@type": "ItemList",
        "itemListElement": filteredPosts.slice(0, 20).map((post, index) => ({
          "@type": "ListItem",
          "position": index + 1,
          "url": `${window.location.origin}/highlights/${slugify(post.title)}-${post.id}`
        }))
      }
    };
  }, [activePost, filteredPosts]);

  return (
    <div className="zoka-page">
      {activePost && <div style={{ position: 'fixed', top: 0, left: 0, height: '4px', zIndex: 9999, width: `${scrollProgress}%`, background: 'var(--primary)', transition: 'width 0.1s' }} />}
      
      <SEO
        title={seoPost ? seoPost.title : "Football News, Transfers & Match Updates | ZOKASCORE"}
        description={seoPost ? seoPost.body.substring(0, 150) : "Follow the latest football news, transfer updates, match reports, injuries, and breaking stories from leagues around the world."}
        image={getSeoImageUrl(seoPost)} 
        type={activePost ? "article" : "website"}
        keywords={seoPost ? `${seoPost.title}, football news, transfer news` : "football news, transfer news, match reports, ZOKASCORE"}
        robots="index,follow" 
        structuredData={activePost ? generateJsonLd(seoPost) : feedSchema}
      />

      <div className="glass" style={{ position: 'sticky', top: 0, zIndex: 100, borderBottom: '1px solid var(--border)' }}>
        <div className="zoka-wrap flex-between" style={{ padding: '12px 0' }}>
          <div className="flex-center gap-8" style={{ cursor: 'pointer' }} onClick={() => { navigate('/highlights'); setActiveFilter('All'); }}>
            {activePost && <ArrowLeft size={18} className="text-primary" />}
            <div className="glass-card flex-center text-primary" style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(var(--primary-rgb),.1)' }}><Newspaper size={18} /></div>
            <span className="text-primary font-extrabold">News Hub</span>
          </div>
          <div className="flex gap-8">
            <button onClick={toggleTheme} className="btn-icon">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
            {isAdmin && <button onClick={openCreate} className="btn btn-primary btn-sm"><Plus size={16} /> New Post</button>}
          </div>
        </div>
      </div>

      <div className="zoka-wrap">
        {loading ? (
          <div className="flex-col gap-16">
            {[1, 2, 3].map(i => <div key={i} className="glass-card skeleton" style={{ height: 300 }} />)}
          </div>
        ) : activePost ? (
          <SinglePostView 
            post={activePost} comments={comments[activePost.id] || []} relatedMatch={relatedMatch}
            isAdmin={isAdmin} user={user} savedPosts={savedPosts} onToggleSave={toggleSave}
            onShare={handleShare} onReaction={handleReaction} onEdit={openEdit} onDelete={handleDelete}
            onAuthorClick={() => navigate(`/highlights/author/${activePost.authorId}`)}
            relatedPosts={posts.filter(p => p.category === activePost.category && p.id !== activePost.id).slice(0, 3)}
            onRelatedClick={(p) => navigate(`/highlights/${slugify(p.title)}-${p.id}`)}
            onImageClick={(url) => setLightboxImage(url)}
            newComments={newComments} setNewComments={setNewComments} handleComment={handleComment}
          />
        ) : (
          <>
            <div className="flex gap-8 overflow-x-auto" style={{ padding: '12px 0', marginBottom: '16px' }}>
              {CATEGORIES.map(cat => (
                <button key={cat.key} onClick={() => setActiveFilter(cat.key)} className={`btn btn-sm ${activeFilter === cat.key ? 'btn-primary' : 'btn-secondary'}`}>{cat.label}</button>
              ))}
              {savedPosts.length > 0 && <button onClick={() => setActiveFilter('Saved')} className={`btn btn-sm ${activeFilter === 'Saved' ? 'btn-primary' : 'btn-secondary'}`}>Saved ({savedPosts.length})</button>}
            </div>

            {authorFilter && (
              <div className="glass-card flex-between p-12 mb-16">
                <span className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>Showing posts by specific author</span>
                <button onClick={() => navigate('/highlights')} className="btn btn-ghost btn-sm">Clear</button>
              </div>
            )}

            {trendingPosts.length > 1 && activeFilter === 'All' && !authorFilter && (
              <div style={{ marginBottom: '24px' }}>
                <div className="flex-center gap-8 text-primary font-bold mb-12"><Flame size={16} className="text-danger" /> <span>Trending Now</span></div>
                <div className="flex gap-12 overflow-x-auto pb-8">
                  {trendingPosts.map(p => (
                    <div key={p.id} onClick={() => navigate(`/highlights/${slugify(p.title)}-${p.id}`)} className="glass-card" style={{ minWidth: '200px', maxWidth: '220px', height: '150px', overflow: 'hidden', position: 'relative', cursor: 'pointer' }}>
                      {p.imageUrl ? <img src={p.imageUrl} alt="" style={{ width: '100%', height: '80px', objectFit: 'cover' }} /> : <div className="flex-center" style={{ width: '100%', height: '80px', background: 'var(--bg-elevated)', color: 'var(--primary)' }}><Newspaper size={24} /></div>}
                      <div className="badge badge-danger" style={{ position: 'absolute', top: '8px', right: '8px' }}><Flame size={8} /> HOT</div>
                      <div className="p-8 flex-col gap-4">
                        <div className="text-danger font-bold" style={{ fontSize: 'var(--fs-xs)' }}>{BADGES[p.category]?.label || p.category}</div>
                        <div className="text-primary font-bold line-clamp-2" style={{ fontSize: 'var(--fs-sm)' }}>{p.title}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {filteredPosts.length === 0 ? (
              <div className="glass-card flex-col p-32" style={{ alignItems: 'center', gap: '12px', textAlign: 'center' }}>
                <Newspaper size={40} className="text-muted" />
                <p className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>No news articles found.</p>
              </div>
            ) : (
              <>
                <div className="flex-col gap-16">
                  {filteredPosts.slice(0, visibleCount).map((post, i) => (
                    <div key={post.id} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <PostCard 
                        post={post} index={i} isAdmin={isAdmin} user={user} savedPosts={savedPosts}
                        onToggleSave={toggleSave} onShare={handleShare} onReaction={handleReaction} 
                        onEdit={openEdit} onDelete={handleDelete}
                        onExpand={(p) => navigate(`/highlights/${slugify(p.title)}-${p.id}`)}
                        onAuthorClick={() => navigate(`/highlights/author/${post.authorId}`)}
                        isHero={i === 0 && activeFilter === 'All' && !authorFilter}
                        comments={comments[post.id] || []} newComments={newComments} setNewComments={setNewComments}
                        handleComment={handleComment} fetchComments={fetchCommentsForFeed}
                      />
                      {(i + 1) % 4 === 0 && <AdSlot id={`news-ad-${i}`} mobile={true} desktop={true} />}
                    </div>
                  ))}
                </div>
                {filteredPosts.length > visibleCount && <button onClick={() => setVisibleCount(c => c + 15)} className="btn btn-secondary w-full mt-16"><ChevronDown size={16} /> Load More Articles</button>}
              </>
            )}
          </>
        )}
      </div>

      {showScrollTop && <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="btn-icon" style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 500 }}><ArrowUp size={24} /></button>}

      {lightboxImage && (
        <div onClick={() => setLightboxImage(null)} className="flex-center" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, padding: '20px', cursor: 'pointer' }}>
          <img src={lightboxImage} alt="Expanded view" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 'var(--r-8)' }} />
          <button onClick={() => setLightboxImage(null)} className="btn-icon" style={{ position: 'absolute', top: '20px', right: '20px' }}><X size={24} /></button>
        </div>
      )}

      {isFormOpen && (
        <div onClick={() => setIsFormOpen(false)} className="flex-center" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} className="glass-card" style={{ maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex-between p-16" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-primary font-bold">{editingPost ? 'Edit Post' : 'Create New Post'}</h2>
              <button onClick={() => setIsFormOpen(false)} className="btn-icon"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="flex-col gap-16 p-16">
              <div className="flex-col gap-8">
                <label className="text-muted font-bold" style={{ fontSize: 'var(--fs-xs)' }}>Title</label>
                <input value={formData.title} onChange={e => setFormData(d => ({ ...d, title: e.target.value }))} required placeholder="e.g. Mbappe ruled out for 3 weeks" className="form-input" />
              </div>
              <div className="flex gap-12">
                <div className="flex-col gap-8 flex-1">
                  <label className="text-muted font-bold" style={{ fontSize: 'var(--fs-xs)' }}>Category</label>
                  <select value={formData.category} onChange={e => setFormData(d => ({ ...d, category: e.target.value }))} className="form-input">
                    {Object.keys(BADGES).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex-col gap-8 flex-1">
                  <label className="text-muted font-bold" style={{ fontSize: 'var(--fs-xs)' }}>Match ID (Optional)</label>
                  <input value={formData.relatedMatchId} onChange={e => setFormData(d => ({ ...d, relatedMatchId: e.target.value }))} placeholder="e.g. feat_2023-10-01_123" className="form-input" />
                </div>
              </div>
              <div className="flex-col gap-8">
                <label className="text-muted font-bold" style={{ fontSize: 'var(--fs-xs)' }}>Attachment (Optional)</label>
                {formData.imageUrl ? (
                  <div className="glass-card p-8" style={{ position: 'relative' }}>
                    <img src={formData.imageUrl} alt="Preview" style={{ width: '100%', borderRadius: 'var(--r-8)' }} />
                    <button type="button" onClick={() => setFormData(d => ({ ...d, imageUrl: '' }))} className="btn-icon" style={{ position: 'absolute', top: '12px', right: '12px' }}><X size={16} /></button>
                  </div>
                ) : (
                  <div className="glass-card flex-col p-20" style={{ alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => fileInputRef.current?.click()}>
                    {uploadingImage ? <Loader size={24} className="anim-spin text-primary" /> : <ImageIcon size={24} className="text-muted" />}
                    <span className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>Click to upload from device</span>
                    <span className="text-muted" style={{ fontSize: 'var(--fs-xs)' }}>Auto-compresses for fast loading</span>
                    <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} style={{ display: 'none' }} />
                  </div>
                )}
              </div>
              <div className="flex-col gap-8">
                <label className="text-muted font-bold" style={{ fontSize: 'var(--fs-xs)' }}>Body / Content</label>
                <textarea value={formData.body} onChange={e => setFormData(d => ({ ...d, body: e.target.value }))} required rows={6} placeholder="Write the news details here..." className="form-input" style={{ minHeight: '120px', resize: 'vertical' }} />
              </div>
              <button type="submit" disabled={saving} className="btn btn-primary w-full">{saving ? <Loader size={18} className="anim-spin" /> : <Plus size={18} />} {saving ? 'Saving...' : (editingPost ? 'Update Post' : 'Publish Post')}</button>
            </form>
          </div>
        </div>
      )}

      {shareData && (
        <div onClick={() => setShareData(null)} className="flex-center" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} className="glass-card" style={{ maxWidth: '400px', width: '100%', padding: '24px', textAlign: 'center' }}>
            <h3 className="text-primary font-bold mb-16">Share Article</h3>
            <div className="grid gap-12 mb-16" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <a href={`https://wa.me/?text=${encodeURIComponent(shareData.title + " " + shareData.url)}`} target="_blank" rel="noreferrer" className="btn btn-secondary">WhatsApp</a>
              <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareData.title)}&url=${encodeURIComponent(shareData.url)}`} target="_blank" rel="noreferrer" className="btn btn-secondary">Twitter</a>
              <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareData.url)}`} target="_blank" rel="noreferrer" className="btn btn-secondary">Facebook</a>
              <a href={`https://t.me/share/url?url=${encodeURIComponent(shareData.url)}&text=${encodeURIComponent(shareData.title)}`} target="_blank" rel="noreferrer" className="btn btn-secondary">Telegram</a>
            </div>
            <button onClick={() => { navigator.clipboard.writeText(shareData.url); alert('Link copied!'); }} className="btn btn-primary w-full"><LinkIcon size={16} /> Copy Link</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PostCard({ post, index, isAdmin, user, savedPosts, onToggleSave, onShare, onReaction, onEdit, onDelete, onExpand, onAuthorClick, isHero, comments, newComments, setNewComments, handleComment, fetchComments }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showComments, setShowComments] = useState(false); 
  const isSaved = savedPosts.includes(post.id);
  const badge = BADGES[post.category] || { color: 'var(--text-muted)', bg: 'var(--bg-elevated)', label: post.category };

  const toggleComments = () => { if (!showComments) fetchComments(post.id); setShowComments(p => !p); };

  return (
    // ★ SEO GOLD: Semantic <article> tag for Googlebot
    <article className="glass-card flex-col anim-fade-up" style={{ animationDelay: `${index * 50}ms` }}>
      {post.imageUrl && (
        <div onClick={() => onExpand(post)} style={{ cursor: 'pointer', position: 'relative', overflow: 'hidden', borderTopLeftRadius: 'var(--r-16)', borderTopRightRadius: 'var(--r-16)' }}>
          <img src={post.imageUrl} alt={post.title} loading="lazy" style={{ width: '100%', height: '12rem', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }} />
          {isHero ? (
            <div className="flex-col gap-8" style={{ position: 'absolute', bottom: 0, left: 0, padding: '16px' }}>
              <span className="badge" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
              <h2 className="text-primary font-extrabold" style={{ fontSize: 'var(--fs-lg)' }}>{post.title}</h2>
            </div>
          ) : (
            <div style={{ position: 'absolute', top: '12px', left: '12px' }}>
              <span className="badge" style={{ background: 'rgba(0,0,0,0.6)', color: badge.color }}>{badge.label}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex-col gap-12 p-16">
        <div onClick={() => onExpand(post)} style={{ cursor: 'pointer' }} className="flex-col gap-8">
          {(!isHero || !post.imageUrl) && (
            <div className="flex-center gap-8">
              <div onClick={(e) => { e.stopPropagation(); onAuthorClick(); }} className="flex-center font-bold" style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', color: 'var(--text-inverse)' }}>{(post.authorName || 'A')[0]}</div>
              <div className="flex-col gap-2">
                <div onClick={(e) => { e.stopPropagation(); onAuthorClick(); }} className="text-primary font-bold" style={{ fontSize: 'var(--fs-sm)' }}>{post.authorName || 'Admin'}</div>
                <div className="text-muted" style={{ fontSize: 'var(--fs-xs)' }}>{formatTimestamp(post.createdAt)} {BULLET} {calcReadTime(post.body)} min read</div>
              </div>
              {!post.imageUrl && <span className="badge" style={{ background: badge.bg, color: badge.color, marginLeft: 'auto' }}>{badge.label}</span>}
            </div>
          )}

          {isHero && post.imageUrl && (
            <div className="flex-center gap-8 text-muted" style={{ fontSize: 'var(--fs-xs)' }}>
              <span onClick={(e) => { e.stopPropagation(); onAuthorClick(); }} className="text-primary font-bold">By {post.authorName || 'Admin'}</span>
              <span>{formatTimestamp(post.createdAt)} {BULLET} {calcReadTime(post.body)} min read</span>
            </div>
          )}

          {!isHero && <h3 className="text-primary font-bold" style={{ fontSize: 'var(--fs-md)' }}>{post.title}</h3>}
          
          <p className={`text-secondary ${isExpanded ? '' : 'line-clamp-3'}`} style={{ fontSize: 'var(--fs-sm)' }}>{post.body}</p>
          {!isExpanded && post.body.length > 100 && <span className="text-primary font-bold" style={{ fontSize: 'var(--fs-xs)', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }}>Read more</span>}
          {isExpanded && <span className="text-primary font-bold" style={{ fontSize: 'var(--fs-xs)', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}>Show less</span>}
        </div>

        <div className="flex-center gap-12 text-muted" style={{ fontSize: 'var(--fs-xs)' }}>
          <span className="flex-center gap-4"><Eye size={12} /> {post.views || 0}</span>
          <span className="flex-center gap-4"><MessageCircle size={12} /> {post.commentsCount || 0}</span>
          {(post.views > 1000) && <span className="badge badge-danger"><Flame size={12} /> Trending</span>}
        </div>

        <div className="flex-between" style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
          <div className="flex gap-4 overflow-x-auto">
            {REACTIONS.map(r => {
              const count = post.reactions?.[r.key] || 0;
              const hasReacted = post[`reacted_${r.key}_${user?.uid}`];
              return <button key={r.key} onClick={() => onReaction(post, r.key)} className={`btn btn-sm ${hasReacted ? 'btn-primary' : 'btn-ghost'}`}><span>{r.icon}</span> {count > 0 && count}</button>;
            })}
          </div>
          <div className="flex gap-4">
            <button onClick={toggleComments} className={`btn-icon-sm ${showComments ? 'text-primary' : ''}`}><MessageCircle size={18} /></button>
            {!isHero && <button onClick={() => onToggleSave(post.id)} className={`btn-icon-sm ${isSaved ? 'text-gold' : ''}`}><Bookmark size={18} fill={isSaved ? 'currentColor' : 'none'} /></button>}
            {!isHero && <button onClick={() => onShare(post)} className="btn-icon-sm"><Share2 size={18} /></button>}
          </div>
        </div>
      </div>

      {showComments && <CommentSection postId={post.id} comments={comments} newComments={newComments} setNewComments={setNewComments} handleComment={handleComment} />}
    </article>
  );
}

function SinglePostView({ post, comments, relatedMatch, isAdmin, user, savedPosts, onToggleSave, onShare, onReaction, onEdit, onDelete, onAuthorClick, relatedPosts, onRelatedClick, onImageClick, newComments, setNewComments, handleComment }) {
  const isSaved = savedPosts.includes(post.id);
  const badge = BADGES[post.category] || { color: 'var(--text-muted)', bg: 'var(--bg-elevated)', label: post.category };
  const paragraphs = post.body.split('\n').filter(p => p.trim() !== '');

  return (
    <article className="glass-card flex-col gap-16 p-24">
      <div className="flex-center gap-12">
        <div onClick={onAuthorClick} className="flex-center font-bold" style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent)', color: 'var(--text-inverse)' }}>{(post.authorName || 'A')[0]}</div>
        <div className="flex-col gap-2 flex-1">
          <div onClick={onAuthorClick} className="text-primary font-bold">{post.authorName || 'Admin'}</div>
          <div className="text-muted" style={{ fontSize: 'var(--fs-xs)' }}>
            {formatTimestamp(post.createdAt)} {BULLET} {calcReadTime(post.body)} min read {BULLET} <Eye size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> {post.views || 0} views
          </div>
        </div>
        <span className="badge" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
      </div>

      <h1 className="text-primary font-extrabold mt-12" style={{ fontSize: 'var(--fs-xl)' }}>{post.title}</h1>
      
      {post.imageUrl && <img src={post.imageUrl} alt={post.title} onClick={() => onImageClick(post.imageUrl)} style={{ width: '100%', borderRadius: 'var(--r-12)', cursor: 'pointer', margin: '12px 0' }} loading="lazy" />}

      <div className="flex-col gap-12 text-secondary" style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.7 }}>
        {paragraphs.map((para, i) => (
          <p key={i} style={i === 0 ? { fontSize: 'var(--fs-lg)', fontWeight: 800, color: 'var(--primary)' } : {}}>{para}</p>
        ))}
      </div>

      {relatedMatch && (
        <div className="glass-card p-12 mt-12 flex-col gap-8">
          <div className="text-muted font-bold" style={{ fontSize: 'var(--fs-xs)' }}>RELATED MATCH</div>
          <div className="flex-center gap-12 text-primary font-bold">
            <span>{relatedMatch.homeTeam?.name || 'Home'}</span>
            <span className="text-muted">{relatedMatch.homeScore ?? '-'} - {relatedMatch.awayScore ?? '-'}</span>
            <span>{relatedMatch.awayTeam?.name || 'Away'}</span>
          </div>
        </div>
      )}

      <div className="flex-between glass-card p-12 mt-16" style={{ position: 'sticky', bottom: 0, zIndex: 100 }}>
        <div className="flex gap-4 overflow-x-auto">
          {REACTIONS.map(r => {
            const count = post.reactions?.[r.key] || 0;
            const hasReacted = post[`reacted_${r.key}_${user?.uid}`];
            return <button key={r.key} onClick={() => onReaction(post, r.key)} className={`btn btn-sm ${hasReacted ? 'btn-primary' : 'btn-ghost'}`}><span>{r.icon}</span> {count > 0 && count}</button>;
          })}
        </div>
        <div className="flex gap-4">
          <button onClick={() => onToggleSave(post.id)} className={`btn-icon ${isSaved ? 'text-gold' : ''}`}><Bookmark size={18} fill={isSaved ? 'currentColor' : 'none'} /></button>
          <button onClick={() => onShare(post)} className="btn-icon"><Share2 size={18} /></button>
        </div>
      </div>

      {isAdmin && (
        <div className="flex gap-8 mt-12">
          <button onClick={() => onEdit(post)} className="btn btn-secondary btn-sm flex-1"><Pencil size={14} /> Edit</button>
          <button onClick={() => onDelete(post.id)} className="btn btn-danger btn-sm flex-1"><Trash2 size={14} /> Delete</button>
        </div>
      )}

      <CommentSection postId={post.id} comments={comments} newComments={newComments} setNewComments={setNewComments} handleComment={handleComment} />

      {relatedPosts.length > 0 && (
        <div className="mt-24">
          <h3 className="text-primary font-bold mb-12">You might also like</h3>
          <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {relatedPosts.map(p => (
              <div key={p.id} onClick={() => onRelatedClick(p)} className="glass-card" style={{ cursor: 'pointer', overflow: 'hidden' }}>
                {p.imageUrl && <img src={p.imageUrl} alt="" style={{ width: '100%', height: '6rem', objectFit: 'cover' }} />}
                <div className="p-8 flex-col gap-4">
                  <div className="text-danger font-bold" style={{ fontSize: 'var(--fs-xs)' }}>{BADGES[p.category]?.label || p.category}</div>
                  <div className="text-primary font-bold line-clamp-2" style={{ fontSize: 'var(--fs-sm)' }}>{p.title}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function CommentSection({ postId, comments, newComments, setNewComments, handleComment }) {
  return (
    <div className="mt-16 flex-col gap-12">
      <div className="flex gap-8">
        <input 
          value={newComments[postId] || ''}
          onChange={e => setNewComments(prev => ({ ...prev, [postId]: e.target.value }))}
          placeholder="Write a comment..."
          className="form-input flex-1"
        />
        <button onClick={() => handleComment(postId)} className="btn btn-primary"><Send size={16} /></button>
      </div>
      <div className="flex-col gap-8">
        {(comments || []).length === 0 && <p className="text-muted" style={{ fontSize: 'var(--fs-sm)', textAlign: 'center', paddingTop: '12px', paddingBottom: '12px' }}>No comments yet.</p>}
        {(comments || []).map(c => (
          <div key={c.id} className="flex gap-8">
            <div className="flex-center font-bold" style={{ width: 28, height: 28, borderRadius: '50%', fontSize: 10, background: 'var(--accent)', color: 'var(--text-inverse)' }}>{c.authorName?.[0] || 'G'}</div>
            <div className="glass-card p-12 flex-col gap-4 flex-1">
              <div className="text-primary font-bold" style={{ fontSize: 'var(--fs-xs)' }}>{c.authorName || 'Guest'}</div>
              <p className="text-secondary" style={{ fontSize: 'var(--fs-sm)' }}>{c.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}