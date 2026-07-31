import React from 'react';
import { WifiOff, RefreshCw, Database, CloudOff } from 'lucide-react';

export default function OfflineFallback({ onRetry, hasCachedData = false, lastUpdated = null }) {
  
  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'recently';
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} minute${mins > 1 ? 's' : ''} ago`;
    const hours = Math.floor(mins / 60);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.iconWrapper}>
          <div style={styles.radarPulse}></div>
          <div style={styles.radarPulseDelay}></div>
          {hasCachedData ? <Database size={36} color="var(--accent)" /> : <CloudOff size={36} color="#ef4444" />}
        </div>
        
        <h1 style={styles.title}>
          {hasCachedData ? 'Offline Mode Active' : 'No Internet Connection'}
        </h1>
        
        <p style={styles.subtitle}>
          {hasCachedData 
            ? `You're offline. Showing scores from ${formatTimeAgo(lastUpdated)}. Reconnect to refresh live data.`
            : 'ZOKASCORE needs an internet connection to load this page for the first time. Please check your network and try again.'
          }
        </p>

        <div style={styles.statusBadge}>
          {hasCachedData ? (
            <>
              <span style={{...styles.statusDot, background: 'var(--accent)'}}></span>
              Cached Data Available
            </>
          ) : (
            <>
              <span style={{...styles.statusDot, background: '#ef4444'}}></span>
              Awaiting Connection
            </>
          )}
        </div>

        <button 
          onClick={onRetry || (() => window.location.reload())}
          style={styles.btn}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <RefreshCw size={16} /> Retry Connection
        </button>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(circle at 50% 50%, #0d1a25 0%, var(--bg-deep) 80%)',
    padding: '20px',
    textAlign: 'center',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  card: {
    background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.8), rgba(15, 23, 42, 0.4))',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '24px',
    padding: '40px 32px',
    maxWidth: '440px',
    width: '100%',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    animation: 'of-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  iconWrapper: {
    position: 'relative',
    width: 80,
    height: 80,
    borderRadius: '22px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '24px',
    overflow: 'hidden',
  },
  radarPulse: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    background: 'rgba(239, 68, 68, 0.1)',
    animation: 'of-pulse 2s ease-out infinite',
  },
  radarPulseDelay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    background: 'rgba(239, 68, 68, 0.1)',
    animation: 'of-pulse 2s ease-out infinite 1s',
  },
  title: {
    margin: 0,
    fontSize: '1.4rem',
    fontWeight: 800,
    color: '#f8fafc',
    marginBottom: '12px',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.9rem',
    color: '#94a3b8',
    maxWidth: '360px',
    lineHeight: 1.5,
    marginBottom: '24px',
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '20px',
    fontSize: '0.75rem',
    fontWeight: 700,
    color: '#cbd5e1',
    marginBottom: '24px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    boxShadow: '0 0 8px currentColor',
  },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '14px 28px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, var(--accent), var(--accent-dim))',
    color: 'var(--bg-deep)',
    fontWeight: 800,
    fontSize: '0.9rem',
    border: 'none',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
    boxShadow: '0 4px 15px var(--accent-glow-strong)',
  },
};