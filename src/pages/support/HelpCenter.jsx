// src/pages/support/HelpCenter.jsx

import SEO from "../../components/SEO";
import PageLayout from "../../components/PageLayout";
import Section from "../../components/Section";

export default function HelpCenter() {
  return (
    <>
      <SEO
        title="Help Center"
        description="Get help using ZOKASCORE, managing your account, troubleshooting issues, and contacting support."
        path="/help"
      />

      <PageLayout
        title="Help Center"
        subtitle="Find guides and troubleshooting tips for using ZOKASCORE."
      >
        <Section title="Getting Started">
          <p>
            Welcome to ZOKASCORE. You can explore live football scores,
            fixtures, predictions, standings, basketball updates, and
            highlights without creating an account. Some personalized features
            require signing in.
          </p>
        </Section>

        <Section title="Creating an Account">
          <ol>
            <li>Open the Login page.</li>
            <li>Select the option to create an account.</li>
            <li>Enter your email and password.</li>
            <li>Verify your email if prompted.</li>
            <li>Sign in to start using your account.</li>
          </ol>
        </Section>

        <Section title="Signing In">
          <p>
            If you already have an account, use your registered email address
            and password to sign in. If you cannot access your account, use the
            password reset option.
          </p>
        </Section>

        <Section title="Resetting Your Password">
          <p>
            On the Login page, select <strong>Forgot Password</strong> and
            follow the instructions sent to your registered email address.
          </p>
        </Section>

        <Section title="Managing Your Profile">
          <p>
            After signing in, you can update your profile information, manage
            your account settings, and access personalized features available on
            ZOKASCORE.
          </p>
        </Section>

        <Section title="Troubleshooting">
          <ul>
            <li>Refresh the page if live data appears outdated.</li>
            <li>Check your internet connection.</li>
            <li>Use the latest version of your web browser.</li>
            <li>Clear your browser cache if pages are not loading correctly.</li>
            <li>Try again later if a third-party service is temporarily unavailable.</li>
          </ul>
        </Section>

        <Section title="Reporting Bugs">
          <p>
            If you discover a bug, please include the following information when
            contacting us:
          </p>

          <ul>
            <li>The page where the issue occurred.</li>
            <li>Your browser and device.</li>
            <li>A description of what happened.</li>
            <li>Screenshots, if available.</li>
          </ul>
        </Section>

        <Section title="Incorrect Match Information">
          <p>
            While we work with trusted sports data providers, occasional delays
            or inaccuracies may occur. If you notice incorrect match
            information, let us know through our Contact page.
          </p>
        </Section>

        <Section title="Need More Help?">
          <p>
            If your question is not answered here, please visit our Contact page
            and we'll do our best to assist you as quickly as possible.
          </p>
        </Section>
      </PageLayout>
    </>
  );
}