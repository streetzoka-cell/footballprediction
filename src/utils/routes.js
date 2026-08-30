// src/utils/routes.js
// SINGLE SOURCE OF TRUTH for every path. Components import from here —
// zero hardcoded route strings anywhere else.

import { slugify } from './seoBuilder';

// Defined once so the admin hub + sub-pages can never drift apart
const ADMIN_BASE = '/zks-admin-8f9x2-control-panel';

export const STUDIO_ROUTES = Object.freeze({
  HOME: '/studio',
  TEMPLATES: '/studio/templates',
  EDITOR: '/studio/editor',
  REACTOR: '/studio/reactor',
  WEB_SHOWCASE: '/studio/web-showcase',
  MEDIA: '/studio/media',
  FACE_AR: '/studio/face-ar',
});

export const ROUTES = Object.freeze({
  HOME: '/',
  FIXTURES: '/fixtures',
  RESULTS: '/results',
  PREDICTIONS: '/predictions',
  PREDICTION_V21: '/predictions/v21',
  MASTERGAMES: '/mastergames',
  BASKETBALL: '/basketball',
  HIGHLIGHTS: '/highlights',
  LIVESTREAM: '/livestream',
  LEADERBOARD: '/leaderboard',
  SEARCH: '/search',
  LOGIN: '/login',
  PROFILE: '/profile',

  // Admin (guarded + noindex)
  ADMIN: ADMIN_BASE,
  ADMIN_PREDICTION_GROUPS: `${ADMIN_BASE}/pick-groups`, // ★ was used in AppRoutes but never defined here

  // Entity detail routes — (:slug?) optional so bare-id links resolve instead of 404ing.
  // Requires react-router-dom >= 6.5 (optional segments).
  MATCH_DETAIL: '/match/:matchId/:slug?',
  TEAM_DETAIL: '/team/:teamId/:slug?',
  LEAGUE_DETAIL: '/league/:leagueId/:slug?',
  COMPETITION_DETAIL: '/competition/:leagueId/:slug?',
  HIGHLIGHT_DETAIL: '/highlights/:slug',

  // Company / legal
  ABOUT: '/about',
  PRIVACY: '/privacy',
  TERMS: '/terms',
  TEAM: '/team', // company team page — entity pages use TEAM_DETAIL (RR ranks statics first, no clash)
  CAREERS: '/careers',
  CONTACT: '/contact',
  PARTNERS: '/partners',
  ADVERTISE: '/advertise',

  // Support & content
  FAQ: '/faq',
  HELP: '/help-center',
  FOOTBALL_KNOWLEDGE: '/football-knowledge',
  DEVELOPERS: '/developers', // ★ was hardcoded in AppRoutes

  // System
  CHANGELOG: '/changelog',
  STATUS: '/status',

  // Alias so ROUTES.STUDIO and STUDIO_ROUTES.HOME can never disagree
  STUDIO: STUDIO_ROUTES.HOME,
});

const safeSlug = (name) => slugify(name) || 'unknown';

export const buildMatchRoute = (id, home, away) => {
  if (!id) return '/';
  return `/match/${id}/${safeSlug(home)}-vs-${safeSlug(away)}`.toLowerCase();
};

export const buildTeamRoute = (id, name) =>
  `/team/${id || 'unknown'}/${safeSlug(name)}`.toLowerCase();

export const buildLeagueRoute = (id, name) =>
  `/league/${id || 'unknown'}/${safeSlug(name)}`.toLowerCase();

export const buildCompetitionRoute = (id, name) =>
  `/competition/${id || 'unknown'}/${safeSlug(name)}`.toLowerCase();

export const buildHighlightRoute = (postId, title) => {
  const slug = safeSlug(title);
  // ★ no more trailing dash when postId is missing
  return postId
    ? `/highlights/${slug}-${postId}`.toLowerCase()
    : `/highlights/${slug}`.toLowerCase();
};

export const buildSearchRoute = (q) =>
  `/search?q=${encodeURIComponent(q || '')}`;