import { Link, useLocation } from "react-router-dom";

const TITLES = {
  fixtures: "Fixtures", predictions: "Predictions", mastergames: "Master Games", basketball: "Basketball",
  highlights: "Highlights", livestream: "Live Stream", leaderboard: "Leaderboard", profile: "Profile",
  login: "Login", about: "About", privacy: "Privacy Policy", terms: "Terms of Service", faq: "FAQ",
  help: "Help Center", "help-center": "Help Center", match: "Match Details", team: "Team",
  careers: "Careers", contact: "Contact", partners: "Partners", advertise: "Advertise",
};

export default function Breadcrumbs() {
  const { pathname } = useLocation();
  if (pathname === "/") return null;

  const parts = pathname.split("/").filter(Boolean);

  if (parts[0] === "match") {
    return (
      <nav aria-label="Breadcrumb" className="breadcrumbs-nav">
        <Link to="/" className="breadcrumbs-link">Home</Link>
        <span className="breadcrumbs-sep">/</span>
        <span className="breadcrumbs-current">Match Details</span>
      </nav>
    );
  }

  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs-nav">
      <Link to="/" className="breadcrumbs-link">Home</Link>
      {parts.map((part, index) => {
        const url = "/" + parts.slice(0, index + 1).join("/");
        const last = index === parts.length - 1;
        const title = TITLES[part] || decodeURIComponent(part).replace(/-/g, " ");
        return (
          <span key={url}>
            <span className="breadcrumbs-sep">/</span>
            {last ? (
              <span className="breadcrumbs-current">{title}</span>
            ) : (
              <Link to={url} className="breadcrumbs-link">{title}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}