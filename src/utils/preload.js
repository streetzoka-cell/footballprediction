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
  "/help": () => import("../pages/HelpCenter"),
  "/privacy": () => import("../pages/PrivacyPolicy"),
  "/terms": () => import("../pages/Terms"),
};

export function preloadRoute(path) {
  // Handle exact matches first
  if (preloadMap[path]) {
    preloadMap[path]();
    return;
  }

  // ★ FIX: Handle dynamic match routes (e.g., /match/12345/man-city-vs-arsenal)
  if (path.startsWith("/match/")) {
    import("../pages/MatchDetails");
    return;
  }

  // Handle company routes dynamically
  if (path.startsWith("/team") || path.startsWith("/careers") || path.startsWith("/contact") || path.startsWith("/partners") || path.startsWith("/advertise")) {
    const part = path.split("/")[1];
    import(`../pages/company/${part.charAt(0).toUpperCase() + part.slice(1)}`);
  }
}