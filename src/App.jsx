import {
  useEffect,
  useState,
  lazy,
  Suspense,
  createContext,
  useContext,
} from "react";

import {
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

import { AuthProvider, useAuth } from "./context/AuthContext";
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
const Basketball = lazy(() => import("./pages/Basketball"));
const Highlights = lazy(() => import("./pages/Highlights"));
const LiveStream = lazy(() => import("./pages/LiveStream"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const Login = lazy(() => import("./pages/Login"));
const Profile = lazy(() => import("./pages/Profile"));
const Admin = lazy(() => import("./pages/Admin"));

/* ═══════════════════════════════════════════════════════════════
   SPORT CONTEXT — Toggle between Football & Basketball
   ═══════════════════════════════════════════════════════════════ */
export const SportContext = createContext();

export const useSport = () => {
  const context = useContext(SportContext);
  if (!context) throw new Error("useSport must be used within a SportProvider");
  return context;
};

/* ═══════════════════════════════════════════════════════════════
   UTILITY HOOKS & COMPONENTS
   ═══════════════════════════════════════════════════════════════ */
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}

function PageTransition({ children }) {
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    const timer = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(18px)",
        transition: `opacity ${NORMAL} ${EASE_OUT}, transform ${NORMAL} ${EASE_OUT}`,
        willChange: "opacity, transform",
        minHeight: "80vh",
      }}
    >
      {children}
    </div>
  );
}

// DRY wrapper to avoid repeating <PageTransition> on every single route
function AnimatedRoute({ children }) {
  return <PageTransition>{children}</PageTransition>;
}

/* ═══════════════════════════════════════════════════════════════
   SPORT TOGGLER UI COMPONENT
   ═══════════════════════════════════════════════════════════════ */
function SportToggler() {
  const { sport, setSport } = useSport();

  const toggles = [
    { id: "football", icon: "⚽", label: "Football" },
    { id: "basketball", icon: "🏀", label: "Basketball" },
  ];

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        padding: "12px 16px 0",
        position: "sticky",
        top: 60, // Adjust based on your Navbar height
        zIndex: 50,
        background: "linear-gradient(to bottom, #07141f 80%, transparent)",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          background: "rgba(255, 255, 255, 0.04)",
          borderRadius: "14px",
          padding: "4px",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          pointerEvents: "all",
          backdropFilter: "blur(16px)",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
        }}
      >
        {toggles.map((s) => {
          const isActive = sport === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSport(s.id)}
              style={{
                padding: "10px 28px",
                borderRadius: "11px",
                border: "none",
                background: isActive ? "var(--accent, #00e676)" : "transparent",
                color: isActive ? "#07141f" : "rgba(255, 255, 255, 0.5)",
                fontWeight: 800,
                fontSize: ".88rem",
                cursor: "pointer",
                transition: "all 0.25s cubic-bezier(.22,1,.36,1)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                boxShadow: isActive ? "0 4px 14px rgba(0, 230, 118, 0.35)" : "none",
                transform: isActive ? "scale(1.02)" : "scale(1)",
              }}
            >
              <span style={{ fontSize: "1.1rem" }}>{s.icon}</span>
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ROUTE GUARDS
   ═══════════════════════════════════════════════════════════════ */
function ProtectedRoute({ children }) {
  const { currentUser, authLoading } = useAuth();
  const location = useLocation();

  if (authLoading) return <AppLoader />;
  if (!currentUser) return <Navigate to="/login" state={{ from: location }} replace />;

  return children;
}

function GuestRoute({ children }) {
  const { currentUser, authLoading } = useAuth();

  if (authLoading) return <AppLoader />;
  if (currentUser) return <Navigate to="/profile" replace />;

  return children;
}

function AdminRoute({ children }) {
  const { currentUser, userProfile, authLoading } = useAuth();
  const location = useLocation();

  if (authLoading) return <AppLoader />;
  if (!currentUser) return <Navigate to="/login" state={{ from: location }} replace />;
  if (userProfile?.role !== "admin") return <Navigate to="/" replace />;

  return children;
}

/* ═══════════════════════════════════════════════════════════════
   MAIN APP COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function App() {
  const [sport, setSport] = useState("football");

  useEffect(() => {
    initApp();
  }, []);

  return (
    <AuthProvider>
      <SportContext.Provider value={{ sport, setSport }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            minHeight: "100vh",
            background: "#07141f",
          }}
        >
          <Navbar />
          <SportToggler />

          <main style={{ flex: 1 }}>
            <ScrollToTop />

            <Suspense fallback={<AppLoader />}>
              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<AnimatedRoute><Home /></AnimatedRoute>} />
                <Route path="/predictions" element={<AnimatedRoute><Predictions /></AnimatedRoute>} />
                <Route path="/fixtures" element={<AnimatedRoute><Fixtures /></AnimatedRoute>} />
                <Route path="/basketball" element={<AnimatedRoute><Basketball /></AnimatedRoute>} />
                <Route path="/highlights" element={<AnimatedRoute><Highlights /></AnimatedRoute>} />
                <Route path="/livestream" element={<AnimatedRoute><LiveStream /></AnimatedRoute>} />
                <Route path="/leaderboard" element={<AnimatedRoute><Leaderboard /></AnimatedRoute>} />

                {/* Guest Only */}
                <Route path="/login" element={<GuestRoute><AnimatedRoute><Login /></AnimatedRoute></GuestRoute>} />

                {/* Protected Routes */}
                <Route path="/profile" element={<ProtectedRoute><AnimatedRoute><Profile /></AnimatedRoute></ProtectedRoute>} />
                
                {/* Admin Route */}
                <Route path="/zks-admin-8f9x2-control-panel" element={<AdminRoute><AnimatedRoute><Admin /></AnimatedRoute></AdminRoute>} />

                {/* 404 Catch */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>

          <Footer />
        </div>
      </SportContext.Provider>
    </AuthProvider>
  );
}