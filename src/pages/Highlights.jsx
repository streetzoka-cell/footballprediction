// ═══════════════════════════════════════════════════════════════
// FILE: src/pages/Highlights.jsx
// ═══════════════════════════════════════════════════════════════

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
import SEO from "../components/SEO";

const slugify = (text) => String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').substring(0, 60);
const getSeoImageUrl = (post) => (!post || !post.imageUrl) ? "https://zokascore.xyz/logo.png" : `https://zokascore.xyz/api/og-image/${post.id}`;

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
  if (isToday) return `Today • ${timeStr}`;
  if (isYesterday) return `Yesterday • ${timeStr}`;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

const calcReadTime = (body) => Math.max(1, Math.ceil((body?.trim().split(/\s+/).length || 1) / 200));

const BADGES = {
  'Breaking': { color: '#ef4444', bg: 'rgba(239,68,68,.15)', label: '🔴 BREAKING' },
  'Official': { color: 'var(--accent)', bg: 'rgba(16,185,129,.15)', label: '🟢 OFFICIAL' },
  'Rumour': { color: '#fbbf24', bg: 'rgba(251,191,36,.15)', label: '🟡 RUMOUR' },
  'Match Report': { color: '#3b82f6', bg: 'rgba(59,130,246,.15)', label: '🔵 MATCH REPORT' },
  'Transfers': { color: '#f97316', bg: 'rgba(249,115,22,.15)', label: '🟠 TRANSFERS' },
  'Injuries': { color: '#a855f7', bg: 'rgba(168,85,247,.15)', label: '🟣 INJURIES' },
};

const CATEGORIES = [
  { key: 'All', label: 'All News' }, { key: 'Breaking', label: 'Breaking' }, 
  { key: 'Official', label: 'Official' }, { key: 'Transfers', label: 'Transfers' }, 
  { key: 'Match Report', label: 'Match Reports' }, { key: 'Injuries', label: 'Injuries' },
];

const REACTIONS = [
  { key: 'like', icon: '👍', label: 'Like' }, { key: 'fire', icon: '🔥', label: 'Fire' },
  { key: 'wow', icon: '😮', label: 'Wow' }, { key: 'funny', icon: '😂', label: 'Funny' },
  { key: 'sad', icon: '😢', label: 'Sad' },
];

