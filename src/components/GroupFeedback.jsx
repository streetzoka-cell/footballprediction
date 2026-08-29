// src/components/GroupFeedback.jsx
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Star, MessageSquare, Send, LogIn } from 'lucide-react';
import { footballApi } from '../services/footballApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../core/ToastManager';

const FAM_LABEL = {
  DAY: 'Overall', TOP10_DAILY: '🔥 TOP10', PURE_1X2: '🔒 1X2',
  GG_BTTS: '⚽ GG', OVER_UNDER: '📈 O/U', SCORE: '🎯 CS', LOW_CONFIDENCE: '⚠️ Risky',
};

const StarRow = ({ value, onChange, size = 18 }) => (
  <div className="flex-center gap-2">
    {[1, 2, 3, 4, 5].map((s) => (
      <button key={s} onClick={() => onChange(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} aria-label={`${s} stars`}>
        <Star size={size} fill={s <= value ? '#b8860b' : 'none'} color={s <= value ? '#b8860b' : '#666'} />
      </button>
    ))}
  </div>
);

const timeAgo = (iso) => {
  const t = Date.parse(iso || '');
  if (!t) return '';
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
};

export default function GroupFeedback({ date, familyOrder = [] }) {
  const { currentUser } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const loggedIn = !!currentUser;

  const [fam, setFam] = useState('DAY');
  const [stars, setStars] = useState(0);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showInput, setShowInput] = useState(false);

  const { data } = useQuery({
    queryKey: ['groupFeedback', date],
    queryFn: () => footballApi.getGroupFeedback(date).then((r) => r?.data || { comments: [], ratings: {} }),
    enabled: !!date,
    staleTime: 60 * 1000,
  });

  const comments = data?.comments || [];
  const ratings = data?.ratings || {};
  const famOptions = ['DAY', ...familyOrder.filter((f) => f !== 'LOW_CONFIDENCE')];

  const submitRating = async () => {
    if (!loggedIn) return toast.error('Log in to rate');
    if (!stars) return;
    setSending(true);
    try {
      await footballApi.rateGroup(date, { family: fam, stars });
      toast.success(`Rated ${FAM_LABEL[fam] || fam} ${stars}★`);
      queryClient.invalidateQueries(['groupFeedback', date]);
    } catch { toast.error('Rating failed'); }
    setSending(false);
  };

  const submitComment = async () => {
    if (!loggedIn) return toast.error('Log in to comment');
    if (text.trim().length < 2) return;
    setSending(true);
    try {
      await footballApi.postGroupComment(date, { text: text.trim(), family: fam, displayName: currentUser?.displayName || undefined });
      setText('');
      toast.success('Comment posted ✓');
      queryClient.invalidateQueries(['groupFeedback', date]);
    } catch { toast.error('Comment failed'); }
    setSending(false);
  };

  return (
    <div className="glass-card p-16 mb-16">
      <h2 className="section-h2 flex-center gap-6"><MessageSquare size={15} /> Rate & Discuss</h2>

      {/* family selector */}
      <div className="flex-center gap-6 mb-10 flex-wrap">
        {famOptions.map((f) => (
          <button key={f} className={`v21-fbtn${fam === f ? ' on' : ''}`} style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setFam(f)}>
            {FAM_LABEL[f] || f}{ratings[f]?.avg ? ` ${ratings[f].avg}★` : ''}
          </button>
        ))}
      </div>

      {/* rating */}
      <div className="flex-center gap-12 mb-12 flex-wrap" style={{ justifyContent: 'center' }}>
        <StarRow value={stars} onChange={setStars} />
        <button className="btn btn-primary btn-sm" onClick={submitRating} disabled={sending || !stars}>
          {sending ? '…' : 'Rate'}
        </button>
        {ratings[fam] && (
          <span className="text-xs muted">{ratings[fam].avg}★ from {ratings[fam].count} player{ratings[fam].count === 1 ? '' : 's'}</span>
        )}
      </div>

      {/* composer */}
      {showInput ? (
        <div className="flex-col gap-8 mb-12">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 400))}
            placeholder={loggedIn ? `Thoughts on today's ${FAM_LABEL[fam] || 'picks'}?` : 'Log in to join the discussion'}
            rows={2}
            className="input"
            style={{ resize: 'vertical' }}
            disabled={!loggedIn}
          />
          <div className="flex-center gap-8" style={{ justifyContent: 'flex-end' }}>
            <span className="text-xs muted">{text.length}/400</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowInput(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={submitComment} disabled={sending || text.trim().length < 2}>
              <Send size={12} /> Post
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn-ghost btn-sm w-full mb-12" onClick={() => setShowInput(true)}>
          {loggedIn ? <><MessageSquare size={12} /> Write a comment</> : <><LogIn size={12} /> Log in to comment</>}
        </button>
      )}

      {/* comments */}
      {comments.length === 0 ? (
        <p className="text-xs muted text-center">No comments yet — be the first voice.</p>
      ) : (
        <div className="flex-col gap-8">
          {comments.map((c) => (
            <div key={c.id} className="md-mini-row" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div className="v21-zoka-icon" style={{ width: 24, height: 24, fontSize: 11, flexShrink: 0 }}>
                {String(c.displayName || 'P').slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="text-xs"><strong>{c.displayName || 'Player'}</strong> <span className="muted">· {timeAgo(c.createdAt)}{c.family && c.family !== 'DAY' ? ` · ${FAM_LABEL[c.family] || c.family}` : ''}</span></div>
                <div className="text-sm">{c.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}