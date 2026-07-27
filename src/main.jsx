import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import App from "./App";
import "./styles/global.css";
import "nprogress/nprogress.css";

// ★ TEMPORARILY DISABLED SENTRY UNTIL YOU GET A REAL DSN
// import * as Sentry from "@sentry/react";
// Sentry.init({
//   dsn: "https://your-sentry-dsn-here@o123456.ingest.sentry.io/1234567",
//   integrations: [Sentry.browserTracingIntegration()],
//   tracesSampleRate: 1.0,
// });

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
);