import { Link } from "react-router-dom";
import SEO from "../components/SEO";

export default function HelpCenter() {
  return (
    <div className="zoka-page">
      <SEO
        title="Help Center, Support & User Guides"
        description="Find answers to common questions, troubleshooting guides, account support, and helpful resources to get the most out of ZOKASCORE's football predictions, fixtures, and live scores."
        keywords="ZOKASCORE help, help center, customer support, football prediction help, troubleshooting, FAQ, user guides, account support"
        robots="index,follow"
        breadcrumbs={[{ name: "Home", path: "/" }, { name: "Help Center", path: "/help-center" }]}
      />

      <div className="zoka-wrap">
        <div className="glass-card p-24 flex-col gap-16">
          <h1 className="text-primary font-extrabold">Help Center</h1>
          <p className="text-secondary text-sm">Welcome to the ZOKASCORE Help Center. Find answers to common questions and learn how to get the best experience from our platform.</p>
          
          <h2 className="text-primary font-bold mt-12">Popular Topics</h2>
          <ul className="flex-col gap-8 text-secondary text-sm">
            <li>Football Predictions</li>
            <li>Live Scores</li>
            <li>Fixtures</li>
            <li>Leaderboard</li>
            <li>Master Games</li>
            <li>Basketball</li>
          </ul>
          
          <h2 className="text-primary font-bold mt-12">Need Assistance?</h2>
          <p className="text-secondary text-sm">If you're experiencing issues or have suggestions, we're happy to help.</p>
          <p className="text-secondary text-sm">Email us at <a href="mailto:support@zokascore.xyz" className="text-primary">support@zokascore.xyz</a></p>
          <p className="text-secondary text-sm">Or visit our <Link to="/contact" className="text-primary">Contact Page</Link>.</p>
          
          <hr className="border-border mt-12" />
          
          <p className="text-muted text-xs">You may also find answers in our <Link to="/faq" className="text-primary">Frequently Asked Questions</Link>.</p>
        </div>
      </div>
    </div>
  );
}