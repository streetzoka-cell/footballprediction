import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { generateBreadcrumbs } from "../utils/seoBuilder";

export default function Breadcrumbs() {
  const { pathname } = useLocation();

  // Don't show breadcrumbs on the homepage
  if (pathname === "/") return null;

  const crumbs = generateBreadcrumbs(pathname);

  // ★ FIX: Removed the JSON-LD <script> tag from here.
  // SEO.jsx already injects the BreadcrumbList schema into the <head> globally.
  // Keeping it here caused Google to see TWO identical schemas (Duplicate Breadcrumbs).

  return (
    <div className="breadcrumbs-wrap">
      <nav aria-label="Breadcrumb" className="breadcrumbs-nav">
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            const isFirst = index === 0;

            return (
              <li
                key={`${crumb.path}-${index}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--sp-4)",
                }}
              >
                {index > 0 && (
                  <ChevronRight
                    size={12}
                    style={{
                      color: "var(--text-muted)",
                      opacity: 0.4,
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  />
                )}

                {isFirst && !last && (
                  <Home
                    size={12}
                    style={{
                      color: "var(--accent)",
                      flexShrink: 0,
                      marginRight: "var(--sp-4)",
                    }}
                    aria-hidden="true"
                  />
                )}

                {last ? (
                  <span className="breadcrumbs-current" aria-current="page">
                    {crumb.name}
                  </span>
                ) : (
                  <Link to={crumb.path} className="breadcrumbs-link">
                    {isFirst && !crumb.name ? "Home" : crumb.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}