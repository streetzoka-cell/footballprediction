import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

import { registerSW } from "virtual:pwa-register";

import App from "./App";

import "./styles/global.css";
import "nprogress/nprogress.css";


// Register PWA service worker
registerSW({
  onNeedRefresh() {
    console.log("New ZOKASCORE update available");
  },

  onOfflineReady() {
    console.log("ZOKASCORE is ready for offline use");
  },
});


ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
);