import React from 'react';

export default function AppLoader() {
  return (
    <div className="flex-col items-center justify-center" style={{ minHeight: '100vh', background: 'var(--bg-deep)', gap: 'var(--sp-24)' }}>
      <div className="glass-card flex-center" style={{ width: 80, height: 80, borderRadius: 'var(--r-20)', animation: 'zk-bounce 2s ease-in-out infinite' }}>
        <img src="/icons/icon-192.png" alt="ZOKA Logo" width="56" height="56" style={{ borderRadius: 'var(--r-16)' }} />
      </div>
      <div className="skeleton" style={{ width: 32, height: 32, borderRadius: '50%' }} />
      <div className="text-primary font-extrabold" style={{ fontSize: 'var(--fs-sm)', letterSpacing: '0.2em', textTransform: 'uppercase', animation: 'zk-pulse 2s ease-in-out infinite' }}>
        Initializing ZOKASCORE
      </div>
    </div>
  );
}