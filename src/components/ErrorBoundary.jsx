import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div>
            <p className="error-boundary-icon">⚠️</p>
            <h1 className="error-boundary-title">Something went wrong</h1>
            <p className="error-boundary-text">
              An unexpected error occurred while loading ZOKASCORE.
            </p>
            <button className="error-boundary-btn" onClick={() => window.location.reload()}>
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}