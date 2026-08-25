/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ZOKASCORE — Route Preloader (Cleaned)
   Preconnects/prefetches critical route chunks on navigation hint.
   Added: Results, FootballKnowledge, Changelog, Status
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

import { ROUTES, STUDIO_ROUTES } from "./routes";

/* ── Map route paths → dynamic import factories ──────────────── */
const PRELOAD_MAP = {
  [ROUTES.HOME]:            () => import("../pages/Home"),
  [ROUTES.FIXTURES]:        () => import("../pages/Fixtures"),
  [ROUTES.RESULTS]:         () => import("../pages/Results"),
  [ROUTES.PREDICTIONS]:     () => import("../pages/Predictions"),
  [ROUTES.PREDICTION_V21]:  () => import("../pages/PredictionV21"),
  [ROUTES.MASTER_GAMES]:    () => import("../pages/MasterGames"),
  [ROUTES.BASKETBALL]:      () => import("../pages/Basketball"),
  [ROUTES.HIGHLIGHTS]:      () => import("../pages/Highlights"),
  [ROUTES.LIVESTREAM]:      () => import("../pages/Livestream"),
  [ROUTES.LEADERBOARD]:     () => import("../pages/Leaderboard"),
  [ROUTES.PROFILE]:         () => import("../pages/Profile"),
  [ROUTES.LOGIN]:           () => import("../pages/Login"),
  [ROUTES.ABOUT]:           () => import("../pages/About"),
  [ROUTES.PRIVACY]:         () => import("../pages/Privacy"),
  [ROUTES.TERMS]:           () => import("../pages/Terms"),
  [ROUTES.FAQ]:             () => import("../pages/FAQ"),
  [ROUTES.HELP]:            () => import("../pages/HelpCenter"),
  [ROUTES.SEARCH]:          () => import("../pages/Search"),
  [ROUTES.CAREERS]:         () => import("../pages/Careers"),
  [ROUTES.CONTACT]:         () => import("../pages/Contact"),
  [ROUTES.PARTNERS]:        () => import("../pages/Partners"),
  [ROUTES.ADVERTISE]:       () => import("../pages/Advertise"),
  [ROUTES.TEAM]:            () => import("../pages/Team"),
  [ROUTES.FOOTBALL_KNOWLEDGE]: () => import("../pages/FootballKnowledge"),
  [ROUTES.CHANGELOG]:       () => import("../pages/Changelog"),
  [ROUTES.STATUS]:          () => import("../pages/Status"),

  /* ── Studio ───────────────────────────────────────────── */
  [STUDIO_ROUTES.HOME]:         () => import("../pages/studio/StudioHome"),
  [STUDIO_ROUTES.TEMPLATES]:    () => import("../pages/studio/StudioTemplates"),
  [STUDIO_ROUTES.EDITOR]:       () => import("../pages/studio/StudioEditor"),
  [STUDIO_ROUTES.REACTOR]:      () => import("../pages/studio/StudioReactor"),
  [STUDIO_ROUTES.WEB_SHOWCASE]: () => import("../pages/studio/StudioWebShowcase"),
  [STUDIO_ROUTES.MEDIA]:        () => import("../pages/studio/StudioMedia"),
  [STUDIO_ROUTES.FACE_AR]:      () => import("../pages/studio/StudioFaceAR"),

  /* ── Admin (guarded but still preloadable) ───────────── */
  [ROUTES.ADMIN]:           () => import("../pages/Admin"),
};

/* ── Cached preload promises ─────────────────────────────────── */
const preloaded = new Set();

/** Preload a route's chunk without navigating to it. */
export function preloadRoute(path) {
  const factory = PRELOAD_MAP[path];
  if (!factory || preloaded.has(path)) return;
  preloaded.add(path);
  factory(); // fire and forget — Vite creates the chunk
}

/** Preload multiple routes at once. */
export function preloadRoutes(paths) {
  paths.forEach(preloadRoute);
}

/** Preload likely next routes based on current path. */
export function preloadLikelyRoutes(currentPath) {
  if (currentPath === ROUTES.HOME) {
    preloadRoutes([ROUTES.FIXTURES, ROUTES.PREDICTIONS, ROUTES.LEADERBOARD]);
  } else if (currentPath === ROUTES.FIXTURES) {
    preloadRoutes([ROUTES.RESULTS, ROUTES.LIVESTREAM]);
  } else if (currentPath.startsWith("/studio")) {
    preloadRoutes([
      STUDIO_ROUTES.TEMPLATES,
      STUDIO_ROUTES.EDITOR,
      STUDIO_ROUTES.MEDIA,
    ]);
  }
}
