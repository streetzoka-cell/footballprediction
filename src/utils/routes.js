// src/utils/routes.js
import { slugify } from './seoBuilder';

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
  ADMIN: '/zks-admin-8f9x2-control-panel',
  STUDIO: '/studio',
  ABOUT: '/about',
  FAQ: '/faq',
  HELP: '/help-center',
  PRIVACY: '/privacy',
  TERMS: '/terms',
  TEAM: '/team',
  CAREERS: '/careers',
  CONTACT: '/contact',
  PARTNERS: '/partners',
  ADVERTISE: '/advertise',
  CHANGELOG: '/changelog',
  STATUS: '/status',
  FOOTBALL_KNOWLEDGE: '/football-knowledge',
});

export const STUDIO_ROUTES = Object.freeze({
  HOME: '/studio',
  TEMPLATES: '/studio/templates',
  EDITOR: '/studio/editor',
  REACTOR: '/studio/reactor',
  WEB_SHOWCASE: '/studio/web-showcase',
  MEDIA: '/studio/media',
  FACE_AR: '/studio/face-ar',
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

export const buildHighlightRoute = (postId, title) =>
  `/highlights/${safeSlug(title)}-${postId || ''}`.toLowerCase();

export const buildSearchRoute = (q) =>
  `/search?q=${encodeURIComponent(q || '')}`;