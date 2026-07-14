import { Routes, Route } from "react-router-dom";
import PageTransition from "./transitions";
import {
  ProtectedRoute,
  GuestRoute,
  AdminRoute,
} from "./guards";

import {
  Home,
  Predictions,
  Fixtures,
  MasterGames,
  Basketball,
  Highlights,
  LiveStream,
  Leaderboard,

  Login,
  Profile,
  Admin,

  About,
  PrivacyPolicy,
  Terms,

  Team,
  Careers,
  Contact,
  Partners,
  Advertise,

  FAQ,
  HelpCenter,

  NotFound,
} from "./routes";

function Animated({ children }) {
  return <PageTransition>{children}</PageTransition>;
}

export default function AppRoutes() {
  return (
    <Routes>
      {/* ================= MAIN ================= */}
      <Route path="/" element={<Animated><Home /></Animated>} />

      {/* ================= SPORTS ================= */}
      <Route path="/fixtures" element={<Animated><Fixtures /></Animated>} />
      <Route path="/predictions" element={<Animated><Predictions /></Animated>} />
      <Route path="/mastergames" element={<Animated><MasterGames /></Animated>} />
      <Route path="/basketball" element={<Animated><Basketball /></Animated>} />
      <Route path="/highlights" element={<Animated><Highlights /></Animated>} />
      <Route path="/livestream" element={<Animated><LiveStream /></Animated>} />
      <Route path="/leaderboard" element={<Animated><Leaderboard /></Animated>} />

      {/* ================= COMPANY ================= */}
      <Route path="/about" element={<Animated><About /></Animated>} />
      <Route path="/team" element={<Animated><Team /></Animated>} />
      <Route path="/careers" element={<Animated><Careers /></Animated>} />
      <Route path="/contact" element={<Animated><Contact /></Animated>} />
      <Route path="/partners" element={<Animated><Partners /></Animated>} />
      <Route path="/advertise" element={<Animated><Advertise /></Animated>} />

      {/* ================= SUPPORT ================= */}
      <Route path="/faq" element={<Animated><FAQ /></Animated>} />
      <Route path="/help-center" element={<Animated><HelpCenter /></Animated>} />

      {/* ================= LEGAL ================= */}
      <Route path="/privacy" element={<Animated><PrivacyPolicy /></Animated>} />
      <Route path="/terms" element={<Animated><Terms /></Animated>} />

      {/* ================= AUTH ================= */}
      <Route
        path="/login"
        element={
          <GuestRoute>
            <Animated><Login /></Animated>
          </GuestRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Animated><Profile /></Animated>
          </ProtectedRoute>
        }
      />
      <Route
        path="/zks-admin-8f9x2-control-panel"
        element={
          <AdminRoute>
            <Animated><Admin /></Animated>
          </AdminRoute>
        }
      />

      {/* ================= 404 ================= */}
      <Route path="*" element={<Animated><NotFound /></Animated>} />
    </Routes>
  );
}