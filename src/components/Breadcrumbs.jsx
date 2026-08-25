import { Link } from "react-router-dom";
import { generateBreadcrumbs } from "../utils/seoBuilder";


export default function Breadcrumbs({ path, customCrumbs, className }) {
  const crumbs = customCrumbs || generateBreadcrumbs(path);

  if (!crumbs || crumbs.length <= 1) return null;

  return (
    <nav
      className={`breadcrumbs-nav${className ? " " + className : ""}`}
      aria-label="Breadcrumb navigation"
    >
      <ol className="breadcrumbs-list" itemScope itemType="https://schema.org/BreadcrumbList">
        {crumbs.map((crumb, index) => (
          <li
            key={`${crumb.path}-${index}`}
            className={`breadcrumbs-item${index === crumbs.length - 1 ? " breadcrumbs-item--active" : ""}`}
            itemProp="itemListElement"
            itemScope
            itemType="https://schema.org/ListItem"
          >
            {index < crumbs.length - 1 ? (
              <Link
                to={crumb.path}
                className="breadcrumbs-link"
                itemProp="item"
              >
                <span itemProp="name">{crumb.name}</span>
              </Link>
            ) : (
              <span className="breadcrumbs-current" itemProp="name" aria-current="page">
                {crumb.name}
              </span>
            )}
            <meta itemProp="position" content={String(index + 1)} />
            {index < crumbs.length - 1 && (
              <span className="breadcrumbs-separator" aria-hidden="true">›</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
