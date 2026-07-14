import { Link } from "react-router-dom";
import SEO from "../components/SEO";
import PageLayout from "../components/PageLayout";
import './Pages.css';

export default function NotFound() {
  return (
    <>
      <SEO
        title="404 - Page Not Found"
        description="The page you're looking for doesn't exist or may have been moved."
        path="/404"
        robots="noindex,nofollow"
      />

      <PageLayout
        title="404"
        subtitle="Sorry, the page you were looking for could not be found."
      >
        <div className="not-found-content">
          <h1 className="not-found-code">404</h1>
          <h2 className="not-found-title">
            Oops! This page doesn't exist.
          </h2>

          <p className="not-found-desc">
            The page may have been moved, deleted, or you may have entered an
            incorrect address.
          </p>

          <div className="not-found-actions">
            <Link to="/" className="not-found-btn not-found-btn-home">
              Go Home
            </Link>

            <Link to="/fixtures" className="not-found-btn not-found-btn-fixtures">
              Today's Fixtures
            </Link>

            <Link to="/predictions" className="not-found-btn not-found-btn-predictions">
              Predictions
            </Link>
          </div>
        </div>
      </PageLayout>
    </>
  );
}