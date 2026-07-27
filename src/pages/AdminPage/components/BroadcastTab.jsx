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
    } catch (e) {
      toast('Load failed: ' + e.message, 'er');
    }
    setLoadingUsers(false);
  }, [toast]);

  const selectUser = useCallback((u) => {
    setType('personal');
    setUid(u.id);
    setSearch(`${u.displayName || u.email || u.id}`);
    setShowUserList(false);
    toast(`Selected ${u.displayName || u.email}`, 'ok');
  }, [toast]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(u => 
      (u.displayName || '').toLowerCase().includes(q) || 
      (u.email || '').toLowerCase().includes(q) ||
      (u.id || '').toLowerCase().includes(q)
    );
  }, [users, search]);

  const handleSend = useCallback(async () => {
    if (!db || !title.trim() || !message.trim()) return;
    if (type === 'personal' && !uid.trim()) { toast('Target UID required', 'in'); return; }
    
    setSending(true);
    try {
      await addDoc(collection(db, 'notifications'), {
        type,
        targetUid: type === 'personal' ? uid.trim() : null,
        title: title.trim(),
        body: message.trim(),
        createdAt: serverTimestamp(),
        readBy: [],
      });
      toast(`Notification sent!`, 'ok');
      setTitle(''); setMessage(''); setUid(''); setSearch('');
    } catch (e) { toast('Send failed: ' + e.message, 'er'); }
    setSending(false);
  }, [db, title, message, type, uid, toast]);

  return (
    <div className="ae">
      <div className="asec">
        <h3 className="ast"><Megaphone size={15} /> Send Notification</h3>
        
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button className={`ab ab-sm ${type === 'global' ? 'ab-p' : 'ab-ol'}`} onClick={() => setType('global')} style={{ flex: 1 }}>
            <Users size={12} /> Global
          </button>
          <button className={`ab ab-sm ${type === 'personal' ? 'ab-p' : 'ab-ol'}`} onClick={() => setType('personal')} style={{ flex: 1 }}>
            <UserCog size={12} /> Personal
          </button>
        </div>

        {type === 'personal' && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input className="aip" placeholder="Enter User UID manually or load users..." value={search} onChange={e => setSearch(e.target.value)} />
              <button className="ab ab-bl ab-sm" onClick={loadUsers} disabled={loadingUsers} style={{ flexShrink: 0 }}>
                {loadingUsers ? <Loader2 size={11} className="asp" /> : <Users size={11} />} Load Users
              </button>
            </div>
            {showUserList && (
              <div style={{ border: '1px solid var(--border)', borderRadius: '10px', maxHeight: '200px', overflowY: 'auto', background: 'var(--bg-surface)' }}>
                {filteredUsers.length > 0 ? filteredUsers.map(u => (
                  <div key={u.id} className="aur" style={{ margin: 0, borderRadius: 0, borderBottom: '1px solid var(--border)' }} onClick={() => selectUser(u)}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.65rem', fontWeight: 800, color: '#fff' }}>
                      {(u.displayName || u.email || '??').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '.76rem', fontWeight: 700, color: 'var(--text-primary)' }}>{u.displayName || 'Anonymous'}</div>
                      <div style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>{u.email || u.id}</div>
                    </div>
                  </div>
                )) : <p style={{ padding: 14, textAlign: 'center', color: 'var(--text-muted)', fontSize: '.75rem' }}>No users found</p>}
              </div>
            )}
            {uid && <div className="aedit-hint" style={{ marginTop: 4 }}>Target UID: {uid}</div>}
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <input className="aip" placeholder="Notification Title..." value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        
        <div style={{ marginBottom: 14 }}>
          <textarea className="aip" placeholder="Message body..." value={message} onChange={e => setMessage(e.target.value)} rows={4} style={{ resize: 'vertical', minHeight: 100 }} />
        </div>

        <button className="ab ab-p" onClick={handleSend} disabled={sending || !title.trim() || !message.trim()} style={{ width: '100%' }}>
          {sending ? <Loader2 size={13} className="asp" /> : <Send size={13} />} Broadcast Message
        </button>
      </div>
    </div>
  );
});

export default BroadcastTab;