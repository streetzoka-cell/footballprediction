import React, { useState, useEffect } from 'react';
import { Megaphone } from 'lucide-react';

export default function AdSlot({ format = 'rectangle', className = '' }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(timer);
  }, []);

  const sizes = {
    rectangle: { minHeight: '250px' },
    leaderboard: { minHeight: '90px' },
    skycraper: { minHeight: '600px' },
  };

  return (
    <div 
      className={`zoka-ad-slot ${className}`} 
      style={{ 
        ...sizes[format],
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        background: 'rgba(255,255,255,0.02)', 
        border: '1px dashed rgba(255,255,255,0.08)', 
        borderRadius: '12px', 
        margin: '20px 0',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {visible ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <Megaphone size={20} style={{ marginBottom: '8px', opacity: 0.5 }} />
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Ad Space ({format})
          </div>
        </div>
      ) : (
        <div className="zoka-skel" style={{ width: '100%', height: '100%' }} />
      )}
    </div>
  );
}