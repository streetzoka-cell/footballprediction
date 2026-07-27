import { Routes, Route } from "react-router-dom";
import PageTransition from "./transitions";
import {
  ProtectedRoute,
  GuestRoute,
  AdminRoute,
} from "./guards";

import {
  ReactorStudio,
  Home,
  Predictions,
  Fixtures,
  MasterGames,
  Basketball,
  Highlights,
  LiveStream,
  Leaderboard,
  MatchDetails,
  TeamPage,
  LeaguePage,
  Search,
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
      <Route path="/" element={<Animated><Home /></Animated>} />
      <Route path="/fixtures" element={<Animated><Fixtures /></Animated>} />
      <Route path="/predictions" element={<Animated><Predictions /></Animated>} />
      <Route path="/mastergames" element={<Animated><MasterGames /></Animated>} />
      <Route path="/basketball" element={<Animated><Basketball /></Animated>} />
      
      <Route path="/studio" element={<Animated><StudioHome /></Animated>} />
      <Route path="/studio/templates" element={<Animated><StudioTemplates /></Animated>} />
      <Route path="/studio/editor" element={<Animated><StudioEditor /></Animated>} />
      <Route path="/studio/reactor" element={<Animated><ReactorStudio /></Animated>} />
      <Route path="/studio/web-showcase" element={<Animated><WebShowcaseStudio /></Animated>} />
      <Route path="/studio/media" element={<Animated><MediaStudio /></Animated>} />
      <Route path="/studio/face-ar" element={<Animated><FaceARStudio /></Animated>} />

      <Route path="/highlights" element={<Animated><Highlights /></Animated>} />
      <Route path="/highlights/author/:author" element={<Animated><Highlights /></Animated>} />
      <Route path="/highlights/:slugId" element={<Animated><Highlights /></Animated>} />
      
      <Route path="/livestream" element={<Animated><LiveStream /></Animated>} />
      <Route path="/leaderboard" element={<Animated><Leaderboard /></Animated>} />

      <Route path="/match/:matchId/:slug" element={<Animated><MatchDetails /></Animated>} />
      <Route path="/team/:teamId/:slug" element={<Animated><TeamPage /></Animated>} />
      <Route path="/league/:leagueId/:slug" element={<Animated><LeaguePage /></Animated>} />
            
      <Route path="/search" element={<Animated><Search /></Animated>} />

      <Route path="/about" element={<Animated><About /></Animated>} />
      <Route path="/team" element={<Animated><Team /></Animated>} />
      <Route path="/careers" element={<Animated><Careers /></Animated>} />
      <Route path="/contact" element={<Animated><Contact /></Animated>} />
      <Route path="/partners" element={<Animated><Partners /></Animated>} />
      <Route path="/advertise" element={<Animated><Advertise /></Animated>} />

      <Route path="/faq" element={<Animated><FAQ /></Animated>} />
      <Route path="/help" element={<Animated><HelpCenter /></Animated>} />
      <Route path="/help-center" element={<Animated><HelpCenter /></Animated>} />
      
      <Route path="/privacy" element={<Animated><PrivacyPolicy /></Animated>} />
      <Route path="/terms" element={<Animated><Terms /></Animated>} />

      <Route path="/login" element={<GuestRoute><Animated><Login /></Animated></GuestRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Animated><Profile /></Animated></ProtectedRoute>} />
      <Route path="/zks-admin-8f9x2-control-panel" element={<AdminRoute><Animated><Admin /></Animated></AdminRoute>} />

      <Route path="*" element={<Animated><NotFound /></Animated>} />
    </Routes>
  );
}