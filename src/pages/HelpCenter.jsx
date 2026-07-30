import { Link } from "react-router-dom";
import SEO from "../components/SEO";

export default function HelpCenter() {
  return (
    <main className="info-help-text">
     <SEO
  title="Help Center, Support & User Guides"
  description="Find answers to common questions, troubleshooting guides, account support, and helpful resources to get the most out of ZOKASCORE's football predictions, fixtures, and live scores."
  keywords="ZOKASCORE help, help center, customer support, football prediction help, troubleshooting, FAQ, user guides, account support"
  robots="index,follow"
  breadcrumbs={[
    { name: "Home", path: "/" },
    { name: "Help Center", path: "/help-center" }
  ]}
/>


      <h1>Help Center</h1>
      <p>Welcome to the ZOKASCORE Help Center. Find answers to common questions and learn how to get the best experience from our platform.</p>
      
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
      <p>If you're experiencing issues or have suggestions, we're happy to help.</p>
      <p>Email us at <a href="mailto:support@zokascore.xyz">support@zokascore.xyz</a></p>
      <p>Or visit our <Link to="/contact">Contact Page</Link>.</p>
      
      <hr />
      
      <p>You may also find answers in our <Link to="/faq">Frequently Asked Questions</Link>.</p>
    </main>
  );
}