import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      hasError: false,
    };
  }

  static getDerivedStateFromError() {
    return {
      hasError: true,
    };
  }

  componentDidCatch(error, info) {
    console.error(error);
    console.error(info);
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
            <h1>Something went wrong.</h1>

            <p>
              An unexpected error occurred while loading
              ZOKASCORE.
            </p>

            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: 20,
                padding: "12px 20px",
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
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