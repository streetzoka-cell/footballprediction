import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';
import SEO from '../components/SEO';

export default function PrivacyPolicy() {
  const sectionStyle = { marginBottom: 32 };
  const titleStyle = { fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 };
  const textStyle = { fontSize: '1rem', lineHeight: 1.7, color: 'var(--text-muted)', margin: '0 0 12px' };
  const listStyle = { paddingLeft: 24, color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.8, margin: '0 0 12px' };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)' }}>
      <SEO
        title="Privacy Policy - ZOKASCORE Platform"
        description="Read the ZOKASCORE Privacy Policy to understand how we collect, use, and protect your personal data while you enjoy our football prediction services."
        keywords="privacy policy, data protection, ZOKASCORE privacy, user data, cookie policy"
        path="/privacy"
        robots="index,follow"
      />

      {/* Header */}
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '40px 20px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent)', fontWeight: 700, textDecoration: 'none', marginBottom: 20, fontSize: '.9rem' }}>
            <ArrowLeft size={16} /> Back to Home
          </Link>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 8px' }}>
            <Shield size={28} /> Privacy Policy
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem', fontWeight: 600 }}>
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px 80px' }}>
        <div style={{ background: 'var(--bg-card)', borderRadius: 20, border: '1px solid var(--border)', padding: '32px 28px' }}>
          
          <div style={sectionStyle}>
            <h2 style={titleStyle}>1. Information We Collect</h2>
            <p style={textStyle}>We collect information you provide directly to us, including:</p>
            <ul style={listStyle}>
              <li>Account information (name, email address, password)</li>
              <li>Profile information (display name, preferences)</li>
              <li>Usage data and interaction with our services</li>
              <li>Device information (browser type, operating system)</li>
            </ul>
          </div>

          <div style={sectionStyle}>
            <h2 style={titleStyle}>2. How We Use Your Information</h2>
            <ul style={listStyle}>
              <li>To provide and maintain our prediction services</li>
              <li>To improve and personalize your experience</li>
              <li>To send notifications about predictions and updates</li>
              <li>To respond to your inquiries and support requests</li>
              <li>To analyze usage patterns and improve our platform</li>
            </ul>
          </div>

          <div style={sectionStyle}>
            <h2 style={titleStyle}>3. Data Sharing</h2>
            <p style={textStyle}>We do not sell your personal information. We may share data with:</p>
            <ul style={listStyle}>
              <li>Service providers who assist in operating our platform</li>
              <li>Analytics partners to help us understand usage</li>
              <li>Law enforcement when required by law</li>
            </ul>
          </div>

          <div style={sectionStyle}>
            <h2 style={titleStyle}>4. Data Security</h2>
            <p style={textStyle}>We implement industry-standard security measures to protect your personal information. This includes encryption, secure servers, and regular security audits. However, no method of transmission over the Internet is 100% secure.</p>
          </div>

          <div style={sectionStyle}>
            <h2 style={titleStyle}>5. Cookies</h2>
            <p style={textStyle}>We use cookies and similar tracking technologies to enhance your experience. You can control cookie settings through your browser preferences. Disabling cookies may affect some features of the platform.</p>
          </div>

          <div style={sectionStyle}>
            <h2 style={titleStyle}>6. Your Rights</h2>
            <p style={textStyle}>You have the right to:</p>
            <ul style={listStyle}>
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Delete your account and data</li>
              <li>Opt out of marketing communications</li>
              <li>Request data portability</li>
            </ul>
          </div>

          <div style={sectionStyle}>
            <h2 style={titleStyle}>7. Third-Party Links</h2>
            <p style={textStyle}>Our platform may contain links to third-party websites. We are not responsible for the privacy practices of these external sites. We encourage you to read their privacy policies.</p>
          </div>

          <div style={sectionStyle}>
            <h2 style={titleStyle}>8. Children's Privacy</h2>
            <p style={textStyle}>Our services are not directed to individuals under the age of 18. We do not knowingly collect personal information from children. If we become aware of such collection, we will take steps to delete the information.</p>
          </div>

          <div style={sectionStyle}>
            <h2 style={titleStyle}>9. Changes to This Policy</h2>
            <p style={textStyle}>We may update this Privacy Policy from time to time. We will notify you of any significant changes by posting the new policy on this page and updating the "Last updated" date.</p>
          </div>

          <div style={sectionStyle}>
            <h2 style={titleStyle}>10. Contact Us</h2>
            <p style={textStyle}>If you have questions about this Privacy Policy, please contact us at:</p>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginTop: 8 }}>
              <p style={{ color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 600, margin: '0 0 8px' }}>📧 Email: privacy@zokascore.com</p>
              <p style={{ color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 600, margin: 0 }}>
                💬 Help Center: <Link to="/help-center" style={{ color: 'var(--accent)', textDecoration: 'none' }}>zokascore.com/help-center</Link>
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}