import React from 'react';

export default function AppLoader() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at 50% 50%, #0d1a25 0%, var(--bg-deep) 80%)',
      gap: '28px',
      overflow: 'hidden',
      position: 'relative',
      zIndex: 9999
    }}>
      <style>{`
        @keyframes proLogoFloat {
          0%, 100% { transform: translateY(0px) scale(1); box-shadow: 0 0 30px rgba(16,185,129,0.2); }
          50% { transform: translateY(-8px) scale(1.02); box-shadow: 0 10px 40px rgba(16,185,129,0.4); }
        }
        @keyframes proSpinner {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes proTextGlow {
          0%, 100% { text-shadow: 0 0 8px rgba(16,185,129,0.4); opacity: 0.8; }
          50% { text-shadow: 0 0 16px rgba(16,185,129,0.9); opacity: 1; }
        }
      `}</style>
      
      <div style={{
        width: 80,
        height: 80,
        borderRadius: 22,
        background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(5,150,105,0.05) 100%)',
        border: '1px solid rgba(16,185,129,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'proLogoFloat 2.5s ease-in-out infinite',
        backdropFilter: 'blur(4px)'
      }}>
        <img src="/icons/icon-192.png" alt="ZOKA Logo" width="56" height="56" style={{ borderRadius: 14 }} />
      </div>

      <div style={{
        width: 32,
        height: 32,
        border: '3px solid rgba(255,255,255,0.05)',
        borderTopColor: 'var(--accent)',
        borderRadius: '50%',
        animation: 'proSpinner 0.8s linear infinite'
      }} />

      <div style={{
        color: 'var(--accent)',
        fontSize: '0.75rem',
        fontWeight: 800,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        animation: 'proTextGlow 2s ease-in-out infinite',
        fontFamily: 'system-ui, sans-serif'
      }}>
        Initializing ZOKASCORE
      </div>
    </div>
  );
}