// ★ Reading Progress Hook
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
    try { await updateDoc(doc(db, 'news_posts', post.id), { [`reactions.${type}`]: increment(hasReacted ? -1 : 1), [userReactedKey]: !hasReacted }); } catch (err) { console.error("Reaction error:", err); }
  };

  const handleComment = async (postId) => {
    const text = newComments[postId]?.trim(); if (!text || !user) return;
    const tempComment = { id: `temp_${Date.now()}`, body: text, authorId: user.uid, authorName: userProfile?.displayName || 'User', createdAt: { toMillis: () => Date.now() } };
    setComments(prev => ({ ...prev, [postId]: [tempComment, ...(prev[postId] || [])] })); setNewComments(prev => ({ ...prev, [postId]: '' }));
    try { await addDoc(collection(db, 'news_posts', postId, 'comments'), { body: text, authorId: user.uid, authorName: userProfile?.displayName || 'User', createdAt: serverTimestamp() }); await updateDoc(doc(db, 'news_posts', postId), { commentsCount: increment(1) }); } 
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

  return (
    <div className="nh-page">
      {activePost && <div className="nh-progress-bar" style={{ width: `${scrollProgress}%` }} />}
      
      <SEO
        title={seoPost ? seoPost.title : "Football News, Transfers & Match Updates | ZOKASCORE"}
        description={seoPost ? seoPost.body.substring(0, 150) : "Follow the latest football news, transfer updates, match reports, injuries, club announcements, and breaking stories from leagues around the world on ZOKASCORE."}
        image={getSeoImageUrl(seoPost)} type="article"
        keywords={seoPost ? `${seoPost.title}, football news, transfer news, football updates, ZOKASCORE` : "football news, transfer news, football updates, breaking football news, match reports, injuries, ZOKASCORE"}
        robots="index,follow" breadcrumbs={[{ name: "Home", path: "/" }, { name: "Highlights", path: "/highlights" }]}
        structuredData={generateJsonLd(seoPost)}
      />

      <div className="nh-header">
        <div className="nh-header-inner">
          <div className="nh-logo-btn" onClick={() => { navigate('/highlights'); setActiveFilter('All'); }}>
            {activePost && <ArrowLeft size={18} />}
            <div className="nh-logo-icon"><Newspaper size={18} /></div>
            <span>News Hub</span>
          </div>
          <div className="nh-header-actions">
            <button onClick={toggleTheme} className="nh-icon-btn">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
            {isAdmin && <button onClick={openCreate} className="nh-primary-btn"><Plus size={16} /> New Post</button>}
          </div>
        </div>
      </div>

      <div className="nh-container">
        {loading ? (
          <div className="nh-feed">
            {[1, 2, 3].map(i => <div key={i} className="nh-skel-card" />)}
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
            <div className="nh-scroll nh-cats">
              {CATEGORIES.map(cat => (
                <button key={cat.key} onClick={() => setActiveFilter(cat.key)} className={`nh-cat-btn ${activeFilter === cat.key ? 'on' : ''}`}>{cat.label}</button>
              ))}
              {savedPosts.length > 0 && <button onClick={() => setActiveFilter('Saved')} className={`nh-cat-btn ${activeFilter === 'Saved' ? 'on' : ''}`}>Saved ({savedPosts.length})</button>}
            </div>

            {authorFilter && (
              <div className="nh-author-banner">
                <span>Showing posts by specific author</span>
                <button onClick={() => navigate('/highlights')}>Clear</button>
              </div>
            )}

            {trendingPosts.length > 1 && activeFilter === 'All' && !authorFilter && (
              <div className="nh-trending-wrap">
                <div className="nh-trending-head"><Flame size={16} /> <span>Trending Now</span></div>
                <div className="nh-scroll nh-trending-scroll">
                  {trendingPosts.map(p => (
                    <div key={p.id} onClick={() => navigate(`/highlights/${slugify(p.title)}-${p.id}`)} className="nh-trending-card">
                      {p.imageUrl ? <img src={p.imageUrl} alt="" /> : <div className="nh-trending-ph"><Newspaper size={24} /></div>}
                      <div className="nh-trending-badge"><Flame size={8} /> HOT</div>
                      <div className="nh-trending-info">
                        <div className="nh-trending-cat">{BADGES[p.category]?.label || p.category}</div>
                        <div className="nh-trending-title">{p.title}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {filteredPosts.length === 0 ? (
              <div className="nh-empty-state"><Newspaper size={40} /><p>No news articles found.</p></div>
            ) : (
              <>
                <div className="nh-feed">
                  {filteredPosts.slice(0, visibleCount).map((post, i) => (
                    <PostCard 
                      key={post.id} post={post} index={i} isAdmin={isAdmin} user={user} savedPosts={savedPosts}
                      onToggleSave={toggleSave} onShare={handleShare} onReaction={handleReaction} 
                      onEdit={openEdit} onDelete={handleDelete}
                      onExpand={(p) => navigate(`/highlights/${slugify(p.title)}-${p.id}`)}
                      onAuthorClick={() => navigate(`/highlights/author/${post.authorId}`)}
                      isHero={i === 0 && activeFilter === 'All' && !authorFilter}
                      comments={comments[post.id] || []} newComments={newComments} setNewComments={setNewComments}
                      handleComment={handleComment} fetchComments={fetchCommentsForFeed}
                    />
                  ))}
                </div>
                {filteredPosts.length > visibleCount && <button onClick={() => setVisibleCount(c => c + 15)} className="nh-load-more"><ChevronDown size={16} /> Load More Articles</button>}
              </>
            )}
          </>
        )}
      </div>

      {showScrollTop && <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="nh-fab"><ArrowUp size={24} /></button>}

      {lightboxImage && (
        <div onClick={() => setLightboxImage(null)} className="nh-lightbox">
          <img src={lightboxImage} alt="Expanded view" />
          <button onClick={() => setLightboxImage(null)} className="nh-lightbox-close"><X size={24} /></button>
        </div>
      )}

      {isFormOpen && (
        <div onClick={() => setIsFormOpen(false)} className="nh-modal-overlay">
          <div onClick={e => e.stopPropagation()} className="nh-modal-box">
            <div className="nh-modal-head">
              <h2>{editingPost ? 'Edit Post' : 'Create New Post'}</h2>
              <button onClick={() => setIsFormOpen(false)} className="nh-icon-btn"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="nh-modal-form">
              <div className="nh-form-group">
                <label>Title</label>
                <input value={formData.title} onChange={e => setFormData(d => ({ ...d, title: e.target.value }))} required placeholder="e.g. Mbappe ruled out for 3 weeks" />
              </div>
              <div className="nh-form-row">
                <div className="nh-form-group"><label>Category</label><select value={formData.category} onChange={e => setFormData(d => ({ ...d, category: e.target.value }))}>{Object.keys(BADGES).map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div className="nh-form-group"><label>Match ID (Optional)</label><input value={formData.relatedMatchId} onChange={e => setFormData(d => ({ ...d, relatedMatchId: e.target.value }))} placeholder="e.g. feat_2023-10-01_123" /></div>
              </div>
              <div className="nh-form-group">
                <label>Attachment (Optional)</label>
                {formData.imageUrl ? (
                  <div className="nh-img-preview"><img src={formData.imageUrl} alt="Preview" /><button type="button" onClick={() => setFormData(d => ({ ...d, imageUrl: '' }))} className="nh-img-clear"><X size={16} /></button></div>
                ) : (
                  <div className="nh-dropzone" onClick={() => fileInputRef.current?.click()}>
                    {uploadingImage ? <Loader size={24} className="animate-spin" /> : <ImageIcon size={24} />}
                    <span>Click to upload from device</span>
                    <span className="nh-dropzone-sub">Auto-compresses for fast loading</span>
                    <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} style={{ display: 'none' }} />
                  </div>
                )}
              </div>
              <div className="nh-form-group"><label>Body / Content</label><textarea value={formData.body} onChange={e => setFormData(d => ({ ...d, body: e.target.value }))} required rows={6} placeholder="Write the news details here..." /></div>
              <button type="submit" disabled={saving} className="nh-submit-btn">{saving ? <Loader size={18} className="animate-spin" /> : <Plus size={18} />} {saving ? 'Saving...' : (editingPost ? 'Update Post' : 'Publish Post')}</button>
            </form>
          </div>
        </div>
      )}

      {shareData && (
        <div onClick={() => setShareData(null)} className="nh-modal-overlay">
          <div onClick={e => e.stopPropagation()} className="nh-share-box">
            <h3>Share Article</h3>
            <div className="nh-share-grid">
              <a href={`https://wa.me/?text=${encodeURIComponent(shareData.title + " " + shareData.url)}`} target="_blank" rel="noreferrer" className="nh-share-btn wa">WhatsApp</a>
              <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareData.title)}&url=${encodeURIComponent(shareData.url)}`} target="_blank" rel="noreferrer" className="nh-share-btn tw">Twitter</a>
              <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareData.url)}`} target="_blank" rel="noreferrer" className="nh-share-btn fb">Facebook</a>
              <a href={`https://t.me/share/url?url=${encodeURIComponent(shareData.url)}&text=${encodeURIComponent(shareData.title)}`} target="_blank" rel="noreferrer" className="nh-share-btn tg">Telegram</a>
            </div>
            <button onClick={() => { navigator.clipboard.writeText(shareData.url); alert('Link copied!'); }} className="nh-copy-btn"><LinkIcon size={16} /> Copy Link</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   POST CARD COMPONENT
   ═══════════════════════════════════════════════════════════════ */
function PostCard({ post, index, isAdmin, user, savedPosts, onToggleSave, onShare, onReaction, onEdit, onDelete, onExpand, onAuthorClick, isHero, comments, newComments, setNewComments, handleComment, fetchComments }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showComments, setShowComments] = useState(false); 
  const isSaved = savedPosts.includes(post.id);
  const badge = BADGES[post.category] || { color: '#64748b', bg: 'rgba(255,255,255,0.05)', label: post.category };

  const toggleComments = () => { if (!showComments) fetchComments(post.id); setShowComments(p => !p); };

  return (
    <div className={`nh-card ${isHero ? 'nh-hero-card' : ''}`} style={{ animationDelay: `${index * 50}ms` }}>
      {post.imageUrl && (
        <div onClick={() => onExpand(post)} className="nh-card-img-wrap">
          <img src={post.imageUrl} alt={post.title} loading="lazy" />
          <div className={`nh-card-overlay ${isHero ? 'hero' : ''}`} />
          {isHero ? (
            <div className="nh-hero-content">
              <span className="nh-badge" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
              <h2 className="nh-hero-title">{post.title}</h2>
            </div>
          ) : (
            <div className="nh-card-badge-top"><span className="nh-badge" style={{ background: 'rgba(0,0,0,0.6)', color: badge.color }}>{badge.label}</span></div>
          )}
        </div>
      )}

      <div className="nh-card-body">
        <div onClick={() => onExpand(post)} className="nh-card-clickable">
          {(!isHero || !post.imageUrl) && (
            <div className="nh-author-row">
              <div onClick={(e) => { e.stopPropagation(); onAuthorClick(); }} className="nh-author-avatar">{(post.authorName || 'A')[0]}</div>
              <div className="nh-author-info">
                <div onClick={(e) => { e.stopPropagation(); onAuthorClick(); }} className="nh-author-name">{post.authorName || 'Admin'}</div>
                <div className="nh-time">{formatTimestamp(post.createdAt)} • {calcReadTime(post.body)} min read</div>
              </div>
              {!post.imageUrl && <span className="nh-badge" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>}
            </div>
          )}

          {isHero && post.imageUrl && (
            <div className="nh-hero-meta">
              <span onClick={(e) => { e.stopPropagation(); onAuthorClick(); }} className="nh-hero-author">By {post.authorName || 'Admin'}</span>
              <span className="nh-time">{formatTimestamp(post.createdAt)} • {calcReadTime(post.body)} min read</span>
            </div>
          )}

          {!isHero && <h3 className="nh-card-title">{post.title}</h3>}
          
          <p className={`nh-card-text ${isExpanded ? 'open' : ''}`}>{post.body}</p>
          {!isExpanded && post.body.length > 100 && <span className="nh-read-more" onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }}>Read more</span>}
          {isExpanded && <span className="nh-read-more" onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}>Show less</span>}
        </div>

        <div className="nh-card-stats">
          <span><Eye size={12} /> {post.views || 0}</span>
          <span><MessageCircle size={12} /> {post.commentsCount || 0}</span>
          {(post.views > 1000) && <span className="nh-trending-tag"><Flame size={12} /> Trending</span>}
        </div>

        <div className="nh-card-actions">
          <div className="nh-scroll nh-reactions">
            {REACTIONS.map(r => {
              const count = post.reactions?.[r.key] || 0;
              const hasReacted = post[`reacted_${r.key}_${user?.uid}`];
              return <button key={r.key} onClick={() => onReaction(post, r.key)} className={`nh-reaction-btn ${hasReacted ? 'on' : ''}`}><span>{r.icon}</span> {count > 0 && count}</button>;
            })}
          </div>
          <div className="nh-action-btns">
            <button onClick={toggleComments} className={`nh-icon-btn transparent ${showComments ? 'accent' : ''}`}><MessageCircle size={18} /></button>
            {!isHero && <button onClick={() => onToggleSave(post.id)} className={`nh-icon-btn transparent ${isSaved ? 'gold' : ''}`}><Bookmark size={18} fill={isSaved ? 'currentColor' : 'none'} /></button>}
            {!isHero && <button onClick={() => onShare(post)} className="nh-icon-btn transparent"><Share2 size={18} /></button>}
          </div>
        </div>
      </div>

      {showComments && <CommentSection postId={post.id} comments={comments} newComments={newComments} setNewComments={setNewComments} handleComment={handleComment} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SINGLE POST VIEW 
   ═══════════════════════════════════════════════════════════════ */
function SinglePostView({ post, comments, relatedMatch, isAdmin, user, savedPosts, onToggleSave, onShare, onReaction, onEdit, onDelete, onAuthorClick, relatedPosts, onRelatedClick, onImageClick, newComments, setNewComments, handleComment }) {
  const isSaved = savedPosts.includes(post.id);
  const badge = BADGES[post.category] || { color: '#64748b', bg: 'rgba(255,255,255,0.05)', label: post.category };
  const paragraphs = post.body.split('\n').filter(p => p.trim() !== '');

  return (
    <div className="nh-single-card">
      <div className="nh-single-head">
        <div className="nh-author-row">
          <div onClick={onAuthorClick} className="nh-author-avatar lg">{(post.authorName || 'A')[0]}</div>
          <div className="nh-author-info">
            <div onClick={onAuthorClick} className="nh-author-name">{post.authorName || 'Admin'}</div>
            <div className="nh-time">{formatTimestamp(post.createdAt)} • {calcReadTime(post.body)} min read • <Eye size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> {post.views || 0} views</div>
          </div>
          <span className="nh-badge" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
        </div>
      </div>

      <div className="nh-single-body">
        <h1 className="nh-single-title">{post.title}</h1>
        {paragraphs.map((para, i) => (
          <p key={i} className={`nh-single-para ${i === 0 ? 'drop-cap' : ''}`}>{para}</p>
        ))}
      </div>

      {relatedMatch && (
        <div className="nh-related-match">
          <div className="nh-rm-label">RELATED MATCH</div>
          <div className="nh-rm-teams">
            <span>{relatedMatch.homeTeam?.name || 'Home'}</span>
            <span className="nh-rm-score">{relatedMatch.homeScore ?? '-'} - {relatedMatch.awayScore ?? '-'}</span>
            <span>{relatedMatch.awayTeam?.name || 'Away'}</span>
          </div>
        </div>
      )}

      {post.imageUrl && <img src={post.imageUrl} alt={post.title} onClick={() => onImageClick(post.imageUrl)} className="nh-single-img" loading="lazy" />}

      <div className="nh-single-sticky-actions">
        <div className="nh-scroll nh-reactions">
          {REACTIONS.map(r => {
            const count = post.reactions?.[r.key] || 0;
            const hasReacted = post[`reacted_${r.key}_${user?.uid}`];
            return <button key={r.key} onClick={() => onReaction(post, r.key)} className={`nh-reaction-btn lg ${hasReacted ? 'on' : ''}`}><span>{r.icon}</span> {count > 0 && count}</button>;
          })}
        </div>
        <div className="nh-action-btns">
          <button onClick={() => onToggleSave(post.id)} className={`nh-icon-btn ${isSaved ? 'gold' : ''}`}><Bookmark size={18} fill={isSaved ? 'currentColor' : 'none'} /></button>
          <button onClick={() => onShare(post)} className="nh-icon-btn"><Share2 size={18} /></button>
        </div>
      </div>

      {isAdmin && (
        <div className="nh-admin-actions">
          <button onClick={() => onEdit(post)} className="nh-admin-btn"><Pencil size={14} /> Edit</button>
          <button onClick={() => onDelete(post.id)} className="nh-admin-btn danger"><Trash2 size={14} /> Delete</button>
        </div>
      )}

      <CommentSection postId={post.id} comments={comments} newComments={newComments} setNewComments={setNewComments} handleComment={handleComment} />

      {relatedPosts.length > 0 && (
        <div className="nh-related-wrap">
          <h3 className="nh-related-title">You might also like</h3>
          <div className="nh-related-list">
            {relatedPosts.map(p => (
              <div key={p.id} onClick={() => onRelatedClick(p)} className="nh-related-card">
                {p.imageUrl && <img src={p.imageUrl} alt="" />}
                <div className="nh-related-info">
                  <div className="nh-related-cat">{BADGES[p.category]?.label || p.category}</div>
                  <div className="nh-related-card-title">{p.title}</div>
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
    <div className="nh-comments-section">
      <div className="nh-comment-input-wrap">
        <input 
          value={newComments[postId] || ''}
          onChange={e => setNewComments(prev => ({ ...prev, [postId]: e.target.value }))}
          placeholder="Write a comment..."
          className="nh-comment-input"
        />
        <button onClick={() => handleComment(postId)} className="nh-comment-send"><Send size={16} /></button>
      </div>
      <div className="nh-comments-list">
        {(comments || []).length === 0 && <p className="nh-comments-empty">No comments yet.</p>}
        {(comments || []).map(c => (
          <div key={c.id} className="nh-comment-item">
            <div className="nh-comment-avatar">{c.authorName?.[0] || 'G'}</div>
            <div className="nh-comment-bubble">
              <div className="nh-comment-author">{c.authorName || 'Guest'}</div>
              <p className="nh-comment-text">{c.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}