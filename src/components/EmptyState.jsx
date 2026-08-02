// footballprediction/src/components/EmptyState.jsx

import React from 'react';

export default function EmptyState({ icon: Icon, title, hint, action }) {
  return (
    <div className="glass-card flex-col items-center text-center p-32 gap-12">
      {Icon && (
        <div className="flex-center" style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
          <Icon size={28} />
        </div>
      )}
      <h3 className="text-primary font-bold text-md">{title}</h3>
      {hint && <p className="text-muted text-sm">{hint}</p>}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}
