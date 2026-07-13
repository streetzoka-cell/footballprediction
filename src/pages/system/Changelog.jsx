// src/pages/system/Changelog.jsx

import SEO from "../../components/SEO";
import PageLayout from "../../components/PageLayout";
import Section from "../../components/Section";

const releases = [
  {
    version: "2.0.0",
    date: "July 2026",
    features: [
      "Complete application redesign",
      "Advanced SEO optimization",
      "Improved routing and lazy loading",
      "New legal and support pages",
      "Performance improvements",
      "Better mobile responsiveness",
    ],
  },
  {
    version: "1.5.0",
    date: "June 2026",
    features: [
      "Football predictions",
      "Leaderboard improvements",
      "Basketball coverage",
      "Authentication improvements",
      "Profile enhancements",
    ],
  },
  {
    version: "1.2.0",
    date: "May 2026",
    features: [
      "Live football fixtures",
      "League standings",
      "Match highlights",
      "UI improvements",
    ],
  },
  {
    version: "1.0.0",
    date: "Initial Release",
    features: [
      "ZOKASCORE officially launched",
      "Live scores",
      "Fixtures",
      "User accounts",
    ],
  },
];

export default function Changelog() {
  return (
    <>
      <SEO
        title="Changelog"
        description="Track new features, improvements and updates released for ZOKASCORE."
        path="/changelog"
      />

      <PageLayout
        title="Changelog"
        subtitle="Follow the latest improvements and new features released on ZOKASCORE."
      >
        <Section title="Release History">
          <div
            style={{
              display: "grid",
              gap: 24,
            }}
          >
            {releases.map((release) => (
              <div
                key={release.version}
                style={{
                  background: "#101b2d",
                  border: "1px solid rgba(255,255,255,.08)",
                  borderRadius: 12,
                  padding: 24,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 10,
                    marginBottom: 16,
                  }}
                >
                  <h2
                    style={{
                      margin: 0,
                      fontSize: "1.4rem",
                    }}
                  >
                    Version {release.version}
                  </h2>

                  <span
                    style={{
                      color: "#9fb3c8",
                    }}
                  >
                    {release.date}
                  </span>
                </div>

                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 22,
                    lineHeight: 2,
                  }}
                >
                  {release.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Continuous Improvement">
          <p>
            ZOKASCORE is continuously evolving. We regularly improve
            performance, expand sports coverage, introduce new features,
            strengthen security, and enhance the overall user experience.
          </p>
        </Section>
      </PageLayout>
    </>
  );
}