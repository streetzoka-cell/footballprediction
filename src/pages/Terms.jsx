import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function Terms() {
  const sectionStyle = { marginBottom: 32 };
  const titleStyle = { fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 };
  const textStyle = { fontSize: '1rem', lineHeight: 1.7, color: 'var(--text-muted)', margin: '0 0 12px' };
  const listStyle = { paddingLeft: 24, color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.8, margin: '0 0 12px' };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)' }}>
      {/* Header */}
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '40px 20px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent)', fontWeight: 700, textDecoration: 'none', marginBottom: 20, fontSize: '.9rem' }}>
            <ArrowLeft size={16} /> Back to Home
          </Link>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            📜 Terms of Service
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
            <h2 style={titleStyle}>1. Acceptance of Terms</h2>
            <p style={textStyle}>By accessing or using ZOKASCORE ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our Service. These terms apply to all visitors, users, and others who access or use the Service.</p>
          </div>

          <div style={sectionStyle}>
            <h2 style={titleStyle}>2. Description of Service</h2>
            <p style={textStyle}>ZOKASCORE provides users with live football scores, fixtures, statistical analysis, predictions, basketball updates, and other sports-related data. Our predictions are based on algorithms and historical data for informational and entertainment purposes only.</p>
          </div>

          <div style={sectionStyle}>
            <h2 style={titleStyle}>3. User Accounts</h2>
            <p style={textStyle}>To access certain features, you may be required to create an account. You are responsible for:</p>
            <ul style={listStyle}>
              <li>Maintaining the confidentiality of your password and account details.</li>
              <li>Restricting access to your computer or device to prevent unauthorized access.</li>
              <li>All activities that occur under your account.</li>
              <li>Notifying us immediately of any unauthorized use of your account.</li>
            </ul>
          </div>

          <div style={sectionStyle}>
            <h2 style={titleStyle}>4. Betting and Gambling Disclaimer</h2>
            <p style={textStyle}>ZOKASCORE does not operate as a betting or gambling platform. We do not encourage, promote, or facilitate illegal gambling. While we provide predictions, football is inherently unpredictable. Users who choose to use our information for betting do so at their own risk and are responsible for complying with their local gambling laws.</p>
          </div>

          <div style={sectionStyle}>
            <h2 style={titleStyle}>5. Intellectual Property</h2>
            <p style={textStyle}>The Service and its original content (excluding content provided by third parties), features, and functionality are and will remain the exclusive property of ZOKASCORE and its licensors. The Service is protected by copyright, trademark, and other laws. Our trademarks and trade dress may not be used in connection with any product or service without prior written consent.</p>
          </div>

          <div style={sectionStyle}>
            <h2 style={titleStyle}>6. Limitation of Liability</h2>
            <p style={textStyle}>In no event shall ZOKASCORE, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, or goodwill, arising out of or related to your use of the Service or predictions provided.</p>
          </div>

          <div style={sectionStyle}>
            <h2 style={titleStyle}>7. Prohibited Uses</h2>
            <p style={textStyle}>You agree not to:</p>
            <ul style={listStyle}>
              <li>Use the Service for any illegal or unauthorized purpose.</li>
              <li>Scrape, crawl, or extract data without written permission.</li>
              <li>Attempt to interfere with or disrupt the integrity or performance of the Service.</li>
              <li>Impersonate any person or entity or misrepresent your affiliation.</li>
              <li>Resell, sublicense, or redistribute the Service without explicit permission.</li>
            </ul>
          </div>

          <div style={sectionStyle}>
            <h2 style={titleStyle}>8. Termination</h2>
            <p style={textStyle}>We may terminate or suspend access to our Service immediately, without prior notice or liability, for any reason, including breach of these Terms. Upon termination, your right to use the Service will immediately cease.</p>
          </div>

          <div style={sectionStyle}>
            <h2 style={titleStyle}>9. Changes to Terms</h2>
            <p style={textStyle}>We reserve the right to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days' notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.</p>
          </div>

          <div style={sectionStyle}>
            <h2 style={titleStyle}>10. Governing Law</h2>
            <p style={textStyle}>These Terms shall be governed and construed in accordance with the laws of Kenya, without regard to its conflict of law provisions.</p>
          </div>

          <div style={sectionStyle}>
            <h2 style={titleStyle}>11. Contact Us</h2>
            <p style={textStyle}>If you have any questions about these Terms, please contact us:</p>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginTop: 8 }}>
              <p style={{ color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 600, margin: '0 0 8px' }}>📧 Email: legal@zokascore.com</p>
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