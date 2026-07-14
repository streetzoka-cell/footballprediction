import { Link } from "react-router-dom";
import SEO from "../components/SEO";
import PageLayout from "../components/PageLayout";

export default function NotFound() {
  return (
    <>
      <SEO
        title="404 - Page Not Found | ZOKASCORE"
        description="The page you are looking for doesn't exist or may have been moved. Check the URL or navigate back to the ZOKASCORE homepage to find what you need."
        keywords="404 page not found, broken link, missing page, ZOKASCORE error"
        path="/404"
        robots="noindex,nofollow"
      />

      <PageLayout
        title="404"
        subtitle="Sorry, the page you were looking for could not be found."
      >
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '40vh',
        }}>
          <h1 style={{
            fontSize: '8rem',
            fontWeight: 900,
            margin: 0,
            lineHeight: 1,
            color: 'var(--accent)', // Green
            textShadow: '0 0 40px rgba(0,230,118,.3)',
          }}>
            404
          </h1>

          <h2 style={{
            fontSize: '1.8rem',
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: '16px 0 8px',
          }}>
            Oops! This page doesn't exist.
          </h2>

          <p style={{
            fontSize: '1.1rem',
            color: 'var(--text-muted)',
            marginBottom: 40,
            maxWidth: 450,
          }}>
            The page may have been moved, deleted, or you may have entered an incorrect address.
          </p>

          <div style={{
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}>
            <Link to="/" style={{
              padding: '14px 28px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, #00e676 0%, #00c853 100%)',
              color: '#0a0e14',
              fontWeight: 800,
              textDecoration: 'none',
              fontSize: '1rem',
              boxShadow: '0 4px 14px rgba(0,230,118,.3)',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}>
              Go Home
            </Link>

            <Link to="/fixtures" style={{
              padding: '14px 28px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.06)',
              border: '1.5px solid rgba(255,255,255,0.1)',
              color: 'var(--text-primary)',
              fontWeight: 700,
              textDecoration: 'none',
              fontSize: '1rem',
              transition: 'transform 0.2s, background 0.2s',
            }}>
              Today's Fixtures
            </Link>

            <Link to="/predictions" style={{
              padding: '14px 28px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.06)',
              border: '1.5px solid rgba(255,255,255,0.1)',
              color: 'var(--text-primary)',
              fontWeight: 700,
              textDecoration: 'none',
              fontSize: '1rem',
              transition: 'transform 0.2s, background 0.2s',
            }}>
              Predictions
            </Link>
          </div>
        </div>
      </PageLayout>
    </>
  );
}