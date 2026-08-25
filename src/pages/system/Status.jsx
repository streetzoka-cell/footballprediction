// footballprediction/src/pages/system/Status.jsx

import SEO from "../../components/SEO";
import PageLayout from "../../components/PageLayout";
import Section from "../../components/Section";

export default function Status() {
  const updated = "July 13, 2026";

  const services = [
    { name: "Website", status: "Operational", description: "The main ZOKASCORE website is running normally." },
    { name: "Live Scores", status: "Operational", description: "Live football scores are updating normally." },
    { name: "Football Predictions", status: "Operational", description: "Prediction services are available." },
    { name: "Basketball Coverage", status: "Operational", description: "Basketball fixtures and scores are available." },
    { name: "Authentication", status: "Operational", description: "User login and registration are working normally." },
    { name: "Database", status: "Operational", description: "User data and application data are accessible." },
  ];

  return (
    <>
      <SEO
        title="System Status & Service Health"
        description="Check the real-time status of ZOKASCORE services, including API availability, live scores, fixtures, predictions, scheduled jobs, and platform performance."
        keywords="ZOKASCORE status, system status, service health, API status, live scores status, football platform status, uptime, service monitoring"
        robots="index,follow"
      />

      <PageLayout title="System Status" subtitle={`Last updated: ${updated}`}>
        <Section title="Current Status">
          <p className="text-secondary text-sm leading-relaxed">All major ZOKASCORE services are currently operating normally.</p>
        </Section>

        <Section title="Service Health">
          <div className="flex flex-col gap-12">
            {services.map((service) => (
              <div key={service.name} className="company-card">
                <div className="flex-between items-center mb-8">
                  <strong className="text-primary text-sm">{service.name}</strong>
                  <span className="badge badge-success">
                    <span className="zk-live-pulse-dot mr-2" style={{ background: 'var(--success)' }} /> {service.status}
                  </span>
                </div>
                <p className="text-muted text-xs">{service.description}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Incident Reporting">
          <p className="text-secondary text-sm leading-relaxed">
            If you experience issues with ZOKASCORE that are not listed here, please report them through our Contact page. We investigate all reported service interruptions and work to resolve them as quickly as possible.
          </p>
        </Section>
      </PageLayout>
    </>
  );
}