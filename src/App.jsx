// 📄 src/App.jsx

import {
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

import {
  useEffect,
  useState,
  lazy,
  Suspense,
} from "react";

import { AuthProvider, useAuth } from "./context/AuthContext";

import { initApp } from "./utils/api";

import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import AppLoader from "./components/AppLoader";

import { EASE_OUT, NORMAL } from "./styles/common";

// Lazy Loading
const Home = lazy(() => import("./pages/Home"));
const Predictions = lazy(() => import("./pages/Predictions"));
const Fixtures = lazy(() => import("./pages/Fixtures"));
const Basketball = lazy(() => import("./pages/Basketball"));
const Highlights = lazy(() => import("./pages/Highlights"));
const LiveStream = lazy(() => import("./pages/LiveStream"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const Login = lazy(() => import("./pages/Login"));
const Profile = lazy(() => import("./pages/Profile"));
const Admin = lazy(() => import("./pages/Admin"));

/* ═══════════════════════════════════════════════════════════════
   PROTECTED ROUTE — requires login, redirects to /login
   ═══════════════════════════════════════════════════════════════ */
function ProtectedRoute({ children }) {
  const { currentUser, authLoading } = useAuth();
  const location = useLocation();

  if (authLoading) return <AppLoader />;
  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

/* ═══════════════════════════════════════════════════════════════
   GUEST ROUTE — redirects away if already logged in
   ═══════════════════════════════════════════════════════════════ */
function GuestRoute({ children }) {
  const { currentUser, authLoading } = useAuth();

  if (authLoading) return <AppLoader />;
  if (currentUser) {
    return <Navigate to="/profile" replace />;
  }

  return children;
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN ROUTE — requires login + admin role
   (Admin.jsx also has its own guard, this is a first-pass gate)
   ═══════════════════════════════════════════════════════════════ */
function AdminRoute({ children }) {
  const { currentUser, userProfile, authLoading } = useAuth();
  const location = useLocation();

  if (authLoading) return <AppLoader />;
  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (userProfile?.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children;
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: "instant",
    });
  }, [pathname]);

  return null;
}

function PageTransition({ children }) {
  const { pathname } = useLocation();

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);

    const timer = setTimeout(() => {
      setVisible(true);
    }, 30);

    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(18px)",
        transition: `
          opacity ${NORMAL} ${EASE_OUT},
          transform ${NORMAL} ${EASE_OUT}
        `,
        willChange: "opacity, transform",
        minHeight: "80vh",
      }}
    >
      {children}
    </div>
  );
}

export default function App() {
  useEffect(() => {
  initApp();
}, []);

  return (
    <AuthProvider>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
          background: "#07141f",
        }}
      >
        <Navbar />

        <main style={{ flex: 1 }}>
          <ScrollToTop />

          <Suspense fallback={<AppLoader />}>
            <Routes>
              {/* Public Routes */}
              <Route
                path="/"
                element={
                  <PageTransition>
                    <Home />
                  </PageTransition>
                }
              />

              <Route
                path="/predictions"
                element={
                  <PageTransition>
                    <Predictions />
                  </PageTransition>
                }
              />

              <Route
                path="/fixtures"
                element={
                  <PageTransition>
                    <Fixtures />
                  </PageTransition>
                }
              />

              <Route
                path="/basketball"
                element={
                  <PageTransition>
                    <Basketball />
                  </PageTransition>
                }
              />

              <Route
                path="/highlights"
                element={
                  <PageTransition>
                    <Highlights />
                  </PageTransition>
                }
              />

              <Route
                path="/livestream"
                element={
                  <PageTransition>
                    <LiveStream />
                  </PageTransition>
                }
              />

              <Route
                path="/leaderboard"
                element={
                  <PageTransition>
                    <Leaderboard />
                  </PageTransition>
                }
              />

              {/* Guest-Only Route — redirects to /profile if logged in */}
              <Route
                path="/login"
                element={
                  <GuestRoute>
                    <PageTransition>
                      <Login />
                    </PageTransition>
                  </GuestRoute>
                }
              />

              {/* Protected Route — requires login */}
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <PageTransition>
                      <Profile />
                    </PageTransition>
                  </ProtectedRoute>
                }
              />

              {/* Admin Route — requires login + admin role */}
              <Route
                path="/zks-admin-8f9x2-control-panel"
                element={
                  <AdminRoute>
                    <PageTransition>
                      <Admin />
                    </PageTransition>
                  </AdminRoute>
                }
              />

              {/* Redirect unknown URLs to Home */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>

        <Footer />
      </div>
    </AuthProvider>
  );
}