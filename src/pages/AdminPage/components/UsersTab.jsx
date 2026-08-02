// footballprediction/src/pages/AdminPage/components/UsersTab.jsx

import React, { useState, useCallback, useMemo, memo } from 'react';
import { Users, Loader2, Search, ChevronDown, RefreshCw } from 'lucide-react';
import { db } from '../../../utils/firebase';
import { collection, getDocs, query, orderBy, limit as limitQ, startAfter } from 'firebase/firestore';
import { useMounted, fmtTimeAgo, Empty, Skel } from './common';

const UsersTab = memo(function UsersTab({ toast }) {
  const mounted = useMounted();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [lastKey, setLastKey] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const loadUsers = useCallback(async (more = false) => {
    if (!db) return; setLoading(true);
    try {
      let q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limitQ(50));
      if (more && lastKey) q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), startAfter(lastKey), limitQ(50));
      const snap = await getDocs(q);
      if (mounted.current) {
        const newUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setUsers(prev => more ? [...prev, ...newUsers] : newUsers);
        setLastKey(snap.docs[snap.docs.length - 1] || null);
        setHasMore(snap.docs.length === 50);
        setIsInitialLoad(false);
      }
    } catch (e) { toast('Load failed: ' + e.message, 'er'); }
    setLoading(false);
  }, [db, lastKey, toast, mounted]);

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(u => (u.displayName || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.id || '').toLowerCase().includes(q));
  }, [users, search]);

  return (
    <div className="glass-card p-16 flex-col gap-12">
      <h3 className="text-primary font-bold flex-center gap-8"><Users size={15} /> Users</h3>
      {isInitialLoad ? (
        <button className="btn btn-secondary w-full" onClick={() => loadUsers(false)} disabled={loading}>
          {loading ? <Loader2 size={15} className="anim-spin" /> : <RefreshCw size={15} />} Load Users
        </button>
      ) : (
        <>
          <div className="relative">
            <Search size={15} className="absolute left-12 top-1/2 -translate-y-1/2 text-muted" />
            <input className="form-input pl-36" placeholder="Search by name, email, UID..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {loading && users.length === 0 ? <Skel n={4} /> : filtered.length > 0 ? filtered.map((u, i) => (
            <div key={u.id} className="glass-card p-12 flex-between">
              <div className="flex-center gap-12">
                <div className="flex-center font-extrabold text-inverse" style={{ width: 38, height: 38, borderRadius: 10, background: `hsl(${(i * 37) % 360}, 50%, 25%)`, fontSize: '.78rem' }}>{(u.displayName || u.email || '??').slice(0, 2).toUpperCase()}</div>
                <div className="flex-col">
                  <div className="text-primary font-bold text-sm">{u.displayName || 'Anonymous'}</div>
                  <div className="text-muted text-xs">{u.email || u.id}</div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-xs font-bold ${u.role === 'admin' ? 'text-gold' : u.role === 'staff' ? 'text-accent' : 'text-muted'}`}>{(u.role || 'user').toUpperCase()}</div>
                <div className="text-muted text-xs">{u.createdAt ? fmtTimeAgo(u.createdAt) : ''}</div>
              </div>
            </div>
          )) : !loading && <Empty icon={Users} title="No users found" />}
          {hasMore && (
            <button className="btn btn-secondary w-full" onClick={() => loadUsers(true)} disabled={loading}>
              {loading ? <Loader2 size={13} className="anim-spin" /> : <ChevronDown size={13} />} Load more
            </button>
          )}
        </>
      )}
    </div>
  );
});

export default UsersTab;
