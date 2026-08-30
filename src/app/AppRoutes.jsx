import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { ROUTES, STUDIO_ROUTES } from "../utils/routes";
import { AdminRoute } from "./guards";

// --- Lazy Page Imports (mapped exactly to your directory tree) ---

const Home = lazy(() => import("../pages/Home"));
const Fixtures = lazy(() => import("../pages/Fixtures"));
const Results = lazy(() => import("../pages/Results"));
const Predictions = lazy(() => import("../pages/Predictions"));
// ★ ROUTES.PREDICTION_V21 existed but was never routed → linked users hit NotFound.
// If your v21 view lives INSIDE Predictions.jsx instead, swap the element below
// to <Predictions /> (or delete this import + the route + ROUTES.PREDICTION_V21).
const PredictionsV21 = lazy(() => import("../pages/PredictionsV21"));
const MasterGames = lazy(() => import("../pages/MasterGames"));
const Basketball = lazy(() => import("../pages/Basketball"));
const Highlights = lazy(() => import("../pages/Highlights"));
const LiveStream = lazy(() => import("../pages/LiveStream"));
const Leaderboard = lazy(() => import("../pages/Leaderboard"));
const MatchDetails = lazy(() => import("../pages/MatchDetails"));
const Search = lazy(() => import("../pages/Search"));
const TeamPage = lazy(() => import("../pages/TeamPage"));
const LeaguePage = lazy(() => import("../pages/LeaguePage"));

const Login = lazy(() => import("../pages/Login"));
const Profile = lazy(() => import("../pages/Profile"));
const Admin = lazy(() => import("../pages/Admin"));

// ★ Pick-Groups Studio (lives in components/)
const AdminPredictionGroups = lazy(() => import("../components/AdminPredictionGroups"));

const About = lazy(() => import("../pages/company/About"));
const PrivacyPolicy = lazy(() => import("../pages/PrivacyPolicy"));
const Terms = lazy(() => import("../pages/Terms"));
const Team = lazy(() => import("../pages/company/Team"));
const Careers = lazy(() => import("../pages/company/Careers"));
const Contact = lazy(() => import("../pages/company/Contact"));
const Partners = lazy(() => import("../pages/company/Partners"));
const Advertise = lazy(() => import("../pages/company/Advertise"));

const FAQ = lazy(() => import("../pages/FAQ"));
const HelpCenter = lazy(() => import("../pages/HelpCenter"));
const NotFound = lazy(() => import("../pages/NotFound"));
const FootballKnowledge = lazy(() => import("../pages/FootballKnowledge"));
const Developers = lazy(() => import("../pages/Developers"));

// System Pages
const Changelog = lazy(() => import("../pages/system/Changelog"));
const Status = lazy(() => import("../pages/system/Status"));

// Studio Pages
const ReactorStudio = lazy(() => import("../studio/pages/ReactorStudio"));
const StudioHome = lazy(() => import("../studio/pages/StudioHome"));
const StudioEditor = lazy(() => import("../studio/pages/StudioEditor"));
const StudioTemplates = lazy(() => import("../studio/pages/Templates"));
const MediaStudio = lazy(() => import("../studio/pages/MediaStudio"));
const FaceARStudio = lazy(() => import("../studio/pages/FaceARStudio"));
const WebShowcaseStudio = lazy(() => import("../studio/pages/WebShowcaseStudio"));

const pageFallback = (
  <div className="zk-page-loader">
    <div className="zk-page-loader-skeleton">
      <div className="zk-page-loader-skeleton-bar zk-page-loader-skeleton-bar--lg" />
      <div className="zk-page-loader-skeleton-bar zk-page-loader-skeleton-bar--md" />
      <div className="zk-page-loader-skeleton-bar zk-page-loader-skeleton-bar--sm" />
    </div>
  </div>
);

