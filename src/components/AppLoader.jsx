import React from 'react';
export default function AppLoader() {
  return (
    <div className="zoka-loader-container">
      <div className="zoka-loader-content">
        <div className="glass-card flex-center" style={{ width: 80, height: 80, borderRadius: 'var(--r-20)', margin: '0 auto 24px' }}>
          <img src="/icons/icon-192.png" alt="ZOKA" width="56" height="56" style={{ borderRadius: 'var(--r-12)' }} />
        </div>
        <div className="zoka-loader-progress-outer">
          <div className="zoka-loader-progress-inner" style={{ width: '60%' }} />
        </div>
        <div className="text-muted text-xs" style={{ marginTop: 16, letterSpacing: '.1em', textTransform: 'uppercase' }}>Loading ZOKASCORE</div>
      </div>
    </div>
  );
}
