import { Link } from "react-router-dom";
import SEO from "../components/SEO";
import PageLayout from "../components/PageLayout";

export default function NotFound() {
  return (
    <>
      <SEO title="404 - Page Not Found" robots="noindex,nofollow" />
      <PageLayout title="404" subtitle="Sorry, the page you were looking for could not be found.">
        <div className="company-hero-card">
          <h1 className="nf-404">404</h1>
          <h2 className="text-primary font-bold text-md">Oops! This page doesn't exist.</h2>
          <p className="text-muted text-sm">The page may have been moved, deleted, or you may have entered an incorrect address.</p>
          <div className="flex gap-8 mt-8 flex-wrap justify-center">
            <Link to="/" className="btn btn-primary">Go Home</Link>
            <Link to="/fixtures" className="btn btn-secondary">Today's Fixtures</Link>
            <Link to="/predictions" className="btn btn-ghost">Predictions</Link>
          </div>
        </div>
      </PageLayout>
    </>
  );
}