
// src/pages/support/FAQ.jsx

import SEO from "../../components/SEO";
import PageLayout from "../../components/PageLayout";
import Section from "../../components/Section";

export default function FAQ() {
  return (
    <>
      <SEO
        title="Frequently Asked Questions"
        description="Find answers to common questions about ZOKASCORE, live scores, football predictions, accounts, and sports coverage."
        path="/faq"
      />

      <PageLayout
        title="Frequently Asked Questions"
        subtitle="Everything you need to know about ZOKASCORE."
      >
        <Section title="What is ZOKASCORE?">
          <p>
            ZOKASCORE is a modern sports platform that provides live football
            scores, today's fixtures, predictions, league standings,
            basketball coverage, match statistics, highlights, and more.
          </p>
        </Section>

        <Section title="Is ZOKASCORE free to use?">
          <p>
            Yes. Most features on ZOKASCORE are available free of charge.
            Additional premium features may be introduced in the future.
          </p>
        </Section>

        <Section title="How often are live scores updated?">
          <p>
            Live scores and match information are updated as quickly as
            possible using trusted sports data providers.
          </p>
        </Section>

        <Section title="How are football predictions generated?">
          <p>
            Predictions are based on available match data, historical
            performance, team form, statistics, and other analytical
            information. They are provided for informational purposes only.
          </p>
        </Section>

        <Section title="Are predictions guaranteed?">
          <p>
            No. Football is unpredictable, and no prediction can guarantee
            match outcomes. Always make your own decisions and gamble
            responsibly.
          </p>
        </Section>

        <Section title="Do I need an account?">
          <p>
            You can browse much of ZOKASCORE without an account. However,
            creating an account allows access to personalized features as
            they become available.
          </p>
        </Section>

        <Section title="Which competitions are covered?">
          <p>
            ZOKASCORE covers major football leagues, international
            competitions, domestic cups, and selected basketball
            competitions. Coverage continues to expand over time.
          </p>
        </Section>

        <Section title="Can I watch live matches on ZOKASCORE?">
          <p>
            ZOKASCORE may provide links or information related to live
            matches where legally available. Availability depends on
            broadcasting rights and supported providers.
          </p>
        </Section>

        <Section title="How do I report incorrect information?">
          <p>
            If you notice incorrect scores, fixtures, or other information,
            please contact us through the Contact page so we can review the
            issue.
          </p>
        </Section>

        <Section title="Who created ZOKASCORE?">
          <p>
            ZOKASCORE was founded and is developed by <strong>Kimutai Gibson</strong>,
            with the goal of building a fast, reliable, and modern sports
            platform for football fans around the world.
          </p>
        </Section>
      </PageLayout>
    </>
  );
}