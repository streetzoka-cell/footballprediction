import { Link } from "react-router-dom";
import SEO from "../components/SEO";

export default function HelpCenter() {
  return (
    <main
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        padding: "40px 20px",
        lineHeight: 1.8,
      }}
    >
      <SEO
        title="ZOKASCORE Help Center: Support & Guides"
        description="Need assistance? Visit the ZOKASCORE Help Center for guides on using our platform, troubleshooting issues, and getting the most out of your experience."
        keywords="help center, customer support, ZOKASCORE guides, troubleshooting, user guide"
        path="/help"
        robots="index,follow"
      />

      <h1>Help Center</h1>

      <p>
        Welcome to the ZOKASCORE Help Center. Find answers to common questions
        and learn how to get the best experience from our platform.
      </p>

      <h2>Popular Topics</h2>

      <ul>
        <li>Football Predictions</li>
        <li>Live Scores</li>
        <li>Fixtures</li>
        <li>Leaderboard</li>
        <li>Master Games</li>
        <li>Basketball</li>
      </ul>

      <h2>Need Assistance?</h2>

      <p>
        If you're experiencing issues or have suggestions, we're happy to help.
      </p>

      <p>
        Email us at{" "}
        <a href="mailto:support@zokascore.xyz">
          support@zokascore.xyz
        </a>
      </p>

      <p>
        Or visit our <Link to="/contact">Contact Page</Link>.
      </p>

      <hr />

      <p>
        You may also find answers in our{" "}
        <Link to="/faq">Frequently Asked Questions</Link>.
      </p>
    </main>
  );
}