// src/app/RouteMeta.jsx — per-route <title>, description, canonical, OG + Twitter.
// Zero dependencies (no react-helmet). Titles are keyword-first, brand-last,
// kept <= ~60 chars so Google doesn't truncate them.

import { useEffect } from "react";
import { useLocation, matchPath } from "react-router-dom";
import { ROUTES, STUDIO_ROUTES } from "../utils/routes";
import { SITE } from "../utils/seoBuilder";

const SITE_URL = SITE?.url || "https://zokascore.xyz";
const BRAND = SITE?.name || "ZOKASCORE";

const INDEX_RULES = "index, follow, max-image-preview:large, max-snippet:-1";
const NO_INDEX = "noindex, nofollow";

// "arsenal-vs-chelsea" → "Arsenal vs Chelsea"
const prettify = (slug = "") =>
  slug
    .split("-")
    .map((w) => (/^vs$/i.test(w) ? "vs" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");

// First match wins → statics first, dynamic patterns last.
const META = [
  { path: ROUTES.HOME, title: "Live Football Scores, Fixtures & AI Predictions", description: "Live football scores, today's fixtures, results, standings and H2H stats for the Premier League, La Liga, Champions League — plus free AI predictions." },
  { path: ROUTES.FIXTURES, title: "Today's Football Fixtures & Kick-off Times", description: "Every football fixture for today and this week — kick-off times, dates and competitions across the Premier League, La Liga, Serie A, Bundesliga and more." },
  { path: ROUTES.RESULTS, title: "Latest Football Results & Final Scores", description: "Live and final football results updated in real time. Scores, scorers and match stats for every major league and cup competition." },
  { path: ROUTES.PREDICTIONS, title: "Free AI Football Predictions & Tips", description: "Free AI football predictions with win probabilities, H2H form and value tips for today's biggest matches across every major league." },
  { path: ROUTES.PREDICTION_V21, title: "AI Predictions V21 — Deep Stats Model", description: "V21 deep-stats prediction model: expected goals, form curves and win probability for every fixture." },
  { path: ROUTES.MASTERGAMES, title: "MasterGames — Daily Expert Football Picks", description: "MasterGames: daily expert football picks with full statistical reasoning. Track the streak and beat the board." },
  { path: ROUTES.BASKETBALL, title: "Live Basketball Scores, Fixtures & Results", description: "Live basketball scores, fixtures and results — NBA, EuroLeague and top leagues, updated in real time." },
  { path: ROUTES.HIGHLIGHTS, title: "Football Highlights & Video Replays", description: "Football highlights and video replays — goals, key moments and full recaps from every major league." },
  { path: ROUTES.LIVESTREAM, title: "Live Football Streams & Where to Watch", description: "Live football coverage: stream links, kick-off times and where to watch today's matches across every competition." },
  { path: ROUTES.LEADERBOARD, title: "Prediction Leaderboard — Top Tipsters", description: "ZOKASCORE prediction leaderboard — the top tipsters ranked by accuracy, streaks and points across all competitions." },
  { path: ROUTES.FOOTBALL_KNOWLEDGE, title: "Football Knowledge Hub — Guides & Glossary", description: "Football knowledge hub: tactics, stats primers, form guides and glossaries to read the game like an analyst." },
  { path: ROUTES.DEVELOPERS, title: "Developers — API & Data Feeds", description: "ZOKASCORE for developers — API docs, data feeds and integration guides for live scores and predictions." },

  // Company / legal
  { path: ROUTES.ABOUT, title: "About ZOKASCORE — Mission & Story", description: "Who we are: how ZOKASCORE builds fast, accurate live scores and AI football predictions." },
  { path: ROUTES.PRIVACY, title: "Privacy Policy", description: "How ZOKASCORE collects, uses and protects your data — cookies, analytics and your rights." },
  { path: ROUTES.TERMS, title: "Terms of Service", description: "The terms that govern your use of ZOKASCORE — accounts, content, predictions and liability." },
  { path: ROUTES.TEAM, title: "Meet the Team", description: "Meet the team behind ZOKASCORE — the people building the fastest football score experience." },
  { path: ROUTES.CAREERS, title: "Careers at ZOKASCORE", description: "Open roles at ZOKASCORE. Help build the future of live football scores and AI predictions." },
  { path: ROUTES.CONTACT, title: "Contact Us", description: "Get in touch with ZOKASCORE — support, feedback, partnerships and press." },
  { path: ROUTES.PARTNERS, title: "Partners", description: "Partner with ZOKASCORE — data, media and brand collaboration opportunities." },
  { path: ROUTES.ADVERTISE, title: "Advertise With Us", description: "Reach football fans on ZOKASCORE — ad formats, audiences and sponsorship options." },

  // System
  { path: ROUTES.CHANGELOG, title: "Changelog — What's New", description: "Every ZOKASCORE release: new features, fixes and improvements, newest first." },
  { path: ROUTES.STATUS, title: "System Status", description: "Real-time ZOKASCORE system status — API, live scores, predictions and infrastructure." },

  // Keep out of the index
  { path: ROUTES.LOGIN, title: "Sign In", description: "Sign in to ZOKASCORE to save teams, track predictions and climb the leaderboard.", robots: NO_INDEX },
  { path: ROUTES.PROFILE, title: "My Profile", description: "Your ZOKASCORE profile — saved teams, prediction history and points.", robots: NO_INDEX },
  { path: ROUTES.SEARCH, title: "Search", description: "Search ZOKASCORE for matches, teams, leagues and predictions.", robots: NO_INDEX },

  // Admin — hard noindex (base + splat so every sub-page is covered)
  { path: ROUTES.ADMIN, title: "Admin", robots: NO_INDEX },
  { path: `${ROUTES.ADMIN}/*`, title: "Admin", robots: NO_INDEX },

  // Studio — hard noindex
  { path: STUDIO_ROUTES.HOME, title: "Studio", robots: NO_INDEX },
  { path: `${STUDIO_ROUTES.HOME}/*`, title: "Studio", robots: NO_INDEX },

  // Dynamic entity routes (last)
  { path: ROUTES.MATCH_DETAIL, title: (m) => `${prettify(m.params.slug) || "Match"} — Live Score, H2H & Stats`, description: "Live score, line-ups, head-to-head record and key stats, updated in real time." },
  { path: ROUTES.TEAM_DETAIL, title: (m) => `${prettify(m.params.slug) || "Team"} — Stats, Fixtures & Results`, description: "Fixtures, results, standings position, squad and season stats." },
  { path: ROUTES.LEAGUE_DETAIL, title: (m) => `${prettify(m.params.slug) || "League"} — Table, Fixtures & Results`, description: "Full table, standings, fixtures, results and top scorers." },
  { path: ROUTES.COMPETITION_DETAIL, title: (m) => `${prettify(m.params.slug) || "League"} — Table, Fixtures & Results`, description: "Full table, standings, fixtures, results and top scorers." },
  // highlight slugs end in "-<postId>" → strip it before prettifying
  { path: ROUTES.HIGHLIGHT_DETAIL, title: (m) => `${prettify((m.params.slug || "").replace(/-\d+$/, ""))} — Highlights & Recap`, description: "Goals, highlights and the full match recap." },
];

function upsertMeta(attr, key, content) {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href) {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}

function applyMeta({ title, description, robots, path }) {
  const fullTitle = title ? (title.includes(BRAND) ? title : `${title} | ${BRAND}`) : BRAND;
  const url = `${SITE_URL}${path}`;

  document.title = fullTitle;
  upsertMeta("name", "description", description);
  upsertMeta("name", "robots", robots || INDEX_RULES);
  setCanonical(url);

  upsertMeta("property", "og:title", fullTitle);
  upsertMeta("property", "og:description", description);
  upsertMeta("property", "og:url", url);
  upsertMeta("name", "twitter:title", fullTitle);
  upsertMeta("name", "twitter:description", description);
}

export default function RouteMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const clean = pathname.replace(/\/+$/, "") || "/";

    let hit = null;
    let match = null;
    for (const entry of META) {
      const res = matchPath(entry.path, clean);
      if (res) { hit = entry; match = res; break; }
    }

    if (!hit) {
      applyMeta({
        title: "Page Not Found",
        description: "The page you're looking for doesn't exist.",
        robots: NO_INDEX,
        path: pathname,
      });
      return;
    }

    applyMeta({
      title: typeof hit.title === "function" ? hit.title(match) : hit.title,
      description: hit.description,
      robots: hit.robots,
      path: pathname,
    });
  }, [pathname]);

  return null;
}