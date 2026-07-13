// src/pages/legal/Disclaimer.jsx

import SEO from "../../components/SEO";
import PageLayout from "../../components/PageLayout";
import Section from "../../components/Section";

export default function Disclaimer() {
  const updated = "July 13, 2026";

  return (
    <>
      <SEO
        title="Disclaimer"
        description="Read the ZOKASCORE disclaimer regarding football predictions, live scores and sports information."
        path="/disclaimer"
      />

      <PageLayout
        title="Disclaimer"
        subtitle={`Last updated: ${updated}`}
      >
        <Section title="General Information">
          <p>
            The information provided on ZOKASCORE is published for general
            informational and entertainment purposes. While we strive to keep
            information accurate and up to date, we make no guarantees regarding
            the completeness, accuracy, reliability, or availability of any
            content.
          </p>
        </Section>

        <Section title="Football Predictions">
          <p>
            Match predictions, betting insights, probability ratings, and other
            analytical content represent opinions based on available data.
            Sporting events are unpredictable, and no prediction can guarantee
            an outcome.
          </p>

          <p>
            Users should make their own decisions and should not rely solely on
            information provided by ZOKASCORE.
          </p>
        </Section>

        <Section title="Responsible Gambling">
          <p>
            If you use our predictions for betting purposes, please do so
            responsibly. Never bet money you cannot afford to lose.
          </p>

          <p>
            ZOKASCORE does not encourage irresponsible gambling and is not
            responsible for financial losses resulting from betting decisions.
          </p>
        </Section>

        <Section title="Live Scores & Statistics">
          <p>
            Live scores, statistics, standings, fixtures, and other sports data
            may be supplied by third-party providers. Although we aim to provide
            timely updates, delays or inaccuracies may occasionally occur.
          </p>
        </Section>

        <Section title="External Links">
          <p>
            Our platform may contain links to third-party websites or services.
            We do not control or endorse their content and are not responsible
            for their availability, security, or privacy practices.
          </p>
        </Section>

        <Section title="Limitation of Liability">
          <p>
            To the maximum extent permitted by applicable law, ZOKASCORE and its
            owner shall not be liable for any direct, indirect, incidental, or
            consequential damages arising from the use of this platform.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            This Disclaimer may be updated periodically. Continued use of
            ZOKASCORE after changes are published constitutes acceptance of the
            updated version.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            If you have any questions regarding this Disclaimer, please contact
            us through the ZOKASCORE Contact page.
          </p>
        </Section>
      </PageLayout>
    </>
  );
}