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
};

export default function Breadcrumbs() {
  const { pathname } = useLocation();

  if (pathname === "/") return null;

  const parts = pathname.split("/").filter(Boolean);

  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        maxWidth: 1300,
        margin: "0 auto",
        padding: "18px 20px 0",
        fontSize: ".9rem",
      }}
    >
      <Link to="/" style={{ color: "#60a5fa", textDecoration: "none" }}>
        Home
      </Link>

      {parts.map((part, index) => {
        const url = "/" + parts.slice(0, index + 1).join("/");
        const last = index === parts.length - 1;

        return (
          <span key={url}>
            {" / "}
            {last ? (
              <span style={{ color: "#ffffff" }}>
                {TITLES[part] || decodeURIComponent(part)}
              </span>
            ) : (
              <Link to={url} style={{ color: "#60a5fa", textDecoration: "none" }}>
                {TITLES[part] || decodeURIComponent(part)}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}