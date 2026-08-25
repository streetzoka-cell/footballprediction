// src/app/lazyRoutes.jsx
import { lazy } from "react";

export const Home = lazy(() => import("../pages/Home"));
export const Fixtures = lazy(() => import("../pages/Fixtures"));
export const Results = lazy(() => import("../pages/Results"));
export const Predictions = lazy(() => import("../pages/Predictions"));
export const PredictionV21 = lazy(() => import("../pages/PredictionV21"));
export const MasterGames = lazy(() => import("../pages/MasterGames"));
export const Basketball = lazy(() => import("../pages/Basketball"));
export const Highlights = lazy(() => import("../pages/Highlights"));
export const HighlightDetail = lazy(() => import("../pages/HighlightDetail"));
export const HighlightAuthor = lazy(() => import("../pages/HighlightAuthor"));
export const Livestream = lazy(() => import("../pages/Livestream"));
export const Leaderboard = lazy(() => import("../pages/Leaderboard"));
export const Profile = lazy(() => import("../pages/Profile"));
export const Login = lazy(() => import("../pages/Login"));
export const About = lazy(() => import("../pages/About"));
export const Privacy = lazy(() => import("../pages/Privacy"));
export const Terms = lazy(() => import("../pages/Terms"));
export const FAQ = lazy(() => import("../pages/FAQ"));
export const HelpCenter = lazy(() => import("../pages/HelpCenter"));
export const Search = lazy(() => import("../pages/Search"));
export const Careers = lazy(() => import("../pages/Careers"));
export const Contact = lazy(() => import("../pages/Contact"));
export const Partners = lazy(() => import("../pages/Partners"));
export const Advertise = lazy(() => import("../pages/Advertise"));
export const Team = lazy(() => import("../pages/Team"));
export const Changelog = lazy(() => import("../pages/Changelog"));
export const Status = lazy(() => import("../pages/Status"));
export const FootballKnowledge = lazy(() => import("../pages/FootballKnowledge"));
export const FootballLawDetail = lazy(() => import("../pages/FootballLawDetail"));
export const MatchDetail = lazy(() => import("../pages/MatchDetail"));
export const LeagueDetail = lazy(() => import("../pages/LeagueDetail"));
export const TeamDetail = lazy(() => import("../pages/TeamDetail"));

// Studio Pages
export const StudioHome = lazy(() => import("../pages/studio/StudioHome"));
export const StudioTemplates = lazy(() => import("../pages/studio/StudioTemplates"));
export const StudioEditor = lazy(() => import("../pages/studio/StudioEditor"));
export const StudioReactor = lazy(() => import("../pages/studio/StudioReactor"));
export const StudioWebShowcase = lazy(() => import("../pages/studio/StudioWebShowcase"));
export const StudioMedia = lazy(() => import("../pages/studio/StudioMedia"));
export const StudioFaceAR = lazy(() => import("../pages/studio/StudioFaceAR"));

export const Admin = lazy(() => import("../pages/Admin"));
export const NotFound = lazy(() => import("../pages/NotFound"));