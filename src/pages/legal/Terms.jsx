// src/pages/legal/Terms.jsx

import SEO from "../../components/SEO";
import PageLayout from "../../components/PageLayout";
import Section from "../../components/Section";

export default function Terms() {
  const updated = "July 13, 2026";

  return (
    <>
      <SEO
        title="Terms of Service"
        description="Read the terms and conditions governing the use of ZOKASCORE."
        path="/terms"
      />

      <PageLayout
        title="Terms of Service"
        subtitle={`Last updated: ${updated}`}
      >
        <Section title="Acceptance of Terms">
          <p>
            By accessing or using ZOKASCORE, you agree to these Terms of
            Service. If you do not agree with any part of these terms, you
            should not use our platform.
          </p>
        </Section>

        <Section title="About ZOKASCORE">
          <p>
            ZOKASCORE is a sports platform that provides football and
            basketball information including live scores, fixtures,
            standings, predictions, statistics, highlights, and related
            content.
          </p>
        </Section>

        <Section title="User Accounts">
          <ul>
            <li>You are responsible for maintaining your account security.</li>
            <li>Provide accurate information during registration.</li>
            <li>Do not share your account credentials.</li>
            <li>You are responsible for activities performed using your account.</li>
          </ul>
        </Section>

        <Section title="Acceptable Use">
          <ul>
            <li>Use ZOKASCORE lawfully and responsibly.</li>
            <li>Do not attempt unauthorized access to our systems.</li>
            <li>Do not interfere with platform security or availability.</li>
            <li>Do not upload harmful, illegal, or malicious content.</li>
            <li>Respect other users and applicable laws.</li>
          </ul>
        </Section>

        <Section title="Predictions">
          <p>
            Football predictions and analysis published on ZOKASCORE are
            provided for informational and entertainment purposes only. They
            should not be considered guarantees of future results.
          </p>
        </Section>

        <Section title="Intellectual Property">
          <p>
            Unless otherwise stated, the ZOKASCORE name, branding, design,
            logos, graphics, and original content are the property of
            ZOKASCORE and may not be copied, redistributed, or reproduced
            without permission.
          </p>
        </Section>

        <Section title="Availability">
          <p>
            We strive to provide reliable services but cannot guarantee that
            ZOKASCORE will always be available without interruption or that
            all sports data will always be complete or error-free.
          </p>
        </Section>

        <Section title="Third-Party Services">
          <p>
            ZOKASCORE may integrate third-party authentication, hosting,
            analytics, or sports data providers. We are not responsible for
            services operated by third parties.
          </p>
        </Section>

        <Section title="Termination">
          <p>
            We reserve the right to suspend or terminate accounts that
            violate these Terms or misuse the platform.
          </p>
        </Section>

        <Section title="Changes to These Terms">
          <p>
            These Terms of Service may be updated periodically. Continued use
            of ZOKASCORE after changes are published constitutes acceptance
            of the updated terms.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions regarding these Terms of Service can be submitted
            through our Contact page.
          </p>
        </Section>
      </PageLayout>
    </>
  );
}