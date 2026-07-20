import { Routes, Route } from "react-router-dom";
import PageTransition from "./transitions";
import {
  ProtectedRoute,
  GuestRoute,
  AdminRoute,
} from "./guards";


import { ReactorStudio } from "./routes";
import {
  Home,
  Predictions,
  Fixtures,
  MasterGames,
  Basketball,
  Highlights,
  LiveStream,
  Leaderboard,
  MatchDetails,

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
  
  // 🆕 Studio Imports
  StudioHome,
  StudioEditor,
  StudioTemplates,
  MediaStudio,
  FaceARStudio,
  WebShowcaseStudio,
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
      
      {/* ================= ZOKASCORE STUDIO 🆕 ================= */}
      <Route path="/studio" element={<Animated><StudioHome /></Animated>} />
      <Route path="/studio/templates" element={<Animated><StudioTemplates /></Animated>} />
      <Route path="/studio/editor" element={<Animated><StudioEditor /></Animated>} />
      <Route path="/studio/reactor" element={<Animated><ReactorStudio /></Animated>} />
      <Route path="/studio/web-showcase" element={<Animated><WebShowcaseStudio /></Animated>} />
      <Route path="/studio/media" element={<Animated><MediaStudio /></Animated>} />
      <Route path="/studio/face-ar" element={<Animated><FaceARStudio /></Animated>} />

      {/* ★ NEWS HUB ROUTES (Order matters: Author before SlugId) ★ */}
      <Route path="/highlights" element={<Animated><Highlights /></Animated>} />
      <Route path="/highlights/author/:author" element={<Animated><Highlights /></Animated>} />
      <Route path="/highlights/:slugId" element={<Animated><Highlights /></Animated>} />
      
      <Route path="/livestream" element={<Animated><LiveStream /></Animated>} />
      <Route path="/leaderboard" element={<Animated><Leaderboard /></Animated>} />

      {/* ★ NEW: DYNAMIC MATCH DETAILS ROUTE FOR SEO ★ */}
      <Route path="/match/:matchId/:slug" element={<Animated><MatchDetails /></Animated>} />

      {/* ================= COMPANY ================= */}
      <Route path="/about" element={<Animated><About /></Animated>} />
      <Route path="/team" element={<Animated><Team /></Animated>} />
      <Route path="/careers" element={<Animated><Careers /></Animated>} />
      <Route path="/contact" element={<Animated><Contact /></Animated>} />
      <Route path="/partners" element={<Animated><Partners /></Animated>} />
      <Route path="/advertise" element={<Animated><Advertise /></Animated>} />

      {/* ================= SUPPORT ================= */}
      <Route path="/faq" element={<Animated><FAQ /></Animated>} />
      <Route path="/help" element={<Animated><HelpCenter /></Animated>} />
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