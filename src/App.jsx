import {
  useEffect,
  useState,
  lazy,
  Suspense,
} from "react";

import {
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { AppDataProvider } from "./context/AppDataContext.jsx";
import { FootballDataProvider } from "./context/FootballDataContext.jsx";
import { initApp } from "./utils/api";

import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import AppLoader from "./components/AppLoader";

import { EASE_OUT, NORMAL } from "./styles/common";

/* ═══════════════════════════════════════════════════════════════
   LAZY LOADED PAGES
═══════════════════════════════════════════════════════════════ */

const Home = lazy(() => import("./pages/Home"));
const Predictions = lazy(() => import("./pages/Predictions"));
const Fixtures = lazy(() => import("./pages/Fixtures"));
const MasterGames = lazy(() => import("./pages/MasterGames"));
const Basketball = lazy(() => import("./pages/Basketball"));
const Highlights = lazy(() => import("./pages/Highlights"));
const LiveStream = lazy(() => import("./pages/LiveStream"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const Login = lazy(() => import("./pages/Login"));
const Profile = lazy(() => import("./pages/Profile"));
const Admin = lazy(() => import("./pages/Admin"));

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════ */

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
        transform: visible
          ? "translateY(0)"
          : "translateY(18px)",

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

function AnimatedRoute({ children }) {
  return <PageTransition>{children}</PageTransition>;
}

/* ═══════════════════════════════════════════════════════════════
   ROUTE GUARDS
═══════════════════════════════════════════════════════════════ */

function ProtectedRoute({ children }) {
  const { currentUser, authLoading } = useAuth();
  const location = useLocation();

  if (authLoading) {
    return <AppLoader />;
  }

  if (!currentUser) {
    return (
      <Navigate
        to="/login"
        state={{ from: location }}
        replace
      />
    );
  }

  return children;
}

function GuestRoute({ children }) {
  const { currentUser, authLoading } = useAuth();

  if (authLoading) {
    return <AppLoader />;
  }

  if (currentUser) {
    return <Navigate to="/profile" replace />;
  }

  return children;
}

function AdminRoute({ children }) {
  const {
    currentUser,
    userProfile,
    authLoading,
  } = useAuth();

  const location = useLocation();

  if (authLoading) {
    return <AppLoader />;
  }

  if (!currentUser) {
    return (
      <Navigate
        to="/login"
        state={{ from: location }}
        replace
      />
    );
  }

  if (userProfile?.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children;
}

/* ═══════════════════════════════════════════════════════════════
   INNER APP CONTENT
═══════════════════════════════════════════════════════════════
   This is inside AuthProvider so we can access currentUser
   for the AppDataProvider, which needs userId for user-specific data.
═══════════════════════════════════════════════════════════════ */

function AppContent() {
  const { currentUser } = useAuth();

  useEffect(() => {
    initApp();
  }, []);

  return (
    <AppDataProvider
      userId={currentUser?.uid || null}
      displayName={
        currentUser?.displayName ||
        currentUser?.email?.split("@")[0] ||
        null
      }
    >
      <FootballDataProvider>
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

          <main
            style={{
              flex: 1,
              position: "relative",
            }}
          >
            <ScrollToTop />

            <Suspense fallback={<AppLoader />}>
              <Routes>

                {/* Public */}

                <Route
                  path="/"
                  element={
                    <AnimatedRoute>
                      <Home />
                    </AnimatedRoute>
                  }
                />

                <Route
                  path="/predictions"
                  element={
                    <AnimatedRoute>
                      <Predictions />
                    </AnimatedRoute>
                  }
                />

                <Route
                  path="/fixtures"
                  element={
                    <AnimatedRoute>
                      <Fixtures />
                    </AnimatedRoute>
                  }
                />

                <Route
                  path="/mastergames"
                  element={
                    <AnimatedRoute>
                      <MasterGames />
                    </AnimatedRoute>
                  }
                />

                <Route
                  path="/basketball"
                  element={
                    <AnimatedRoute>
                      <Basketball />
                    </AnimatedRoute>
                  }
                />

                <Route
                  path="/highlights"
                  element={
                    <AnimatedRoute>
                      <Highlights />
                    </AnimatedRoute>
                  }
                />

                <Route
                  path="/livestream"
                  element={
                    <AnimatedRoute>
                      <LiveStream />
                    </AnimatedRoute>
                  }
                />

                <Route
                  path="/leaderboard"
                  element={
                    <AnimatedRoute>
                      <Leaderboard />
                    </AnimatedRoute>
                  }
                />

                {/* Guest */}

                <Route
                  path="/login"
                  element={
                    <GuestRoute>
                      <AnimatedRoute>
                        <Login />
                      </AnimatedRoute>
                    </GuestRoute>
                  }
                />

                {/* Protected */}

                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <AnimatedRoute>
                        <Profile />
                      </AnimatedRoute>
                    </ProtectedRoute>
                  }
                />

                {/* Admin */}

                <Route
                  path="/zks-admin-8f9x2-control-panel"
                  element={
                    <AdminRoute>
                      <AnimatedRoute>
                        <Admin />
                      </AnimatedRoute>
                    </AdminRoute>
                  }
                />

                {/* 404 */}

                <Route
                  path="*"
                  element={<Navigate to="/" replace />}
                />

              </Routes>
            </Suspense>
          </main>

          <Footer />
        </div>
      </FootballDataProvider>
    </AppDataProvider>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════════════════════════ */

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}