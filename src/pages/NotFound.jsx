// src/pages/NotFound.jsx

import { Link } from "react-router-dom";

import SEO from "../components/SEO";
import PageLayout from "../components/PageLayout";

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
        <div
          style={{
            textAlign: "center",
            maxWidth: 700,
            margin: "0 auto",
          }}
        >
          <h2
            style={{
              fontSize: "2rem",
              marginBottom: 20,
            }}
          >
            Oops! This page doesn't exist.
          </h2>

          <p
            style={{
              color: "#b8c4d6",
              lineHeight: 1.8,
              marginBottom: 40,
            }}
          >
            The page may have been moved, deleted, or you may have entered an
            incorrect address.
          </p>

          <div
            style={{
              display: "flex",
              gap: 16,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link
              to="/"
              style={{
                background: "#2563eb",
                color: "#fff",
                padding: "14px 24px",
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Go Home
            </Link>

            <Link
              to="/fixtures"
              style={{
                background: "#16a34a",
                color: "#fff",
                padding: "14px 24px",
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Today's Fixtures
            </Link>

            <Link
              to="/predictions"
              style={{
                background: "#9333ea",
                color: "#fff",
                padding: "14px 24px",
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Predictions
            </Link>
          </div>
        </div>
      </PageLayout>
    </>
  );
}