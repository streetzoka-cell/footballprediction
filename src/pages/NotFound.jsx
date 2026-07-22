import { Link } from "react-router-dom";
import SEO from "../components/SEO";
import PageLayout from "../components/PageLayout";

export default function NotFound() {
  return (
    <>
      <SEO title="404 - Page Not Found | ZOKASCORE" description="The page you are looking for doesn't exist or may have been moved. Check the URL or navigate back to the ZOKASCORE homepage to find what you need." keywords="404 page not found, broken link, missing page, ZOKASCORE error" path="/404" robots="noindex,nofollow" />
      <PageLayout title="404" subtitle="Sorry, the page you were looking for could not be found.">
        <div className="info-404">
          <h1 className="info-404-num">404</h1>
          <h2 className="info-404-title">Oops! This page doesn't exist.</h2>
          <p className="info-404-desc">The page may have been moved, deleted, or you may have entered an incorrect address.</p>
          <div className="info-404-btns">
            <Link to="/" className="info-404-btn-primary">Go Home</Link>
            <Link to="/fixtures" className="info-404-btn-secondary">Today's Fixtures</Link>
            <Link to="/predictions" className="info-404-btn-secondary">Predictions</Link>
          </div>
        </div>
      </PageLayout>
    </>
  );
}