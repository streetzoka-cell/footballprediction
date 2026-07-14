import { lazy } from "react";

/* ===============================
   MAIN PAGES
=============================== */

export const Home = lazy(() => import("../pages/Home"));
export const Predictions = lazy(() => import("../pages/Predictions"));
export const Fixtures = lazy(() => import("../pages/Fixtures"));
export const MasterGames = lazy(() => import("../pages/MasterGames"));
export const Basketball = lazy(() => import("../pages/Basketball"));
export const Highlights = lazy(() => import("../pages/Highlights"));
export const LiveStream = lazy(() => import("../pages/LiveStream"));
export const Leaderboard = lazy(() => import("../pages/Leaderboard"));

/* ===============================
   ACCOUNT
=============================== */

export const Login = lazy(() => import("../pages/Login"));
export const Profile = lazy(() => import("../pages/Profile"));
export const Admin = lazy(() => import("../pages/Admin"));

/* ===============================
   INFO & LEGAL
=============================== */

export const About = lazy(() => import("../pages/company/About"));
export const PrivacyPolicy = lazy(() => import("../pages/PrivacyPolicy"));
export const Terms = lazy(() => import("../pages/Terms"));

/* ===============================
   COMPANY
=============================== */

export const Team = lazy(() => import("../pages/company/Team"));
export const Careers = lazy(() => import("../pages/company/Careers"));
export const Contact = lazy(() => import("../pages/company/Contact"));
export const Partners = lazy(() => import("../pages/company/Partners"));
export const Advertise = lazy(() => import("../pages/company/Advertise"));
/* ===============================
   SUPPORT
=============================== */

export const FAQ = lazy(() => import("../pages/FAQ"));
export const HelpCenter = lazy(() => import("../pages/HelpCenter"));

/* ===============================
   ERROR
=============================== */

export const NotFound = lazy(() => import("../pages/NotFound"));