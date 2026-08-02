// footballprediction/src/pages/AdminPage/components/StaffTab.jsx

import React, { useState, useCallback, memo } from 'react';
import { UserCog, Users, Plus, Ban, Loader2 } from 'lucide-react';
import { db } from '../../../utils/firebase';
import { collection, getDocs, doc, setDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { useMounted, Empty } from './common';

const StaffTab = memo(function StaffTab({ toast }) {
  const mounted = useMounted();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const loadStaff = useCallback(async () => {
    if (!db) return; setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['admin', 'staff'])));
      if (mounted.current) setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.role === 'admin' ? 0 : 1) - (b.role === 'admin' ? 0 : 1)));
    } catch (e) { toast('Load failed: ' + e.message, 'er'); }
    setLoading(false);
  }, [db, mounted, toast]);

  const addStaff = useCallback(async () => {
    if (!db || !email.trim()) return; setAdding(true);
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email.trim().toLowerCase())));
      if (snap.empty) { toast('User not found', 'er'); setAdding(false); return; }
      const uid = snap.docs[0].id;
      await setDoc(doc(db, 'users', uid), { role: 'staff', updatedAt: serverTimestamp() }, { merge: true });
      toast(`Added ${email} as staff`, 'ok'); setEmail(''); loadStaff();
    } catch (e) { toast('Add failed: ' + e.message, 'er'); }
    setAdding(false);
  }, [db, email, toast, loadStaff]);

  const removeRole = useCallback(async (uid) => {
    if (!db) return;
    try {
      await setDoc(doc(db, 'users', uid), { role: 'user', updatedAt: serverTimestamp() }, { merge: true });
      toast('Role removed', 'ok'); setStaff(prev => prev.filter(s => s.id !== uid));
    } catch (e) { toast('Remove failed: ' + e.message, 'er'); }
  }, [db, toast]);

  return (
    <div className="glass-card p-16 flex-col gap-12">
      <h3 className="text-primary font-bold flex-center gap-8"><UserCog size={15} /> Staff Members</h3>
      <div className="flex gap-8">
        <input className="form-input flex-1" placeholder="Enter email to add as staff..." value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && addStaff()} />
        <button className="btn btn-primary" onClick={addStaff} disabled={adding || !email.trim()}>
          {adding ? <Loader2 size={11} className="anim-spin" /> : <Plus size={11} />} Add
        </button>
      </div>
      <button className="btn btn-secondary" onClick={loadStaff} disabled={loading}>
        {loading ? <Loader2 size={11} className="anim-spin" /> : <Users size={11} />} {staff.length > 0 ? 'Refresh' : 'Load Staff from Firebase'}
      </button>
      {staff.length > 0 ? staff.map(s => (
        <div key={s.id} className="glass-card p-12 flex-between">
          <div className="flex-center gap-12">
            <div className="flex-center font-extrabold text-inverse" style={{ width: 38, height: 38, borderRadius: 10, background: s.role === 'admin' ? 'rgba(var(--gold-rgb),.12)' : 'rgba(var(--accent-rgb),.12)', color: s.role === 'admin' ? 'var(--gold)' : 'var(--accent)', fontSize: '.85rem' }}>
              {(s.displayName || s.email || '??').slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-col">
              <div className="text-primary font-bold text-sm">{s.displayName || 'Unknown'}</div>
              <div className="text-muted text-xs">{s.email}</div>
            </div>
          </div>
          <div className="flex-center gap-8">
            <span className={`badge ${s.role === 'admin' ? 'badge-gold' : 'badge-accent'}`}>{s.role?.toUpperCase()}</span>
            <button className="btn btn-danger btn-sm" onClick={() => removeRole(s.id)}><Ban size={11} /></button>
          </div>
        </div>
      )) : !loading && <Empty icon={UserCog} title="No staff loaded" hint="Click the button above to load from Firebase" />}
    </div>
  );
});

export default StaffTab;
