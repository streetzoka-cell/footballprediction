// src/app/routes.jsx

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
   COMPANY
=============================== */

export const About = lazy(() =>
    import("../pages/company/About")
);

export const Contact = lazy(() =>
    import("../pages/company/Contact")
);

export const Partners = lazy(() =>
    import("../pages/company/Partners")
);

export const Advertise = lazy(() =>
    import("../pages/company/Advertise")
);

export const Careers = lazy(() =>
    import("../pages/company/Careers")
);

/* ===============================
   LEGAL
=============================== */

export const PrivacyPolicy = lazy(() =>
    import("../pages/legal/PrivacyPolicy")
);

export const Terms = lazy(() =>
    import("../pages/legal/Terms")
);

export const Cookies = lazy(() =>
    import("../pages/legal/Cookies")
);

export const Disclaimer = lazy(() =>
    import("../pages/legal/Disclaimer")
);

/* ===============================
   SUPPORT
=============================== */

export const FAQ = lazy(() =>
    import("../pages/support/FAQ")
);

export const HelpCenter = lazy(() =>
    import("../pages/support/HelpCenter")
);

/* ===============================
   SYSTEM
=============================== */

export const Status = lazy(() =>
    import("../pages/system/Status")
);

export const Changelog = lazy(() =>
    import("../pages/system/Changelog")
);

/* ===============================
   ERROR
=============================== */

export const NotFound = lazy(() =>
    import("../pages/NotFound")
);