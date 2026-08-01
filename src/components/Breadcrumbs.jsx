// src/components/Breadcrumbs.jsx
import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { generateBreadcrumbs } from "../utils/seoBuilder";

export default function Breadcrumbs() {
  const { pathname } = useLocation();

  if (pathname === "/") return null;

  const crumbs = generateBreadcrumbs(pathname);

  return (
    <nav
      aria-label="Breadcrumb"
      className="breadcrumbs-nav"
    >
      {crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1;
        const isFirst = index === 0;

        return (
          <span
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
              />
            )}

            {last ? (
              <span
                className="breadcrumbs-current"
                aria-current="page"
              >
                {crumb.name}
              </span>
            ) : (
              <Link
                to={crumb.path}
                className="breadcrumbs-link"
              >
                {isFirst && !crumb.name ? "Home" : crumb.name}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}