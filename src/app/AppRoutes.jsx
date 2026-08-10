import { Routes, Route } from "react-router-dom";
import PageTransition from "./transitions";
import { ProtectedRoute, GuestRoute, AdminRoute } from "./guards";
import { ROUTES } from "../utils/routes"; 

import {
  ReactorStudio, Home, Predictions, Fixtures, MasterGames, Basketball,
  Highlights, LiveStream, Leaderboard, MatchDetails, TeamPage, LeaguePage,
  Search, Login, Profile, Admin, About, PrivacyPolicy, Terms, Team, Careers,
  Contact, Partners, Advertise, FAQ, HelpCenter, NotFound, StudioHome,
  StudioEditor, StudioTemplates, MediaStudio, FaceARStudio, WebShowcaseStudio,
  FootballKnowledge, Results, // ★ PHASE 8: Added Results Import
} from "./routes";

function Animated({ children }) {
  return <PageTransition>{children}</PageTransition>;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTES.HOME} element={<Animated><Home /></Animated>} />
      <Route path={ROUTES.FIXTURES} element={<Animated><Fixtures /></Animated>} />
      
      {/* ★ PHASE 8: Added Results Archive Route */}
      <Route path={ROUTES.RESULTS} element={<Animated><Results /></Animated>} />
      
      <Route path={ROUTES.PREDICTIONS} element={<Animated><Predictions /></Animated>} />
      <Route path={ROUTES.MASTERGAMES} element={<Animated><MasterGames /></Animated>} />
      <Route path={ROUTES.BASKETBALL} element={<Animated><Basketball /></Animated>} />
      
      {/* Studio Routes */}
      <Route path="/studio" element={<Animated><StudioHome /></Animated>} />
      <Route path="/studio/templates" element={<Animated><StudioTemplates /></Animated>} />
      <Route path="/studio/editor" element={<Animated><StudioEditor /></Animated>} />
      <Route path="/studio/reactor" element={<Animated><ReactorStudio /></Animated>} />
      <Route path="/studio/web-showcase" element={<Animated><WebShowcaseStudio /></Animated>} />
      <Route path="/studio/media" element={<Animated><MediaStudio /></Animated>} />
      <Route path="/studio/face-ar" element={<Animated><FaceARStudio /></Animated>} />

      <Route path={ROUTES.HIGHLIGHTS} element={<Animated><Highlights /></Animated>} />
      <Route path="/highlights/author/:author" element={<Animated><Highlights /></Animated>} />
      <Route path="/highlights/:slugId" element={<Animated><Highlights /></Animated>} />
      
      <Route path={ROUTES.LIVESTREAM} element={<Animated><LiveStream /></Animated>} />
      <Route path={ROUTES.LEADERBOARD} element={<Animated><Leaderboard /></Animated>} />

      {/* Entity Routes */}
      <Route path="/match/:matchId/:slug" element={<Animated><MatchDetails /></Animated>} />
      <Route path="/team/:teamId/:slug" element={<Animated><TeamPage /></Animated>} />
      <Route path="/league/:leagueId/:slug" element={<Animated><LeaguePage /></Animated>} />
      <Route path="/competition/:leagueId/:slug" element={<Animated><LeaguePage /></Animated>} />
            
      <Route path={ROUTES.SEARCH} element={<Animated><Search /></Animated>} />

      {/* Company Routes */}
      <Route path={ROUTES.ABOUT} element={<Animated><About /></Animated>} />
      <Route path={ROUTES.TEAM} element={<Animated><Team /></Animated>} />
      <Route path={ROUTES.CAREERS} element={<Animated><Careers /></Animated>} />
      <Route path={ROUTES.CONTACT} element={<Animated><Contact /></Animated>} />
      <Route path={ROUTES.PARTNERS} element={<Animated><Partners /></Animated>} />
      <Route path={ROUTES.ADVERTISE} element={<Animated><Advertise /></Animated>} />

      <Route path={ROUTES.FAQ} element={<Animated><FAQ /></Animated>} />
      <Route path={ROUTES.HELP} element={<Animated><HelpCenter /></Animated>} />
      
      {/* Knowledge Routes */}
      <Route path="/football-knowledge" element={<Animated><FootballKnowledge /></Animated>} />
      <Route path="/football-knowledge/laws/:lawId" element={<Animated><FootballKnowledge /></Animated>} />

      <Route path={ROUTES.PRIVACY} element={<Animated><PrivacyPolicy /></Animated>} />
      <Route path={ROUTES.TERMS} element={<Animated><Terms /></Animated>} />

      {/* Auth & Admin */}
      <Route path={ROUTES.LOGIN} element={<GuestRoute><Animated><Login /></Animated></GuestRoute>} />
      <Route path={ROUTES.PROFILE} element={<ProtectedRoute><Animated><Profile /></Animated></ProtectedRoute>} />
      <Route path={ROUTES.ADMIN} element={<AdminRoute><Animated><Admin /></Animated></AdminRoute>} />

      <Route path="*" element={<Animated><NotFound /></Animated>} />
    </Routes>
  );
}