export default function AppRoutes() {
  return (
    <Suspense fallback={pageFallback}>
      <Routes>
        {/* Core product */}
        <Route path={ROUTES.HOME} element={<Home />} />
        <Route path={ROUTES.FIXTURES} element={<Fixtures />} />
        <Route path={ROUTES.RESULTS} element={<Results />} />
        <Route path={ROUTES.PREDICTIONS} element={<Predictions />} />
        <Route path={ROUTES.PREDICTION_V21} element={<PredictionsV21 />} />
        <Route path={ROUTES.MASTERGAMES} element={<MasterGames />} />
        <Route path={ROUTES.BASKETBALL} element={<Basketball />} />
        <Route path={ROUTES.HIGHLIGHTS} element={<Highlights />} />
        <Route path={ROUTES.LIVESTREAM} element={<LiveStream />} />
        <Route path={ROUTES.LEADERBOARD} element={<Leaderboard />} />

        {/* Entity details — patterns live in routes.js; slug optional (RR >= 6.5).
            Highlights.jsx can read the :slug param to render a single highlight;
            if it ignores the param it safely shows the list instead of a 404. */}
        <Route path={ROUTES.MATCH_DETAIL} element={<MatchDetails />} />
        <Route path={ROUTES.TEAM_DETAIL} element={<TeamPage />} />
        <Route path={ROUTES.LEAGUE_DETAIL} element={<LeaguePage />} />
        <Route path={ROUTES.COMPETITION_DETAIL} element={<LeaguePage />} />
        <Route path={ROUTES.HIGHLIGHT_DETAIL} element={<Highlights />} />

        <Route path={ROUTES.SEARCH} element={<Search />} />

        {/* Company / legal */}
        <Route path={ROUTES.ABOUT} element={<About />} />
        <Route path={ROUTES.PRIVACY} element={<PrivacyPolicy />} />
        <Route path={ROUTES.TERMS} element={<Terms />} />
        <Route path={ROUTES.TEAM} element={<Team />} />
        <Route path={ROUTES.CAREERS} element={<Careers />} />
        <Route path={ROUTES.CONTACT} element={<Contact />} />
        <Route path={ROUTES.PARTNERS} element={<Partners />} />
        <Route path={ROUTES.ADVERTISE} element={<Advertise />} />

        {/* Support & content */}
        <Route path={ROUTES.FAQ} element={<FAQ />} />
        <Route path={ROUTES.HELP} element={<HelpCenter />} />
        <Route path={ROUTES.FOOTBALL_KNOWLEDGE} element={<FootballKnowledge />} />
        <Route path={ROUTES.DEVELOPERS} element={<Developers />} />

        {/* Studio */}
        <Route path={STUDIO_ROUTES.HOME} element={<StudioHome />} />
        <Route path={STUDIO_ROUTES.TEMPLATES} element={<StudioTemplates />} />
        <Route path={STUDIO_ROUTES.EDITOR} element={<StudioEditor />} />
        <Route path={STUDIO_ROUTES.REACTOR} element={<ReactorStudio />} />
        <Route path={STUDIO_ROUTES.WEB_SHOWCASE} element={<WebShowcaseStudio />} />
        <Route path={STUDIO_ROUTES.MEDIA} element={<MediaStudio />} />
        <Route path={STUDIO_ROUTES.FACE_AR} element={<FaceARStudio />} />

        {/* System */}
        <Route path={ROUTES.CHANGELOG} element={<Changelog />} />
        <Route path={ROUTES.STATUS} element={<Status />} />

        {/* Auth */}
        <Route path={ROUTES.LOGIN} element={<Login />} />
        <Route path={ROUTES.PROFILE} element={<Profile />} />

        {/* Admin (guarded + noindex via RouteMeta) */}
        <Route path={ROUTES.ADMIN} element={<AdminRoute><Admin /></AdminRoute>} />
        {/* ★ Pick-Groups Studio — same guard as the Admin hub, now with a real path */}
        <Route path={ROUTES.ADMIN_PREDICTION_GROUPS} element={<AdminRoute><AdminPredictionGroups /></AdminRoute>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}