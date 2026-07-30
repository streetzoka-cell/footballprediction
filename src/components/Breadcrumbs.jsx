// src/components/Breadcrumbs.jsx

import { Link, useLocation } from "react-router-dom";

const TITLES = {
  fixtures: "Fixtures",
  predictions: "Predictions",
  mastergames: "Master Games",
  basketball: "Basketball",
  highlights: "Highlights",
  livestream: "Live Stream",
  leaderboard: "Leaderboard",
  profile: "Profile",
  login: "Login",
  about: "About",
  privacy: "Privacy Policy",
  terms: "Terms of Service",
  faq: "FAQ",
  help: "Help Center",
  "help-center": "Help Center",
  careers: "Careers",
  contact: "Contact",
  partners: "Partners",
  advertise: "Advertise",
};

const titleCase = (text = "") =>
  decodeURIComponent(text)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

export default function Breadcrumbs() {
  const { pathname } = useLocation();

  if (pathname === "/") return null;

  const parts = pathname.split("/").filter(Boolean);

  let crumbs = [{ name: "Home", path: "/" }];

  switch (parts[0]) {
    // --------------------------
    // Fixtures
    // --------------------------
    case "fixtures":
      crumbs.push({
        name: "Fixtures",
        path: "/fixtures",
      });
      break;

    // --------------------------
    // Predictions
    // --------------------------
    case "predictions":
      crumbs.push({
        name: "Predictions",
        path: "/predictions",
      });
      break;

    // --------------------------
    // Leaderboard
    // --------------------------
    case "leaderboard":
      crumbs.push({
        name: "Leaderboard",
        path: "/leaderboard",
      });
      break;

    // --------------------------
    // Basketball
    // --------------------------
    case "basketball":
      crumbs.push({
        name: "Basketball",
        path: "/basketball",
      });
      break;

    // --------------------------
    // Highlights
    // --------------------------
    case "highlights":
      crumbs.push({
        name: "Highlights",
        path: "/highlights",
      });
      break;

    // --------------------------
    // Live Stream
    // --------------------------
    case "livestream":
      crumbs.push({
        name: "Live Stream",
        path: "/livestream",
      });
      break;

    // --------------------------
    // League
    // /league/39/premier-league
    // --------------------------
    case "league": {
      crumbs.push({
        name: "Leagues",
        path: "/fixtures",
      });

      const slug = parts.slice(2).join("-");

      crumbs.push({
        name: titleCase(slug),
        path: pathname,
      });

      break;
    }

    // --------------------------
    // Team
    // /team/33/manchester-united
    // --------------------------
    case "team": {
      crumbs.push({
        name: "Teams",
        path: "/fixtures",
      });

      const slug = parts.slice(2).join("-");

      crumbs.push({
        name: titleCase(slug),
        path: pathname,
      });

      break;
    }

    // --------------------------
    // Match
    // /match/123/arsenal-vs-chelsea
    // --------------------------
    case "match": {
      crumbs.push({
        name: "Fixtures",
        path: "/fixtures",
      });

      const slug = parts.slice(2).join("-");

      crumbs.push({
        name: titleCase(slug),
        path: pathname,
      });

      break;
    }

    // --------------------------
    // Everything else
    // --------------------------
    default:
      parts.forEach((part, index) => {
        crumbs.push({
          name: TITLES[part] || titleCase(part),
          path: "/" + parts.slice(0, index + 1).join("/"),
        });
      });
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="breadcrumbs-nav"
    >
      {crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1;

        return (
          <span key={crumb.path}>
            {index > 0 && (
              <span className="breadcrumbs-sep">
                /
              </span>
            )}

            {last ? (
              <span className="breadcrumbs-current">
                {crumb.name}
              </span>
            ) : (
              <Link
                to={crumb.path}
                className="breadcrumbs-link"
              >
                {crumb.name}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}