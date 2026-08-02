// footballprediction/src/utils/routes.js

import { slugify } from './format';

export const ROUTES = Object.freeze({
  HOME: '/',
  FIXTURES: '/fixtures',
  PREDICTIONS: '/predictions',
  MASTERGAMES: '/mastergames',
  BASKETBALL: '/basketball',
  HIGHLIGHTS: '/highlights',
  LIVESTREAM: '/livestream',
  LEADERBOARD: '/leaderboard',
  SEARCH: '/search',
  LOGIN: '/login',
  PROFILE: '/profile',
  ADMIN: '/zks-admin-8f9x2-control-panel',
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
});

export const buildMatchRoute = (matchId, homeName, awayName) => 
  `/match/${matchId}/${slugify(homeName)}-vs-${slugify(awayName)}`;

export const buildTeamRoute = (teamId, teamName) => 
  `/team/${teamId}/${slugify(teamName)}`;

export const buildLeagueRoute = (leagueId, leagueName) => 
  `/league/${leagueId}/${slugify(leagueName)}`;

export const buildHighlightRoute = (postId, title) => 
  `/highlights/${slugify(title)}-${postId}`;
