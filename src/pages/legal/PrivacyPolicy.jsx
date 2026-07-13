// src/pages/legal/PrivacyPolicy.jsx

import SEO from "../../components/SEO";
import PageLayout from "../../components/PageLayout";
import Section from "../../components/Section";

export default function PrivacyPolicy() {
  const updated = "July 13, 2026";

  return (
    <>
      <SEO
        title="Privacy Policy"
        description="Read how ZOKASCORE collects, uses, protects and manages your information."
        path="/privacy"
      />

      <PageLayout
        title="Privacy Policy"
        subtitle={`Last updated: ${updated}`}
      >
        <Section title="Introduction">
          <p>
            Welcome to ZOKASCORE. We value your privacy and are committed to
            protecting your personal information. This Privacy Policy explains
            what information we collect, how we use it, and the choices you
            have regarding your data when using our website and services.
          </p>
        </Section>

        <Section title="Information We Collect">
          <ul>
            <li>Account information you provide when registering.</li>
            <li>Email address used for authentication.</li>
            <li>Profile information you choose to add.</li>
            <li>Technical information such as browser type and device.</li>
            <li>Usage information to improve our services.</li>
          </ul>
        </Section>

        <Section title="How We Use Your Information">
          <ul>
            <li>Provide access to your account.</li>
            <li>Display personalized content.</li>
            <li>Improve website performance and reliability.</li>
            <li>Respond to support requests.</li>
            <li>Protect the platform from abuse and fraud.</li>
          </ul>
        </Section>

        <Section title="Authentication">
          <p>
            ZOKASCORE uses Firebase Authentication to securely manage user
            sign-in and account access. Passwords are not stored directly by
            ZOKASCORE.
          </p>
        </Section>

        <Section title="Data Storage">
          <p>
            User data is securely stored using Firebase services. Appropriate
            security measures are used to help protect information from
            unauthorized access, alteration, or disclosure.
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            We may use cookies or similar technologies to remember preferences,
            improve performance, and enhance your experience while using
            ZOKASCORE.
          </p>
        </Section>

        <Section title="Third-Party Services">
          <p>
            ZOKASCORE may use trusted third-party providers for authentication,
            analytics, hosting, and sports data. These providers process data
            according to their own privacy policies.
          </p>
        </Section>

        <Section title="Your Rights">
          <ul>
            <li>Access your information.</li>
            <li>Request corrections where appropriate.</li>
            <li>Delete your account, subject to applicable requirements.</li>
            <li>Contact us with privacy-related questions.</li>
          </ul>
        </Section>

        <Section title="Children's Privacy">
          <p>
            ZOKASCORE is not intended for children under 13 years of age. We do
            not knowingly collect personal information from children under 13.
          </p>
        </Section>

        <Section title="Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. Any changes
            will be published on this page with an updated revision date.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            If you have questions regarding this Privacy Policy, please contact
            the ZOKASCORE team through our Contact page.
          </p>
        </Section>
      </PageLayout>
    </>
  );
}