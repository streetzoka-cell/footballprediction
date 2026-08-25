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

  handleNetworkChange = () => this.setState({ isOffline: !navigator.onLine });

  componentDidCatch(error, info) {
    const errorId = crypto.randomUUID();
    this.setState({ errorId });
    useObservabilityStore.getState().logError({
      id: errorId,
      message: error.message,
      stack: error.stack,
      type: "react_boundary",
      info: info.componentStack,
      timestamp: Date.now(),
      context: { page: window.location.pathname, browser: navigator.userAgent, online: navigator.onLine }
    });
  }

  handleRetry = () => {
    this.setState({ isRetrying: true });
    setTimeout(() => {
      this.setState({ hasError: false, errorId: null, errorDetails: null, isRetrying: false });
    }, 1500);
  };

  handleCopyError = () => {
    const { errorId, errorDetails } = this.state;
    navigator.clipboard.writeText(`Error ID: ${errorId}\nMessage: ${errorDetails?.message}\nStack: ${errorDetails?.stack}`);
    alert("Error details copied to clipboard!");
  };

  render() {
    if (this.state.hasError) {
      const isOffline = this.state.isOffline;
      return (
        <div className="zk-error-overlay">
          <div className="zk-error-card">
            <div className="zk-error-icon">{isOffline ? '📡' : '⚽'}</div>
            <h1 className="zk-error-title">{isOffline ? 'NO INTERNET CONNECTION' : 'MATCH INTERRUPTED'}</h1>
            <p className="zk-error-message">
              {isOffline ? 'Reconnect and we\'ll restore live matches automatically.' : 'Temporary interruption. Live data is safe.'}
            </p>

            {this.state.isRetrying ? (
              <div className="zk-error-details">
                <div>Rebuilding match engine...</div>
                <div className="zk-app-loader-skeleton mt-8" style={{ width: '100%' }}></div>
              </div>
            ) : (
              <>
                <div className="flex-center flex-wrap gap-16 p-16 mb-16" style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--r-12)' }}>
                  <div className="flex-center gap-8 text-sm"><span className="zk-live-pulse-dot" style={{ background: 'var(--accent)' }}></span> Football API</div>
                  <div className="flex-center gap-8 text-sm"><span className="zk-live-pulse-dot" style={{ background: 'var(--accent)' }}></span> Database</div>
                  <div className="flex-center gap-8 text-sm"><span className="zk-live-pulse-dot" style={{ background: isOffline ? 'var(--danger)' : 'var(--gold)' }}></span> Live Polling</div>
                </div>

                <div className="zk-error-actions">
                  {!isOffline && (
                    <button className="zk-error-btn zk-error-btn-primary" onClick={() => this.handleRetry(false)}>
                      Retry Component
                    </button>
                  )}
                  <button className="zk-error-btn zk-error-btn-ghost" onClick={() => window.location.reload()}>
                    Reload App
                  </button>
                  <button className="zk-error-btn zk-error-btn-ghost" onClick={() => window.location.href = '/'}>
                    Go Home
                  </button>
                </div>

                {this.state.errorId && (
                  <div className="flex-between mt-16 pt-16" style={{ borderTop: '1px solid var(--border)' }}>
                    <span className="text-muted text-xs">Error ID: <strong>{this.state.errorId.split('-')[0]}</strong></span>
                    <button className="zk-error-btn zk-error-btn-ghost" onClick={this.handleCopyError} style={{ padding: '4px 10px', fontSize: '12px' }}>
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