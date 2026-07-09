// 📄 src/App.jsx

import {
  Routes,
  Route,
  useLocation,
} from "react-router-dom";

import {
  useEffect,
  useState,
  lazy,
  Suspense,
} from "react";

import { AuthProvider } from "./context/AuthContext";

import { initApp } from "./utils/api";
import { initBasketball } from "./utils/basketballApi";

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

export default function App() {
  useEffect(() => {
    initApp();
    initBasketball();
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

              <Route
                path="/login"
                element={
                  <PageTransition>
                    <Login />
                  </PageTransition>
                }
              />

              <Route
                path="/profile"
                element={
                  <PageTransition>
                    <Profile />
                  </PageTransition>
                }
              />

              <Route
                path="/admin"
                element={
                  <PageTransition>
                    <Admin />
                  </PageTransition>
                }
              />
            </Routes>
          </Suspense>
        </main>

        <Footer />
      </div>
    </AuthProvider>
  );
}