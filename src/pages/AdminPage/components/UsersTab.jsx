import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { Users, Loader2, Search, ChevronDown } from 'lucide-react';
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

  const loadUsers = useCallback(async (more = false) => {
    if (!db) return;
    setLoading(true);
    try {
      let q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limitQ(50));
      if (more && lastKey) {
        q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), startAfter(lastKey), limitQ(50));
      }
      const snap = await getDocs(q);
      if (mounted.current) {
        const newUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setUsers(prev => more ? [...prev, ...newUsers] : newUsers);
        setLastKey(snap.docs[snap.docs.length - 1] || null);
        setHasMore(snap.docs.length === 50);
      }
    } catch (e) { toast('Load failed: ' + e.message, 'er'); }
    setLoading(false);
  }, [db, lastKey, toast, mounted]);

  useEffect(() => {
    loadUsers(false);
  }, [loadUsers]);

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(u => 
      (u.displayName || '').toLowerCase().includes(q) || 
      (u.email || '').toLowerCase().includes(q) ||
      (u.id || '').toLowerCase().includes(q)
    );
  }, [users, search]);

  return (
    <div className="ae">
      <div className="asec">
        <h3 className="ast"><Users size={15} /> Users</h3>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input className="aip" style={{ paddingLeft: 36 }} placeholder="Search by name, email, UID..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {loading && !hasMore ? <Skel n={4} /> : filtered.length > 0 ? filtered.map((u, i) => (
          <div key={u.id} className="aur">
            <div style={{ width: 38, height: 38, borderRadius: 10, background: `hsl(${(i * 37) % 360}, 50%, 25%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '.78rem', flexShrink: 0 }}>
              {(u.displayName || u.email || '??').slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{u.displayName || 'Anonymous'}</div>
              <div style={{ fontSize: '.66rem', color: 'var(--text-muted)', fontWeight: 600 }}>{u.email || u.id}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '.68rem', fontWeight: 700, color: u.role === 'admin' ? 'var(--gold)' : u.role === 'staff' ? 'var(--blue)' : 'var(--text-muted)' }}>{(u.role || 'user').toUpperCase()}</div>
              <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', fontWeight: 600 }}>{u.createdAt ? fmtTimeAgo(u.createdAt) : ''}</div>
            </div>
          </div>
        )) : !loading && <Empty icon={Users} title="No users found" />}
        {hasMore && (
          <button className="asm" onClick={() => loadUsers(true)} disabled={loading} style={{ marginTop: 8 }}>
            {loading ? <Loader2 size={13} className="asp" /> : <ChevronDown size={13} />} Load more
          </button>
        )}
      </div>
    </div>
  );
});

export default UsersTab;