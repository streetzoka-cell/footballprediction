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
};

export function preloadRoute(path) {
  const loader = preloadMap[path];
  if (loader) loader();
}