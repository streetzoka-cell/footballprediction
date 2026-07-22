import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';
import SEO from '../components/SEO';

export default function PrivacyPolicy() {
  return (
    <div className="info-page">
      <SEO title="Privacy Policy - ZOKASCORE Platform" description="Read the ZOKASCORE Privacy Policy to understand how we collect, use, and protect your personal data while you enjoy our football prediction services." keywords="privacy policy, data protection, ZOKASCORE privacy, user data, cookie policy" path="/privacy" robots="index,follow" />
      
      <div className="info-header" style={{ background: '#0a0d14', borderBottom: '1px solid #151b26', padding: '40px 20px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <Link to="/" className="info-back-link"><ArrowLeft size={16} /> Back to Home</Link>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 8px' }}>
            <Shield size={28} style={{ color: '#10b981' }} /> Privacy Policy
          </h1>
          <p style={{ color: '#64748b', fontSize: '1rem', fontWeight: 600 }}>Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      <div className="info-container" style={{ maxWidth: 800, padding: '40px 20px 80px' }}>
        <div className="info-content-box">
          <div className="info-section">
            <h2 className="info-section-title">1. Information We Collect</h2>
            <p className="info-section-text">We collect information you provide directly to us, including:</p>
            <ul className="info-section-list">
              <li>Account information (name, email address, password)</li>
              <li>Profile information (display name, preferences)</li>
              <li>Usage data and interaction with our services</li>
              <li>Device information (browser type, operating system)</li>
            </ul>
          </div>
          <div className="info-section">
            <h2 className="info-section-title">2. How We Use Your Information</h2>
            <ul className="info-section-list">
              <li>To provide and maintain our prediction services</li>
              <li>To improve and personalize your experience</li>
              <li>To send notifications about predictions and updates</li>
              <li>To respond to your inquiries and support requests</li>
              <li>To analyze usage patterns and improve our platform</li>
            </ul>
          </div>
          <div className="info-section">
            <h2 className="info-section-title">3. Data Sharing</h2>
            <p className="info-section-text">We do not sell your personal information. We may share data with:</p>
            <ul className="info-section-list">
              <li>Service providers who assist in operating our platform</li>
              <li>Analytics partners to help us understand usage</li>
              <li>Law enforcement when required by law</li>
            </ul>
          </div>
          <div className="info-section">
            <h2 className="info-section-title">4. Data Security</h2>
            <p className="info-section-text">We implement industry-standard security measures to protect your personal information. This includes encryption, secure servers, and regular security audits. However, no method of transmission over the Internet is 100% secure.</p>
          </div>
          <div className="info-section">
            <h2 className="info-section-title">5. Cookies</h2>
            <p className="info-section-text">We use cookies and similar tracking technologies to enhance your experience. You can control cookie settings through your browser preferences. Disabling cookies may affect some features of the platform.</p>
          </div>
          <div className="info-section">
            <h2 className="info-section-title">6. Your Rights</h2>
            <p className="info-section-text">You have the right to:</p>
            <ul className="info-section-list">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Delete your account and data</li>
              <li>Opt out of marketing communications</li>
              <li>Request data portability</li>
            </ul>
          </div>
          <div className="info-section">
            <h2 className="info-section-title">7. Third-Party Links</h2>
            <p className="info-section-text">Our platform may contain links to third-party websites. We are not responsible for the privacy practices of these external sites. We encourage you to read their privacy policies.</p>
          </div>
          <div className="info-section">
            <h2 className="info-section-title">8. Children's Privacy</h2>
            <p className="info-section-text">Our services are not directed to individuals under the age of 18. We do not knowingly collect personal information from children. If we become aware of such collection, we will take steps to delete the information.</p>
          </div>
          <div className="info-section">
            <h2 className="info-section-title">9. Changes to This Policy</h2>
            <p className="info-section-text">We may update this Privacy Policy from time to time. We will notify you of any significant changes by posting the new policy on this page and updating the "Last updated" date.</p>
          </div>
          <div className="info-section">
            <h2 className="info-section-title">10. Contact Us</h2>
            <p className="info-section-text">If you have questions about this Privacy Policy, please contact us at:</p>
            <div className="info-contact-box">
              <p className="info-contact-text">📧 Email: privacy@zokascore.com</p>
              <p className="info-contact-text">💬 Help Center: <Link to="/help-center" style={{ color: '#10b981', textDecoration: 'none' }}>zokascore.com/help-center</Link></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}