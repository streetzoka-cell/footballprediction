// src/pages/company/Contact.jsx

import SEO from "../../components/SEO";
import PageLayout from "../../components/PageLayout";
import Section from "../../components/Section";

export default function Contact() {
  return (
    <>
      <SEO
        title="Contact Us"
        description="Get in touch with the ZOKASCORE team for support, partnerships, feedback, or business inquiries."
        path="/contact"
      />

      <PageLayout
        title="Contact ZOKASCORE"
        subtitle="We're always happy to hear from football fans, partners, and developers."
      >
        <Section title="General Support">
          <p>
            Need help with your account or have questions about ZOKASCORE?
            Our support team is here to assist you.
          </p>

          <p>
            <strong>Email:</strong> support@zokascore.xyz
          </p>

          <p>
            <strong>Response Time:</strong> Usually within 24–48 hours.
          </p>
        </Section>

        <Section title="Business & Partnerships">
          <p>
            Interested in advertising, sponsorships, API integrations, media,
            or strategic partnerships? We'd love to hear from you.
          </p>

          <p>
            <strong>Email:</strong> business@zokascore.xyz
          </p>
        </Section>

        <Section title="Report a Bug">
          <p>
            Found a bug or noticed incorrect match information? Please let us
            know so we can investigate and improve the platform.
          </p>

          <p>
            Include as much detail as possible, such as:
          </p>

          <ul>
            <li>Page URL</li>
            <li>Device or browser</li>
            <li>Screenshots (if available)</li>
            <li>Description of the issue</li>
          </ul>
        </Section>

        <Section title="Feature Requests">
          <p>
            Have an idea that could improve ZOKASCORE? We welcome suggestions
            from our community and regularly review user feedback when planning
            new features.
          </p>
        </Section>

        <Section title="Founder">
          <p>
            <strong>Kimutai Gibson</strong>
          </p>

          <p>
            Founder & Lead Developer of ZOKASCORE.
          </p>

          <p>
            ZOKASCORE is independently developed with a focus on delivering
            fast, reliable, and modern sports experiences for football fans
            around the world.
          </p>
        </Section>

        <Section title="Follow ZOKASCORE">
          <p>
            Official social media accounts will be announced as they become
            available. Follow us for product updates, feature releases, and
            sports news.
          </p>
        </Section>
      </PageLayout>
    </>
  );
}