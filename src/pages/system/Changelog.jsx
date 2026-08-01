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
];

export default function Changelog() {
  return (
    <>
      <SEO
        title="What's New, Updates & Release Notes"
        description="Stay up to date with the latest ZOKASCORE features, improvements, bug fixes, performance enhancements, and platform updates."
        keywords="ZOKASCORE changelog, release notes, updates, new features, bug fixes, platform improvements, version history"
        robots="index,follow"
          />

      <PageLayout title="Changelog" subtitle="Follow the latest improvements and new features released on ZOKASCORE.">
        <Section title="Release History">
          <div className="flex-col gap-16">
            {releases.map((release) => (
              <div key={release.version} className="glass-card p-24">
                <div className="flex-between flex-wrap gap-10 mb-16">
                  <h2 className="text-primary font-extrabold text-md">Version {release.version}</h2>
                  <span className="text-muted text-sm">{release.date}</span>
                </div>
                <ul className="flex-col gap-8 text-secondary text-sm pl-16">
                  {release.features.map((feature) => (
                    <li key={feature} className="list-disc">{feature}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Continuous Improvement">
          <p className="text-secondary text-sm">
            ZOKASCORE is continuously evolving. We regularly improve performance, expand sports coverage, introduce new features, strengthen security, and enhance the overall user experience.
          </p>
        </Section>
      </PageLayout>
    </>
  );
}