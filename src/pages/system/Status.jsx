// src/pages/system/Status.jsx

import SEO from "../../components/SEO";
import PageLayout from "../../components/PageLayout";
import Section from "../../components/Section";

export default function Status() {
  const updated = "July 13, 2026";

  const services = [
    {
      name: "Website",
      status: "Operational",
      description: "The main ZOKASCORE website is running normally.",
    },
    {
      name: "Live Scores",
      status: "Operational",
      description: "Live football scores are updating normally.",
    },
    {
      name: "Football Predictions",
      status: "Operational",
      description: "Prediction services are available.",
    },
    {
      name: "Basketball Coverage",
      status: "Operational",
      description: "Basketball fixtures and scores are available.",
    },
    {
      name: "Authentication",
      status: "Operational",
      description: "User login and registration are working normally.",
    },
    {
      name: "Database",
      status: "Operational",
      description: "User data and application data are accessible.",
    },
  ];

  return (
    <>
      <SEO
        title="System Status"
        description="Check the current operational status of ZOKASCORE services."
        path="/status"
      />

      <PageLayout
        title="System Status"
        subtitle={`Last updated: ${updated}`}
      >
        <Section title="Current Status">
          <p>
            All major ZOKASCORE services are currently operating normally.
          </p>
        </Section>

        <Section title="Service Health">
          <div
            style={{
              display: "grid",
              gap: 16,
            }}
          >
            {services.map((service) => (
              <div
                key={service.name}
                style={{
                  background: "#101b2d",
                  border: "1px solid rgba(255,255,255,.08)",
                  borderRadius: 12,
                  padding: 20,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <strong>{service.name}</strong>

                  <span
                    style={{
                      color: "#22c55e",
                      fontWeight: 700,
                    }}
                  >
                    ● {service.status}
                  </span>
                </div>

                <p
                  style={{
                    margin: 0,
                    color: "#b8c4d6",
                  }}
                >
                  {service.description}
                </p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Incident Reporting">
          <p>
            If you experience issues with ZOKASCORE that are not listed here,
            please report them through our Contact page. We investigate all
            reported service interruptions and work to resolve them as quickly
            as possible.
          </p>
        </Section>

        <Section title="Maintenance">
          <p>
            Planned maintenance may occasionally affect some services. Whenever
            possible, scheduled maintenance will be announced in advance.
          </p>
        </Section>
      </PageLayout>
    </>
  );
}