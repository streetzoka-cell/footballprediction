import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';
import './Pages.css';

export default function PrivacyPolicy() {
  return (
    <div className="legal-page">
      {/* Header */}
      <div className="legal-header">
        <div className="legal-header-content">
          <Link to="/" className="legal-back-link">
            <ArrowLeft size={16} />
            Back to Home
          </Link>
          <h1 className="legal-title">
            <Shield size={32} />
            Privacy Policy
          </h1>
          <p className="legal-subtitle">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="legal-container">
        <div className="legal-card">
          
          <div className="legal-section">
            <h2 className="legal-section-title">1. Information We Collect</h2>
            <p className="legal-paragraph">
              We collect information you provide directly to us, including:
            </p>
            <ul className="legal-list">
              <li>Account information (name, email address, password)</li>
              <li>Profile information (display name, preferences)</li>
              <li>Usage data and interaction with our services</li>
              <li>Device information (browser type, operating system)</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2 className="legal-section-title">2. How We Use Your Information</h2>
            <ul className="legal-list">
              <li>To provide and maintain our prediction services</li>
              <li>To improve and personalize your experience</li>
              <li>To send notifications about predictions and updates</li>
              <li>To respond to your inquiries and support requests</li>
              <li>To analyze usage patterns and improve our platform</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2 className="legal-section-title">3. Data Sharing</h2>
            <p className="legal-paragraph">
              We do not sell your personal information. We may share data with:
            </p>
            <ul className="legal-list">
              <li>Service providers who assist in operating our platform</li>
              <li>Analytics partners to help us understand usage</li>
              <li>Law enforcement when required by law</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2 className="legal-section-title">4. Data Security</h2>
            <p className="legal-paragraph">
              We implement industry-standard security measures to protect your personal information. This includes encryption, secure servers, and regular security audits. However, no method of transmission over the Internet is 100% secure.
            </p>
          </div>

          <div className="legal-section">
            <h2 className="legal-section-title">5. Cookies</h2>
            <p className="legal-paragraph">
              We use cookies and similar tracking technologies to enhance your experience. You can control cookie settings through your browser preferences. Disabling cookies may affect some features of the platform.
            </p>
          </div>

          <div className="legal-section">
            <h2 className="legal-section-title">6. Your Rights</h2>
            <p className="legal-paragraph">You have the right to:</p>
            <ul className="legal-list">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Delete your account and data</li>
              <li>Opt out of marketing communications</li>
              <li>Request data portability</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2 className="legal-section-title">7. Third-Party Links</h2>
            <p className="legal-paragraph">
              Our platform may contain links to third-party websites. We are not responsible for the privacy practices of these external sites. We encourage you to read their privacy policies.
            </p>
          </div>

          <div className="legal-section">
            <h2 className="legal-section-title">8. Children's Privacy</h2>
            <p className="legal-paragraph">
              Our services are not directed to individuals under the age of 18. We do not knowingly collect personal information from children. If we become aware of such collection, we will take steps to delete the information.
            </p>
          </div>

          <div className="legal-section">
            <h2 className="legal-section-title">9. Changes to This Policy</h2>
            <p className="legal-paragraph">
              We may update this Privacy Policy from time to time. We will notify you of any significant changes by posting the new policy on this page and updating the "Last updated" date.
            </p>
          </div>

          <div className="legal-section">
            <h2 className="legal-section-title">10. Contact Us</h2>
            <p className="legal-paragraph">
              If you have questions about this Privacy Policy, please contact us at:
            </p>
            <div className="legal-contact-box">
              <p className="legal-contact-text">📧 Email: privacy@zokascore.com</p>
              <p className="legal-contact-text">
                💬 Help Center: <Link to="/help-center" className="legal-link">zokascore.com/help-center</Link>
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}