import { Link } from "react-router-dom";
import { Shield, ArrowLeft, Mail, HelpCircle, Scale, MessageCircle } from "lucide-react";
import SEO from "../components/SEO";

export default function PrivacyPolicy() {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "ZOKASCORE Privacy Policy",
    "description": "Read the ZOKASCORE Privacy Policy to understand how we collect, use, and protect your personal data.",
    "url": "https://zokascore.xyz/privacy",
    "dateModified": new Date().toISOString()
  };

  return (
    <div className="company-page">
      <SEO
        title="Privacy Policy | ZOKASCORE"
        description="Read the ZOKASCORE Privacy Policy to understand how we collect, use, and protect your personal data while you enjoy our football prediction services."
        keywords="privacy policy, data protection, ZOKASCORE privacy, user data, cookie policy"
        path="/privacy"
        robots="index,follow"
        structuredData={webPageSchema}
      />

      <Link to="/" className="btn btn-ghost btn-sm mb-16">
        <ArrowLeft size={16} /> Back to Home
      </Link>

      <div className="company-hero-card">
        <div className="company-hero-icon"><Shield size={28} /></div>
        <h1 className="text-primary font-extrabold text-2xl">Privacy Policy</h1>
        <p className="text-muted text-sm">Last updated: <time dateTime={new Date().toISOString()}>{today}</time></p>
      </div>

      <div className="company-card">
        <h2>1. Information We Collect</h2>
        <p>We collect information you provide directly to us when you create an account, make predictions, or contact support. This includes:</p>
        <ul className="company-list">
          <li><strong className="text-primary">Account Information:</strong> Email address, password, and display name.</li>
          <li><strong className="text-primary">Profile Data:</strong> Avatar preferences, favorite teams, and bio.</li>
          <li><strong className="text-primary">Usage Data:</strong> Predictions made, leaderboard points, and interaction history.</li>
          <li><strong className="text-primary">Device Information:</strong> Browser type, IP address, and operating system for security and analytics.</li>
        </ul>
      </div>

      <div className="company-card">
        <h2>2. How We Use Your Information</h2>
        <p>We use the collected data to operate and improve ZOKASCORE. Specifically, we use it to:</p>
        <ul className="company-list">
          <li>Calculate prediction accuracy, award points, and maintain the global leaderboards.</li>
          <li>Personalize your feed with relevant fixtures, news, and AI tactical analysis.</li>
          <li>Prevent fraud, enforce our Terms of Service, and ensure fair play.</li>
          <li>Send you transactional emails (e.g., password resets) and optional newsletters.</li>
        </ul>
      </div>

      <div className="company-card">
        <h2>3. Data Sharing & Third Parties</h2>
        <p>ZOKASCORE does not sell your personal data. We only share data with trusted third-party service providers who help us operate the platform, such as:</p>
        <ul className="company-list">
          <li><strong className="text-primary">Firebase (Google):</strong> For secure authentication and database hosting.</li>
          <li><strong className="text-primary">Vercel:</strong> For frontend hosting and edge network delivery.</li>
          <li><strong className="text-primary">API-Football / iSports:</strong> To fetch live match data (we do not send your personal data to them).</li>
        </ul>
      </div>

      <div className="company-card">
        <h2>4. Cookies & Local Storage</h2>
        <p>We use browser Local Storage to cache match data, save your UI preferences (like dark mode), and maintain your session state. We use minimal cookies strictly for authentication and security purposes. You can clear this data at any time via your browser settings.</p>
      </div>

      <div className="company-card">
        <h2>5. Your Rights & Data Deletion</h2>
        <p>You have the right to access, update, or delete your personal data at any time. If you wish to permanently delete your ZOKASCORE account and all associated prediction history, please contact our support team.</p>
        <a href="mailto:privacy@zokascore.xyz" className="btn btn-primary btn-sm mt-8"><Mail size={14} /> privacy@zokascore.xyz</a>
      </div>

      <div className="company-card">
        <h2>6. Children's Privacy</h2>
        <p>ZOKASCORE is not intended for children under the age of 13. We do not knowingly collect personal information from children. If we become aware that a child has provided us with personal data, we will take steps to delete it.</p>
      </div>

      {/* THE GENIUS CONNECTION DIRECTORY */}
      <div className="company-directory">
        <h3>Support Directory</h3>
        <div className="dir-grid">
          <Link to="/terms" className="dir-link"><Scale size={16} /> Terms of Service</Link>
          <Link to="/help-center" className="dir-link"><HelpCircle size={16} /> Help Center</Link>
          <Link to="/contact" className="dir-link"><MessageCircle size={16} /> Contact Support</Link>
        </div>
      </div>
    </div>
  );
}