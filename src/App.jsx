// src/App.jsx

import { Suspense, useEffect } from "react";

import Providers from "./app/providers";
import AppRoutes from "./app/AppRoutes";

import ScrollToTop from "./app/ScrollToTop";
import Breadcrumbs from "./components/Breadcrumbs";

import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

import SEO from "./components/SEO";
import StructuredData from "./components/StructuredData";
import AppLoader from "./components/AppLoader";
import ErrorBoundary from "./components/ErrorBoundary";

import {
  organizationSchema,
  websiteSchema,
} from "./utils/schema";

import { initApp } from "./utils/api";

function AppShell() {
  useEffect(() => {
    initApp();
  }, []);

  return (
    <>
      {/* Global SEO */}
      <SEO />

      {/* Global Structured Data */}
      <StructuredData data={organizationSchema()} />
      <StructuredData data={websiteSchema()} />

      <ScrollToTop />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
          background:
            "linear-gradient(180deg,#07141f 0%,#06121b 100%)",
        }}
      >
        <Navbar />

        <Breadcrumbs />

        <main
          style={{
            flex: 1,
            position: "relative",
          }}
        >
          <Suspense fallback={<AppLoader />}>
            <AppRoutes />
          </Suspense>
        </main>

        <Footer />
      </div>
    </>
  );
}

export default function App() {
  return (
    <Providers>
      <ErrorBoundary>
        <AppShell />
      </ErrorBoundary>
    </Providers>
  );
}