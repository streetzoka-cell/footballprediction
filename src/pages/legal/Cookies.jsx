// src/pages/legal/Cookies.jsx

import SEO from "../../components/SEO";
import PageLayout from "../../components/PageLayout";
import Section from "../../components/Section";

export default function Cookies() {
  const updated = "July 13, 2026";

  return (
    <>
      <SEO
        title="Cookie Policy"
        description="Learn how ZOKASCORE uses cookies and similar technologies to improve your experience."
        path="/cookies"
      />

      <PageLayout
        title="Cookie Policy"
        subtitle={`Last updated: ${updated}`}
      >
        <Section title="What Are Cookies?">
          <p>
            Cookies are small text files stored on your device when you visit a
            website. They help websites remember information such as your
            preferences and improve your browsing experience.
          </p>
        </Section>

        <Section title="How ZOKASCORE Uses Cookies">
          <p>
            ZOKASCORE uses cookies and similar technologies to provide a secure,
            reliable, and personalized experience.
          </p>

          <ul>
            <li>Keep you signed in to your account.</li>
            <li>Remember your preferences.</li>
            <li>Improve website performance.</li>
            <li>Enhance security.</li>
            <li>Understand how our services are used.</li>
          </ul>
        </Section>

        <Section title="Types of Cookies">
          <h3>Essential Cookies</h3>
          <p>
            Required for core website functionality such as authentication,
            navigation, and security.
          </p>

          <h3>Preference Cookies</h3>
          <p>
            Store settings such as language, theme, or other user preferences.
          </p>

          <h3>Performance Cookies</h3>
          <p>
            Help us understand how visitors use ZOKASCORE so we can improve
            speed, reliability, and usability.
          </p>
        </Section>

        <Section title="Third-Party Services">
          <p>
            Some trusted third-party services used by ZOKASCORE may also use
            cookies or similar technologies to provide authentication, hosting,
            analytics, or sports data.
          </p>
        </Section>

        <Section title="Managing Cookies">
          <p>
            Most web browsers allow you to control or delete cookies through
            your browser settings. Disabling certain cookies may affect some
            features of ZOKASCORE.
          </p>
        </Section>

        <Section title="Updates to This Policy">
          <p>
            We may update this Cookie Policy from time to time. Any changes will
            be posted on this page with an updated revision date.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            If you have questions regarding this Cookie Policy, please contact
            us through the ZOKASCORE Contact page.
          </p>
        </Section>
      </PageLayout>
    </>
  );
}