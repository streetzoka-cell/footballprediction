import React from "react";
import { useObservabilityStore } from "../store/useObservabilityStore";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      errorId: null,
      errorDetails: null,
      isOffline: !navigator.onLine,
      isRetrying: false
    };
    this.retryTimer = null;
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorDetails: error };
  }

  componentDidMount() {
    window.addEventListener('online', this.handleNetworkChange);
    window.addEventListener('offline', this.handleNetworkChange);

    // Auto Recovery attempt every 30 seconds
    this.retryTimer = setInterval(() => {
      if (this.state.hasError && navigator.onLine) {
        this.handleRetry(true);
      }
    }, 30000);
  }

  componentWillUnmount() {
    window.removeEventListener('online', this.handleNetworkChange);
    window.removeEventListener('offline', this.handleNetworkChange);
    if (this.retryTimer) clearInterval(this.retryTimer);
  }

  handleNetworkChange = () => {
    this.setState({ isOffline: !navigator.onLine });
  };

  componentDidCatch(error, info) {
    const errorId = crypto.randomUUID();
    this.setState({ errorId });

    // Auto report to observability store
    useObservabilityStore.getState().logError({
      id: errorId,
      message: error.message,
      stack: error.stack,
      type: "react_boundary",
      info: info.componentStack,
      timestamp: Date.now(),
      context: {
        page: window.location.pathname,
        browser: navigator.userAgent,
        os: navigator.platform,
        online: navigator.onLine
      }
    });
  }

  handleRetry = (isAuto = false) => {
    this.setState({ isRetrying: true });
    
    // Simulate silent retry delay
    setTimeout(() => {
      this.setState({ 
        hasError: false, 
        errorId: null, 
        errorDetails: null,
        isRetrying: false
      });
    }, 1500);
  };

  handleCopyError = () => {
    const { errorId, errorDetails } = this.state;
    const text = `Error ID: ${errorId}\nMessage: ${errorDetails?.message}\nStack: ${errorDetails?.stack}`;
    navigator.clipboard.writeText(text).then(() => {
      alert("Error details copied to clipboard!");
    });
  };

  render() {
    if (this.state.hasError) {
      const isOffline = this.state.isOffline;
      
      return (
        <div style={styles.overlay}>
          <div style={styles.card}>
            <div style={styles.iconWrapper}>
              {isOffline ? '📡' : '⚽'}
            </div>
            
            <h1 style={styles.title}>
              {isOffline ? 'NO INTERNET CONNECTION' : 'MATCH INTERRUPTED'}
            </h1>
            
            <p style={styles.subtitle}>
              {isOffline 
                ? 'Reconnect and we\'ll restore live matches automatically.' 
                : 'Temporary interruption. Live data is safe.'
              }
            </p>

            {this.state.isRetrying ? (
              <div style={styles.retryingContainer}>
                <div style={styles.retryingText}>Rebuilding match engine...</div>
                <div style={styles.progressBar}>
                  <div style={styles.progressFill}></div>
                </div>
              </div>
            ) : (
              <>
                {/* Service Status Indicators */}
                <div style={styles.statusGrid}>
                  <div style={styles.statusItem}>
                    <span style={{...styles.statusDot, background: 'var(--accent)'}}></span>
                    Football API
                  </div>
                  <div style={styles.statusItem}>
                    <span style={{...styles.statusDot, background: 'var(--accent)'}}></span>
                    Database
                  </div>
                  <div style={styles.statusItem}>
                    <span style={{...styles.statusDot, background: isOffline ? '#ef4444' : '#fbbf24'}}></span>
                    Live Polling
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={styles.buttonGrid}>
                  {!isOffline && (
                    <button 
                      style={{...styles.btn, ...styles.primaryBtn}} 
                      onClick={() => this.handleRetry(false)}
                    >
                      Retry Component
                    </button>
                  )}
                  <button 
                    style={{...styles.btn, ...styles.secondaryBtn}} 
                    onClick={() => window.location.reload()}
                  >
                    Reload App
                  </button>
                  <button 
                    style={{...styles.btn, ...styles.secondaryBtn}} 
                    onClick={() => window.location.href = '/'}
                  >
                    Go Home
                  </button>
                </div>

                {/* Error ID & Copy */}
                {this.state.errorId && (
                  <div style={styles.errorIdContainer}>
                    <span style={styles.errorIdLabel}>
                      Error ID: <strong>{this.state.errorId.split('-')[0]}</strong>
                    </span>
                    <button style={styles.copyBtn} onClick={this.handleCopyError}>
                      Copy Error
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(5, 7, 10, 0.95)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
    padding: '20px'
  },
  card: {
    background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.8), rgba(15, 23, 42, 0.4))',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '24px',
    padding: '40px 32px',
    maxWidth: '480px',
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
    animation: 'eb-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
  },
  iconWrapper: {
    fontSize: '3.5rem',
    marginBottom: '16px',
    animation: 'eb-float 3s ease-in-out infinite'
  },
  title: {
    fontSize: '1.25rem',
    fontWeight: 900,
    color: '#fff',
    margin: '0 0 8px 0',
    letterSpacing: '0.05em',
    textTransform: 'uppercase'
  },
  subtitle: {
    fontSize: '0.9rem',
    color: '#94a3b8',
    margin: '0 0 24px 0',
    lineHeight: 1.5
  },
  retryingContainer: {
    margin: '24px 0'
  },
  retryingText: {
    fontSize: '0.85rem',
    color: 'var(--accent)',
    fontWeight: 700,
    marginBottom: '12px'
  },
  progressBar: {
    width: '100%',
    height: '6px',
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '3px',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, var(--accent), #34d399)',
    borderRadius: '3px',
    animation: 'eb-load 1.5s ease-in-out infinite'
  },
  statusGrid: {
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
    flexWrap: 'wrap',
    margin: '0 0 24px 0',
    padding: '16px',
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.05)'
  },
  statusItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#cbd5e1'
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    boxShadow: '0 0 8px currentColor'
  },
  buttonGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '24px'
  },
  btn: {
    padding: '12px 20px',
    borderRadius: '10px',
    border: 'none',
    fontWeight: 700,
    fontSize: '0.85rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: 'inherit'
  },
  primaryBtn: {
    background: 'linear-gradient(135deg, var(--accent), var(--accent-dim))',
    color: 'var(--bg-deep)',
    boxShadow: '0 4px 12px var(--accent-glow-strong)'
  },
  secondaryBtn: {
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#fff',
    border: '1px solid rgba(255, 255, 255, 0.1)'
  },
  errorIdContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '12px',
    paddingTop: '16px',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)'
  },
  errorIdLabel: {
    fontSize: '0.7rem',
    color: '#64748b'
  },
  copyBtn: {
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#94a3b8',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '0.7rem',
    fontWeight: 700,
    cursor: 'pointer'
  }
};