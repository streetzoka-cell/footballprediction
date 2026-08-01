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
        breadcrumbs={[{ name: "Home", path: "/" }, { name: "404" }]}
      />
      <PageLayout title="404" subtitle="Sorry, the page you were looking for could not be found.">
        <div className="glass-card flex-col items-center gap-12 p-32 text-center">
          <h1 className="text-primary font-extrabold" style={{ fontSize: '8rem', lineHeight: 1, textShadow: '0 0 40px rgba(var(--primary-rgb), 0.3)' }}>404</h1>
          <h2 className="text-primary font-bold text-md">Oops! This page doesn't exist.</h2>
          <p className="text-muted text-sm">The page may have been moved, deleted, or you may have entered an incorrect address.</p>
          <div className="flex gap-8 mt-8">
            <Link to="/" className="btn btn-primary">Go Home</Link>
            <Link to="/fixtures" className="btn btn-secondary">Today's Fixtures</Link>
            <Link to="/predictions" className="btn btn-ghost">Predictions</Link>
          </div>
        </div>
      </PageLayout>
    </>
  );
}