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
  match: "Match Details", // Added for dynamic match pages
  // Company pages
  team: "Team",
  careers: "Careers",
  contact: "Contact",
  partners: "Partners",
  advertise: "Advertise",
};

export default function Breadcrumbs() {
  const { pathname } = useLocation();

  if (pathname === "/") return null;

  const parts = pathname.split("/").filter(Boolean);

  // ★ FIX: Handle dynamic match pages cleanly (e.g., /match/12345/arsenal-vs-chelsea -> Home / Match Details)
  if (parts[0] === "match") {
    return (
      <nav 
        aria-label="Breadcrumb" 
        style={{
          maxWidth: 1300,
          margin: "0 auto",
          padding: "18px 20px 0",
          fontSize: ".85rem",
          color: "var(--text-muted)"
        }}
      >
        <Link to="/" style={{ color: "var(--blue, #60a5fa)", textDecoration: "none" }}>
          Home
        </Link>
        <span style={{ margin: "0 8px", opacity: 0.5 }}>/</span>
        <span style={{ color: "var(--text-primary, #ffffff)" }}>
          Match Details
        </span>
      </nav>
    );
  }

  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        maxWidth: 1300,
        margin: "0 auto",
        padding: "18px 20px 0",
        fontSize: ".85rem",
        color: "var(--text-muted)"
      }}
    >
      <Link to="/" style={{ color: "var(--blue, #60a5fa)", textDecoration: "none" }}>
        Home
      </Link>

      {parts.map((part, index) => {
        const url = "/" + parts.slice(0, index + 1).join("/");
        const last = index === parts.length - 1;
        
        // Format the title (use TITLES map, or fallback to replacing hyphens with spaces)
        const title = TITLES[part] || decodeURIComponent(part).replace(/-/g, " ");

        return (
          <span key={url}>
            <span style={{ margin: "0 8px", opacity: 0.5 }}>/</span>
            {last ? (
              <span style={{ color: "var(--text-primary, #ffffff)", textTransform: "capitalize" }}>
                {title}
              </span>
            ) : (
              <Link 
                to={url} 
                style={{ 
                  color: "var(--blue, #60a5fa)", 
                  textDecoration: "none", 
                  textTransform: "capitalize" 
                }}
              >
                {title}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}