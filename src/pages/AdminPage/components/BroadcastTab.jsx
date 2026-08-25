import React, { useState, useCallback, useMemo, memo } from 'react';
import { Megaphone, Send, Loader2, Users, UserCog } from 'lucide-react';
import { db } from '../../../utils/firebase';
import { collection, getDocs, addDoc, serverTimestamp, query, limit as limitQ } from 'firebase/firestore';
import { Empty } from './common';

const BroadcastTab = memo(function BroadcastTab({ toast }) {
  const [type, setType] = useState('global');
  const [uid, setUid] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [search, setSearch] = useState('');
  const [showUserList, setShowUserList] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!db) return;
    setLoadingUsers(true);
    try {
      const snap = await getDocs(query(collection(db, 'users'), limitQ(100)));
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setShowUserList(true);
    } catch (e) { toast('Load failed: ' + e.message, 'er'); }
    setLoadingUsers(false);
  }, [toast]);

  const selectUser = useCallback((u) => {
    setType('personal'); setUid(u.id);
    setSearch(`${u.displayName || u.email || u.id}`);
    setShowUserList(false); toast(`Selected ${u.displayName || u.email}`, 'ok');
  }, [toast]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(u => (u.displayName || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.id || '').toLowerCase().includes(q));
  }, [users, search]);

  const handleSend = useCallback(async () => {
    if (!db || !title.trim() || !message.trim()) return;
    if (type === 'personal' && !uid.trim()) { toast('Target UID required', 'in'); return; }
    setSending(true);
    try {
      await addDoc(collection(db, 'notifications'), { type, targetUid: type === 'personal' ? uid.trim() : null, title: title.trim(), body: message.trim(), createdAt: serverTimestamp(), readBy: [] });
      toast(`Notification sent!`, 'ok'); setTitle(''); setMessage(''); setUid(''); setSearch('');
    } catch (e) { toast('Send failed: ' + e.message, 'er'); }
    setSending(false);
  }, [db, title, message, type, uid, toast]);

  return (
    <div className="glass-card p-16 flex flex-col gap-12">
      <h3 className="text-primary font-bold flex-center gap-8"><Megaphone size={15} /> Send Notification</h3>
      <div className="flex gap-8">
        <button className={`btn flex-1 ${type === 'global' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setType('global')}><Users size={12} /> Global</button>
        <button className={`btn flex-1 ${type === 'personal' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setType('personal')}><UserCog size={12} /> Personal</button>
      </div>

      {type === 'personal' && (
        <div className="flex flex-col gap-8">
          <div className="flex gap-8">
            <input className="form-input flex-1" placeholder="Enter User UID manually or load users..." value={search} onChange={e => setSearch(e.target.value)} />
            <button className="btn btn-secondary" onClick={loadUsers} disabled={loadingUsers}>
              {loadingUsers ? <Loader2 size={11} className="anim-spin" /> : <Users size={11} />} Load Users
            </button>
          </div>
          {showUserList && (
            <div className="glass-card p-8 max-h-200px flex flex-col gap-4">
              {filteredUsers.length > 0 ? filteredUsers.map(u => (
                <div key={u.id} className="flex-center gap-8 p-8 cursor-pointer hover-card rounded-md" onClick={() => selectUser(u)}>
                  <div className="flex-center font-extrabold text-inverse bg-accent" style={{ width: 30, height: 30, borderRadius: 8, fontSize: '.65rem' }}>{(u.displayName || u.email || '??').slice(0, 2).toUpperCase()}</div>
                  <div className="flex flex-col">
                    <div className="text-primary font-bold text-sm">{u.displayName || 'Anonymous'}</div>
                    <div className="text-muted text-xs">{u.email || u.id}</div>
                  </div>
                </div>
              )) : <p className="text-muted text-sm text-center p-12">No users found</p>}
            </div>
          )}
          {uid && <div className="text-muted text-xs">Target UID: {uid}</div>}
        </div>
      )}

      <input className="form-input" placeholder="Notification Title..." value={title} onChange={e => setTitle(e.target.value)} />
      <textarea className="form-input" placeholder="Message body..." value={message} onChange={e => setMessage(e.target.value)} rows={4} style={{ resize: 'vertical', minHeight: 100 }} />
      <button className="btn btn-primary w-full" onClick={handleSend} disabled={sending || !title.trim() || !message.trim()}>
        {sending ? <Loader2 size={13} className="anim-spin" /> : <Send size={13} />} Broadcast Message
      </button>
    </div>
  );
});

export default BroadcastTab;