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
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            color: "#fff",
            background: "#07141f",
            padding: 30,
            textAlign: "center",
          }}
        >
          <div>
            <p style={{ fontSize: "3rem" }}>⚠️</p>
            <h1
              style={{
                fontSize: "1.5rem",
                marginBottom: 12,
              }}
            >
              Something went wrong
            </h1>
            <p
              style={{
                color: "#b8c4d6",
                marginBottom: 24,
              }}
            >
              An unexpected error occurred while
              loading ZOKASCORE.
            </p>
            <button
              onClick={() =>
                window.location.reload()
              }
              style={{
                padding: "12px 28px",
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                background: "#00ff88",
                color: "#07141f",
                fontWeight: 700,
                fontSize: "1rem",
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}