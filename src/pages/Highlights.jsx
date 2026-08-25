import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Newspaper, X, Clock, MessageCircle, Plus, Pencil, Trash2, 
  Send, Image as ImageIcon, Loader, Sun, Moon, ArrowLeft, Eye, 
  Bookmark, Share2, Flame, Link as LinkIcon, ArrowUp, ChevronDown
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { db } from '../utils/firebase';
import { 
  collection, query, orderBy, onSnapshot, addDoc, updateDoc, 
  deleteDoc, doc, serverTimestamp, increment, getDoc 
} from 'firebase/firestore';

import { usePreferencesStore } from '../store/usePreferencesStore';
import { PATHS } from '../utils/constants';
import { safeWrite } from '../services/safeWrite';
import SEO from "../components/SEO";
import AdSlot from '../components/AdSlot'; 

// --- UTILS ---
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

export const BADGES = {
  'Breaking':     { label: `🔴 BREAKING`, color: 'var(--danger)', bg: 'rgba(var(--danger-rgb),.15)' },
  'Official':     { label: `🟢 OFFICIAL`, color: 'var(--primary)', bg: 'rgba(var(--primary-rgb),.15)' },
  'Rumour':       { label: `🟡 RUMOUR`, color: 'var(--gold)', bg: 'rgba(var(--gold-rgb),.15)' },
  'Match Report': { label: `🔵 MATCH REPORT`, color: 'var(--accent)', bg: 'rgba(var(--accent-rgb),.15)' },
  'Transfers':    { label: `🟠 TRANSFERS`, color: 'var(--warning)', bg: 'rgba(var(--warning-rgb),.15)' },
  'Injuries':     { label: `🟣 INJURIES`, color: 'var(--accent)', bg: 'rgba(var(--accent-rgb),.15)' },
};

export const CATEGORIES = ['All', 'Breaking', 'Official', 'Transfers', 'Match Report', 'Injuries'];

export const REACTIONS = [
  { id: 'like', emoji: '👍', label: 'Like' },
  { id: 'fire', emoji: '🔥', label: 'Fire' },
  { id: 'wow', emoji: '🤯', label: 'Mindblown' },
  { id: 'love', emoji: '❤️', label: 'Love' },
  { id: 'angry', emoji: '😡', label: 'Angry' }
];

// --- HOOKS ---
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

