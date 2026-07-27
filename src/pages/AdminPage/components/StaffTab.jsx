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
    if (!db) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['admin', 'staff'])));
      if (mounted.current) {
        setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.role === 'admin' ? 0 : 1) - (b.role === 'admin' ? 0 : 1)));
      }
    } catch (e) { toast('Load failed: ' + e.message, 'er'); }
    setLoading(false);
  }, [db, mounted, toast]);

  const addStaff = useCallback(async () => {
    if (!db || !email.trim()) return;
    setAdding(true);
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email.trim().toLowerCase())));
      if (snap.empty) { toast('User not found', 'er'); setAdding(false); return; }
      const uid = snap.docs[0].id;
      await setDoc(doc(db, 'users', uid), { role: 'staff', updatedAt: serverTimestamp() }, { merge: true });
      toast(`Added ${email} as staff`, 'ok');
      setEmail('');
      loadStaff();
    } catch (e) { toast('Add failed: ' + e.message, 'er'); }
    setAdding(false);
  }, [db, email, toast, loadStaff]);

  const removeRole = useCallback(async (uid) => {
    if (!db) return;
    try {
      await setDoc(doc(db, 'users', uid), { role: 'user', updatedAt: serverTimestamp() }, { merge: true });
      toast('Role removed', 'ok');
      setStaff(prev => prev.filter(s => s.id !== uid));
    } catch (e) { toast('Remove failed: ' + e.message, 'er'); }
  }, [db, toast]);

  return (
    <div className="ae">
      <div className="asec">
        <h3 className="ast"><UserCog size={15} /> Staff Members</h3>
        <div className="ausr-input">
          <input className="aip" placeholder="Enter email to add as staff..." value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && addStaff()} />
          <button className="ab ab-p ab-sm" onClick={addStaff} disabled={adding || !email.trim()}>
            {adding ? <Loader2 size={11} className="asp" /> : <Plus size={11} />} Add
          </button>
        </div>
        <button className="ab ab-gh ab-sm" onClick={loadStaff} disabled={loading} style={{ marginBottom: 12 }}>
          {loading ? <Loader2 size={11} className="asp" /> : <Users size={11} />} {staff.length > 0 ? 'Refresh' : 'Load Staff from Firebase'}
        </button>
        {staff.length > 0 ? staff.map(s => (
          <div key={s.id} className="aur">
            <div style={{ width: 38, height: 38, borderRadius: 10, background: s.role === 'admin' ? 'rgba(245,197,66,.12)' : 'rgba(96,165,250,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.role === 'admin' ? 'var(--gold)' : 'var(--blue)', fontWeight: 900, fontSize: '.85rem', flexShrink: 0 }}>
              {(s.displayName || s.email || '??').slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>{s.displayName || 'Unknown'}</div>
              <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>{s.email}</div>
            </div>
            <span className={`abdg ${s.role === 'admin' ? 'gd' : 'bl'}`}>{s.role?.toUpperCase()}</span>
            <button className="ab ab-sm ab-dg" onClick={() => removeRole(s.id)}><Ban size={11} /></button>
          </div>
        )) : !loading && <Empty icon={UserCog} title="No staff loaded" hint="Click the button above to load from Firebase" />}
      </div>
    </div>
  );
});

export default StaffTab;