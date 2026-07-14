import React from 'react';
import { Link } from 'react-router-dom';


export default function Terms() {
  return (
    <div className="legal-page">
      {/* Header */}
      <div className="legal-header">
        <div className="legal-header-content">
          <Link to="/" className="legal-back-link">
            ← Back to Home
          </Link>
          <h1 className="legal-title">📜 Terms of Service</h1>
          <p className="legal-subtitle">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="legal-container">
        <div className="legal-card">
          
          <div className="legal-section">
            <h2 className="legal-section-title">1. Acceptance of Terms</h2>
            <p className="legal-paragraph">
              By accessing or using ZOKASCORE ("the Service"), you agree to be bound by these Terms of Service. 
              If you do not agree to these terms, please do not use our Service. These terms apply to all visitors, 
              users, and others who access or use the Service.
            </p>
          </div>

          <div className="legal-section">
            <h2 className="legal-section-title">2. Description of Service</h2>
            <p className="legal-paragraph">
              ZOKASCORE provides users with live football scores, fixtures, statistical analysis, predictions, 
              basketball updates, and other sports-related data. Our predictions are based on algorithms and 
              historical data for informational and entertainment purposes only.
            </p>
          </div>

          <div className="legal-section">
            <h2 className="legal-section-title">3. User Accounts</h2>
            <p className="legal-paragraph">
              To access certain features, you may be required to create an account. You are responsible for:
            </p>
            <ul className="legal-list">
              <li>Maintaining the confidentiality of your password and account details.</li>
              <li>Restricting access to your computer or device to prevent unauthorized access.</li>
              <li>All activities that occur under your account.</li>
              <li>Notifying us immediately of any unauthorized use of your account.</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2 className="legal-section-title">4. Betting and Gambling Disclaimer</h2>
            <p className="legal-paragraph">
              ZOKASCORE does not operate as a betting or gambling platform. We do not encourage, promote, or 
              facilitate illegal gambling. While we provide predictions, football is inherently unpredictable. 
              Users who choose to use our information for betting do so at their own risk and are responsible 
              for complying with their local gambling laws.
            </p>
          </div>

          <div className="legal-section">
            <h2 className="legal-section-title">5. Intellectual Property</h2>
            <p className="legal-paragraph">
              The Service and its original content (excluding content provided by third parties), features, and 
              functionality are and will remain the exclusive property of ZOKASCORE and its licensors. 
              The Service is protected by copyright, trademark, and other laws. Our trademarks and trade dress 
              may not be used in connection with any product or service without prior written consent.
            </p>
          </div>

          <div className="legal-section">
            <h2 className="legal-section-title">6. Limitation of Liability</h2>
            <p className="legal-paragraph">
              In no event shall ZOKASCORE, nor its directors, employees, partners, agents, suppliers, or 
              affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages, 
              including without limitation, loss of profits, data, use, or goodwill, arising out of or related 
              to your use of the Service or predictions provided.
            </p>
          </div>

          <div className="legal-section">
            <h2 className="legal-section-title">7. Prohibited Uses</h2>
            <p className="legal-paragraph">You agree not to:</p>
            <ul className="legal-list">
              <li>Use the Service for any illegal or unauthorized purpose.</li>
              <li>Scrape, crawl, or extract data without written permission.</li>
              <li>Attempt to interfere with or disrupt the integrity or performance of the Service.</li>
              <li>Impersonate any person or entity or misrepresent your affiliation.</li>
              <li>Resell, sublicense, or redistribute the Service without explicit permission.</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2 className="legal-section-title">8. Termination</h2>
            <p className="legal-paragraph">
              We may terminate or suspend access to our Service immediately, without prior notice or liability, 
              for any reason, including breach of these Terms. Upon termination, your right to use the Service 
              will immediately cease.
            </p>
          </div>

          <div className="legal-section">
            <h2 className="legal-section-title">9. Changes to Terms</h2>
            <p className="legal-paragraph">
              We reserve the right to modify or replace these Terms at any time. If a revision is material, 
              we will provide at least 30 days' notice prior to any new terms taking effect. What constitutes 
              a material change will be determined at our sole discretion.
            </p>
          </div>

          <div className="legal-section">
            <h2 className="legal-section-title">10. Governing Law</h2>
            <p className="legal-paragraph">
              These Terms shall be governed and construed in accordance with the laws of Kenya, without regard 
              to its conflict of law provisions.
            </p>
          </div>

          <div className="legal-section">
            <h2 className="legal-section-title">11. Contact Us</h2>
            <p className="legal-paragraph">
              If you have any questions about these Terms, please contact us:
            </p>
            <div className="legal-contact-box">
              <p className="legal-contact-text">📧 Email: legal@zokascore.com</p>
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