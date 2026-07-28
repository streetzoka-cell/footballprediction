// src/components/EmptyState.jsx
import React from 'react';

export default function EmptyState({ icon: Icon, title, hint, action }) {
  return (
    <div className="zoka-empty" style={{ textAlign: 'center', padding: '40px 20px' }}>
      {Icon && (
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--bg-surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, color: 'var(--text-muted)' }}>
          <Icon size={28} />
        </div>
      )}
      <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
      {hint && <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: '.84rem' }}>{hint}</p>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}