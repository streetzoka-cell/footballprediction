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
      className={`glass-card flex-center my-20 ${className}`} 
      style={{ 
        ...sizes[format],
        border: '1px dashed var(--border)', 
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {visible ? (
        <div className="flex-col items-center text-muted gap-8">
          <Megaphone size={20} className="opacity-50" />
          <div className="text-xs font-bold uppercase" style={{ letterSpacing: '0.05em' }}>
            Ad Space ({format})
          </div>
        </div>
      ) : (
        <div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: 0 }} />
      )}
    </div>
  );
}