// --- COMPONENTS ---
function CommentSection({ postId, comments, newComments, setNewComments, handleComment }) {
  return (
    <div className="comments-wrap mt-16">
      <div className="comment-row">
        <input 
          value={newComments[postId] || ''}
          onChange={e => setNewComments(prev => ({ ...prev, [postId]: e.target.value }))}
          placeholder="Add comment..."
          className="comment-input"
        />
        <button onClick={() => handleComment(postId)} className="btn btn-primary"><Send size={16} /></button>
      </div>
      <div className="flex-col gap-8 mt-12">
        {(comments || []).length === 0 && <p className="text-muted text-sm text-center py-12">No comments yet.</p>}
        {(comments || []).map(c => (
          <div key={c.id} className="comment-row">
            <div className="comment-avatar">{c.authorName?.[0] || 'G'}</div>
            <div className="comment-bubble">
              <b>{c.authorName || 'Guest'}</b> <span>{c.body}</span>
              <small>{formatTimestamp(c.createdAt)}</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PostCard({ post, index, isAdmin, user, savedPosts, onToggleSave, onShare, onReaction, onEdit, onDelete, onExpand, onAuthorClick, isHero, comments, newComments, setNewComments, handleComment, fetchComments }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showComments, setShowComments] = useState(false); 
  const isSaved = savedPosts.includes(post.id);
  const badge = BADGES[post.category] || { label: post.category, color: 'var(--text-muted)', bg: 'var(--bg-elevated)' };
  const trending = (post.views || 0) > 1000;

  const toggleComments = () => { if (!showComments) fetchComments(post.id); setShowComments(p => !p); };

  return (
    <article className={`news-card anim-fade-up ${isHero ? 'expanded' : ''} ${trending ? 'trending' : ''}`} style={{ animationDelay: `${index * 50}ms` }}>
      {post.imageUrl && (
        <div onClick={() => onExpand(post)} className="news-img-wrap">
          <img src={post.imageUrl} alt={post.title} loading="lazy" className="news-img" />
          <div className="news-hero-overlay" />
          {isHero ? (
            <div className="news-hero-meta flex-col gap-8">
              <span className="badge" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
              <h2 className="news-title">{post.title}</h2>
            </div>
          ) : (
            <div className="absolute top-12 left-12">
              <span className="badge" style={{ background: 'rgba(0,0,0,0.6)', color: badge.color }}>{badge.label}</span>
            </div>
          )}
        </div>
      )}

      <div className="news-body">
        <div onClick={() => onExpand(post)} className="flex-col gap-8 cursor-pointer">
          {(!isHero || !post.imageUrl) && (
            <div className="news-author-row">
              <div onClick={(e) => { e.stopPropagation(); onAuthorClick(); }} className="news-avatar">{(post.authorName || 'A')[0]}</div>
              <div className="flex-col gap-2">
                <div onClick={(e) => { e.stopPropagation(); onAuthorClick(); }} className="font-bold text-sm text-primary">{post.authorName || 'Admin'}</div>
                <div className="text-muted text-xs">{formatTimestamp(post.createdAt)} {BULLET} {calcReadTime(post.body)} min read</div>
              </div>
              {!post.imageUrl && <span className="badge" style={{ background: badge.bg, color: badge.color, marginLeft: 'auto' }}>{badge.label}</span>}
            </div>
          )}

          {isHero && post.imageUrl && (
            <div className="news-author-row text-xs">
              <span onClick={(e) => { e.stopPropagation(); onAuthorClick(); }} className="font-bold text-primary">By {post.authorName || 'Admin'}</span>
              <span>{formatTimestamp(post.createdAt)} {BULLET} {calcReadTime(post.body)} min read</span>
            </div>
          )}

          {!isHero && <h3 className="news-title">{post.title}</h3>}
          
          <p className={`news-excerpt ${isExpanded ? '' : 'clamp-3'}`}>{post.body}</p>
          {!isExpanded && post.body.length > 100 && <span className="text-primary font-bold text-xs cursor-pointer" onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }}>Read more</span>}
          {isExpanded && <span className="text-primary font-bold text-xs cursor-pointer" onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}>Show less</span>}
        </div>

        <div className="news-stats">
          <span className="flex-center gap-4"><Eye size={12} /> {post.views || 0}</span>
          <span className="flex-center gap-4"><MessageCircle size={12} /> {post.commentsCount || 0}</span>
          {trending && <span className="badge badge-danger"><Flame size={12} /> Trending</span>}
        </div>

        <div className="news-actions">
          <div className="reactions">
            {REACTIONS.map(r => {
              const count = post.reactions?.[r.id] || 0;
              const hasReacted = post[`reacted_${r.id}_${user?.uid}`];
              return <button key={r.id} onClick={() => onReaction(post, r.id)} className={`reaction-btn ${hasReacted ? 'active' : ''}`}><span>{r.emoji}</span> {count > 0 && count}</button>;
            })}
          </div>
          <div className="card-cta">
            <button onClick={toggleComments} className="btn-icon-sm"><MessageCircle size={18} /></button>
            {!isHero && <button onClick={() => onToggleSave(post.id)} className="btn-icon-sm"><Bookmark size={18} fill={isSaved ? 'currentColor' : 'none'} className={isSaved ? 'text-gold' : ''} /></button>}
            {!isHero && <button onClick={() => onShare(post)} className="btn-icon-sm"><Share2 size={18} /></button>}
          </div>
        </div>
      </div>

      {showComments && <CommentSection postId={post.id} comments={comments} newComments={newComments} setNewComments={setNewComments} handleComment={handleComment} />}
      
      {isAdmin && (
        <div className="admin-actions mt-12">
          <button onClick={() => onEdit(post)} className="btn btn-secondary btn-sm flex-1"><Pencil size={14} /> Edit</button>
          <button onClick={() => onDelete(post.id)} className="btn btn-danger btn-sm flex-1"><Trash2 size={14} /> Delete</button>
        </div>
      )}
    </article>
  );
}

function SinglePostView({ post, comments, relatedMatch, isAdmin, user, savedPosts, onToggleSave, onShare, onReaction, onEdit, onDelete, onAuthorClick, relatedPosts, onRelatedClick, onImageClick, newComments, setNewComments, handleComment }) {
  const progress = useReadingProgress();
  const [lightbox, setLightbox] = useState(null);
  const isSaved = savedPosts.includes(post.id);
  const badge = BADGES[post.category] || { label: post.category, color: 'var(--text-muted)', bg: 'var(--bg-elevated)' };
  const paragraphs = post.body.split('\n').filter(p => p.trim() !== '');

  return (
    <article className="news-single glass-card">
      <div className="reading-progress" style={{ width: `${progress}%` }} />
      
      <div className="news-author-row mb-12">
        <div onClick={onAuthorClick} className="news-avatar" style={{ width: 40, height: 40 }}>{(post.authorName || 'A')[0]}</div>
        <div className="flex-col gap-2 flex-1">
          <div onClick={onAuthorClick} className="font-bold text-primary">{post.authorName || 'Admin'}</div>
          <div className="text-muted text-xs flex-center gap-4">
            {formatTimestamp(post.createdAt)} {BULLET} {calcReadTime(post.body)} min read {BULLET} <Eye size={10} /> {post.views || 0} views
          </div>
        </div>
        <span className="badge" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
      </div>

      <h1 className="news-title mt-12">{post.title}</h1>
      
      {post.imageUrl && <img src={post.imageUrl} alt={post.title} onClick={() => onImageClick(post.imageUrl)} className="news-img" style={{ height: 'auto', maxHeight: '450px', cursor: 'pointer', margin: '12px 0' }} loading="lazy" />}

      <div className="news-body flex-col gap-12">
        {paragraphs.map((para, i) => (
          <p key={i} style={i === 0 ? { fontSize: 'var(--fs-lg)', fontWeight: 800, color: 'var(--primary)' } : {}}>{para}</p>
        ))}
      </div>

      {relatedMatch && (
        <div className="related-match-box mt-12">
          <h4>Related Match: {relatedMatch.homeTeam?.name || 'Home'} vs {relatedMatch.awayTeam?.name || 'Away'}</h4>
          <p>{relatedMatch.leagueName} {BULLET} {relatedMatch.kickoff || 'TBD'}</p>
          <Link to={`/match/${relatedMatch.id}`}>View Match Center →</Link>
        </div>
      )}

      <div className="news-actions mt-16 p-12 sticky bottom-0 z-100 glass-card">
        <div className="reactions">
          {REACTIONS.map(r => {
            const count = post.reactions?.[r.id] || 0;
            const hasReacted = post[`reacted_${r.id}_${user?.uid}`];
            return <button key={r.id} onClick={() => onReaction(post, r.id)} className={`reaction-btn ${hasReacted ? 'active' : ''}`}><span>{r.emoji}</span> {count > 0 && count}</button>;
          })}
        </div>
        <div className="card-cta">
          <button onClick={() => onToggleSave(post.id)} className="btn-icon"><Bookmark size={18} fill={isSaved ? 'currentColor' : 'none'} className={isSaved ? 'text-gold' : ''} /></button>
          <button onClick={() => onShare(post)} className="btn-icon"><Share2 size={18} /></button>
        </div>
      </div>

      {isAdmin && (
        <div className="admin-actions mt-12">
          <button onClick={() => onEdit(post)} className="btn btn-secondary btn-sm flex-1"><Pencil size={14} /> Edit</button>
          <button onClick={() => onDelete(post.id)} className="btn btn-danger btn-sm flex-1"><Trash2 size={14} /> Delete</button>
        </div>
      )}

      <CommentSection postId={post.id} comments={comments} newComments={newComments} setNewComments={setNewComments} handleComment={handleComment} />

      {relatedPosts.length > 0 && (
        <div className="related-grid mt-24">
          <h3 className="text-primary font-bold mb-12 col-span-full">You might also like</h3>
          {relatedPosts.map(p => (
            <div key={p.id} onClick={() => onRelatedClick(p)} className="trending-card" style={{ height: '180px' }}>
              {p.imageUrl && <img src={p.imageUrl} alt="" className="trending-img" />}
              <div className="p-8 flex-col gap-4 absolute bottom-0 left-0 right-0 bg-overlay">
                <div className="text-danger font-bold text-xs">{BADGES[p.category]?.label || p.category}</div>
                <div className="text-primary font-bold line-clamp-2 text-sm">{p.title}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({"@context":"https://schema.org","@type":"NewsArticle", headline:post.title, image:[getSeoImageUrl(post)], datePublished:post.createdAt?.toMillis ? new Date(post.createdAt.toMillis()).toISOString() : new Date().toISOString(), author:{name:post.authorName}}) }} />
    </article>
  );
}

function AdminForm({ formData, setFormData, handleSave, saving, uploadingImage, handleImageUpload, fileInputRef, onClose, editingPost }) {
  return (
    <div onClick={onClose} className="modal-overlay">
      <div onClick={e => e.stopPropagation()} className="modal-box" style={{ maxWidth: '600px', textAlign: 'left' }}>
        <div className="flex-between p-16 border-b mb-16">
          <h2 className="text-primary font-bold">{editingPost ? 'Edit Post' : 'Create New Post'}</h2>
          <button onClick={onClose} className="btn-icon"><X size={18} /></button>
        </div>
        <form onSubmit={handleSave} className="flex-col gap-16">
          <div className="flex-col gap-8">
            <label className="text-muted font-bold text-xs">Title</label>
            <input value={formData.title} onChange={e => setFormData(d => ({ ...d, title: e.target.value }))} required placeholder="e.g. Mbappe ruled out for 3 weeks" className="form-input" />
          </div>
          <div className="flex gap-12">
            <div className="flex-col gap-8 flex-1">
              <label className="text-muted font-bold text-xs">Category</label>
              <select value={formData.category} onChange={e => setFormData(d => ({ ...d, category: e.target.value }))} className="form-input">
                {Object.keys(BADGES).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex-col gap-8 flex-1">
              <label className="text-muted font-bold text-xs">Match ID (Optional)</label>
              <input value={formData.relatedMatchId} onChange={e => setFormData(d => ({ ...d, relatedMatchId: e.target.value }))} placeholder="e.g. feat_2023-10-01_123" className="form-input" />
            </div>
          </div>
          <div className="flex-col gap-8">
            <label className="text-muted font-bold text-xs">Attachment (Optional)</label>
            {formData.imageUrl ? (
              <div className="relative p-8">
                <img src={formData.imageUrl} alt="Preview" className="w-full rounded-8" />
                <button type="button" onClick={() => setFormData(d => ({ ...d, imageUrl: '' }))} className="btn-icon absolute top-12 right-12"><X size={16} /></button>
              </div>
            ) : (
              <div className="glass-card flex-col p-20 items-center gap-8 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                {uploadingImage ? <Loader size={24} className="anim-spin text-primary" /> : <ImageIcon size={24} className="text-muted" />}
                <span className="text-muted text-sm">Click to upload from device</span>
                <span className="text-muted text-xs">Auto-compresses for fast loading</span>
                <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />
              </div>
            )}
          </div>
          <div className="flex-col gap-8">
            <label className="text-muted font-bold text-xs">Body / Content</label>
            <textarea value={formData.body} onChange={e => setFormData(d => ({ ...d, body: e.target.value }))} required rows={6} placeholder="Write the news details here..." className="form-input" style={{ minHeight: '120px', resize: 'vertical' }} />
          </div>
          <button type="submit" disabled={saving} className="btn btn-primary w-full mt-8">{saving ? <Loader size={18} className="anim-spin" /> : <Plus size={18} />} {saving ? 'Saving...' : (editingPost ? 'Update Post' : 'Publish Post')}</button>
        </form>
      </div>
    </div>
  );
}

function AdSlot({ index }) { 
  return <div className="ad-slot">Ad {BULLET} slot {index}</div>; 
}

// --- MAIN COMPONENT ---
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
  const progress = useReadingProgress();

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 500);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => { setVisibleCount(15); }, [activeFilter, authorFilter]);

  // Fetch all posts
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

  // Fetch single post if URL changes
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

  // Fetch comments for active post
  useEffect(() => {
    if (!activePost || !db) return;
    const targetId = activePost.id;
    if (comments[targetId]) return;
    const q = query(collection(db, 'news_posts', targetId, 'comments'), orderBy('createdAt', 'desc'));
    onSnapshot(q, (snap) => setComments(prev => ({ ...prev, [targetId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) })));
  }, [activePost, db, comments]);

  const fetchCommentsForFeed = (postId) => {
    if (comments[postId] || !db) return; 
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
    } catch (err) { console.error("Save post error:", err); } finally { setSaving(false); }
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
    <div className="highlights-page">
      <div className="reading-progress" style={{ width: `${progress}%` }} />
      
      <SEO
        title={seoPost ? seoPost.title : "Football News, Transfers & Match Updates | ZOKASCORE"}
        description={seoPost ? seoPost.body.substring(0, 150) : "Follow the latest football news, transfer updates, match reports, injuries, and breaking stories from leagues around the world."}
        image={getSeoImageUrl(seoPost)} 
        type={activePost ? "article" : "website"}
        keywords={seoPost ? `${seoPost.title}, football news, transfer news` : "football news, transfer news, match reports, ZOKASCORE"}
        robots="index,follow" 
        structuredData={activePost ? generateJsonLd(seoPost) : feedSchema}
      />

      <div className="company-sticky-hdr">
        <div className="zoka-wrap flex-between py-12">
          <div className="flex-center gap-8 cursor-pointer" onClick={() => { navigate('/highlights'); setActiveFilter('All'); }}>
            {activePost && <ArrowLeft size={18} className="text-primary" />}
            <div className="company-hero-icon" style={{ width: 32, height: 32 }}><Newspaper size={18} /></div>
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
          <div className="flex-col gap-16 mt-16">
            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 300, borderRadius: 16 }} />)}
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
            <div className="filter-row mt-16 mb-16">
              {CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setActiveFilter(cat)} className={`filter-btn ${activeFilter === cat ? 'active' : ''}`}>{cat}</button>
              ))}
              {savedPosts.length > 0 && <button onClick={() => setActiveFilter('Saved')} className={`filter-btn ${activeFilter === 'Saved' ? 'active' : ''}`}>Saved ({savedPosts.length})</button>}
            </div>

            {authorFilter && (
              <div className="glass-card flex-between p-12 mb-16">
                <span className="text-muted text-sm">Showing posts by specific author</span>
                <button onClick={() => navigate('/highlights')} className="btn btn-ghost btn-sm">Clear</button>
              </div>
            )}

            {trendingPosts.length > 1 && activeFilter === 'All' && !authorFilter && (
              <div className="mb-24">
                <div className="flex-center gap-8 text-primary font-bold mb-12"><Flame size={16} className="text-danger" /> <span>Trending Now</span></div>
                <div className="trending-row">
                  {trendingPosts.map(p => (
                    <div key={p.id} onClick={() => navigate(`/highlights/${slugify(p.title)}-${p.id}`)} className="trending-card">
                      {p.imageUrl ? <img src={p.imageUrl} alt="" className="trending-img" /> : <div className="trending-img flex-center text-primary"><Newspaper size={24} /></div>}
                      <div className="badge badge-danger absolute top-8 right-8"><Flame size={8} /> HOT</div>
                      <div className="p-8 flex-col gap-4 absolute bottom-0 left-0 right-0 bg-overlay">
                        <div className="text-danger font-bold text-xs">{BADGES[p.category]?.label || p.category}</div>
                        <div className="text-primary font-bold line-clamp-2 text-sm">{p.title}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {filteredPosts.length === 0 ? (
              <div className="zk-empty-state glass-card mt-16">
                <Newspaper size={40} className="text-muted mb-8" />
                <p className="text-muted">No news articles found.</p>
              </div>
            ) : (
              <>
                <div className="news-grid">
                  {filteredPosts.slice(0, visibleCount).map((post, i) => (
                    <React.Fragment key={post.id}>
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
                      {(i + 1) % 4 === 0 && <AdSlot index={(i + 1) / 4} />}
                    </React.Fragment>
                  ))}
                </div>
                {filteredPosts.length > visibleCount && <button onClick={() => setVisibleCount(c => c + 15)} className="load-more mt-16"><ChevronDown size={16} /> Load More Articles</button>}
              </>
            )}
          </>
        )}
      </div>

      {showScrollTop && <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="scroll-top-btn"><ArrowUp size={24} /></button>}

      {lightboxImage && (
        <div onClick={() => setLightboxImage(null)} className="lightbox">
          <img src={lightboxImage} alt="Expanded view" />
          <button onClick={() => setLightboxImage(null)} className="close"><X size={24} /></button>
        </div>
      )}

      {isFormOpen && (
        <AdminForm 
          formData={formData} setFormData={setFormData} handleSave={handleSave} saving={saving} 
          uploadingImage={uploadingImage} handleImageUpload={handleImageUpload} 
          fileInputRef={fileInputRef} onClose={() => setIsFormOpen(false)} editingPost={editingPost}
        />
      )}

      {shareData && (
        <div onClick={() => setShareData(null)} className="modal-overlay">
          <div onClick={e => e.stopPropagation()} className="modal-box share-modal">
            <h3 className="text-primary font-bold mb-16">Share Article</h3>
            <div className="share-grid mb-16">
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