// src/utils/preload.js
import { preload } from 'react-dom';

const preloadMap = {
  "/": () => import("../pages/Home"),
  "/fixtures": () => import("../pages/Fixtures"),
  "/predictions": () => import("../pages/Predictions"),
  "/mastergames": () => import("../pages/MasterGames"),
  "/basketball": () => import("../pages/Basketball"),
  "/highlights": () => import("../pages/Highlights"),
  "/livestream": () => import("../pages/LiveStream"),
  "/leaderboard": () => import("../pages/Leaderboard"),
  "/profile": () => import("../pages/Profile"),
  "/login": () => import("../pages/Login"),
  "/about": () => import("../pages/company/About"),
  "/faq": () => import("../pages/FAQ"),
  "/help-center": () => import("../pages/HelpCenter"),
  "/privacy": () => import("../pages/PrivacyPolicy"),
  "/terms": () => import("../pages/Terms"),
  "/studio": () => import("../studio/pages/StudioHome"),
};

const preloadedRoutes = new Set();

/**
 * Preloads a route's JavaScript chunk.
 * Uses React 19's preload API if available, falling back to standard dynamic import.
 */
export function preloadRoute(path) {
  // Handle exact matches first
  if (preloadMap[path] && !preloadedRoutes.has(path)) {
    preloadedRoutes.add(path);
    preloadMap[path]();
    return;
  }

  // Handle dynamic match routes (e.g., /match/12345/man-city-vs-arsenal)
  if (path.startsWith("/match/") && !preloadedRoutes.has('/match/')) {
    preloadedRoutes.add('/match/');
    import("../pages/MatchDetails");
    return;
  }

  // Handle dynamic team routes
  if (path.startsWith("/team/") && !preloadedRoutes.has('/team/')) {
    preloadedRoutes.add('/team/');
    import("../pages/TeamPage");
    return;
  }

  // Handle dynamic league routes
  if (path.startsWith("/league/") && !preloadedRoutes.has('/league/')) {
    preloadedRoutes.add('/league/');
    import("../pages/LeaguePage");
    return;
  }

  // Handle company routes dynamically
  if (path.startsWith("/team") || path.startsWith("/careers") || path.startsWith("/contact") || path.startsWith("/partners") || path.startsWith("/advertise")) {
    const part = path.split("/")[1];
    const routeKey = `/${part}`;
    if (!preloadedRoutes.has(routeKey)) {
      preloadedRoutes.add(routeKey);
      import(`../pages/company/${part.charAt(0).toUpperCase() + part.slice(1)}`);
    }
  }
}