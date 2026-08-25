import React from 'react';

export default function EmptyState({ icon: Icon, title, hint, action }) {
  return (
    <div className="zk-empty-state glass-card">
      {Icon && (
        <div className="zk-empty-state-icon">
          <Icon size={28} />
        </div>
      )}
      <h3 className="zk-empty-state-title">{title}</h3>
      {hint && <p className="zk-empty-state-desc">{hint}</p>}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}