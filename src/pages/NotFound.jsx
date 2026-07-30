import { Link } from "react-router-dom";
import SEO from "../components/SEO";
import PageLayout from "../components/PageLayout";

export default function NotFound() {
  return (
    <>
     <SEO
  title="404 - Page Not Found"
  description="The page you're looking for doesn't exist, may have been moved, or the URL may be incorrect. Return to the ZOKASCORE homepage to continue exploring football fixtures, live scores, predictions, and standings."
  keywords="404, page not found, missing page, broken link, ZOKASCORE"
  robots="noindex,nofollow"
  breadcrumbs={[
    { name: "Home", path: "/" },
    { name: "404" }
  ]}
/>
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