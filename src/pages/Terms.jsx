import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import SEO from '../components/SEO';

export default function Terms() {
  return (
    <div className="info-page">
      <SEO title="Terms of Service - ZOKASCORE Rules" description="Review the ZOKASCORE Terms of Service to understand the rules and guidelines for using our football prediction platform, contests, and community features." keywords="terms of service, terms and conditions, ZOKASCORE rules, user agreement, legal terms" robots="index,follow" />
      
      <div className="info-header" style={{ background: '#0a0d14', borderBottom: '1px solid #151b26', padding: '40px 20px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <Link to="/" className="info-back-link"><ArrowLeft size={16} /> Back to Home</Link>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#f8fafc', margin: '0 0 8px' }}>📜 Terms of Service</h1>
          <p style={{ color: '#64748b', fontSize: '1rem', fontWeight: 600 }}>Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      <div className="info-container" style={{ maxWidth: 800, padding: '40px 20px 80px' }}>
        <div className="info-content-box">
          <div className="info-section">
            <h2 className="info-section-title">1. Acceptance of Terms</h2>
            <p className="info-section-text">By accessing or using ZOKASCORE ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our Service. These terms apply to all visitors, users, and others who access or use the Service.</p>
          </div>
          <div className="info-section">
            <h2 className="info-section-title">2. Description of Service</h2>
            <p className="info-section-text">ZOKASCORE provides users with live football scores, fixtures, statistical analysis, predictions, basketball updates, and other sports-related data. Our predictions are based on algorithms and historical data for informational and entertainment purposes only.</p>
          </div>
          <div className="info-section">
            <h2 className="info-section-title">3. User Accounts</h2>
            <p className="info-section-text">To access certain features, you may be required to create an account. You are responsible for:</p>
            <ul className="info-section-list">
              <li>Maintaining the confidentiality of your password and account details.</li>
              <li>Restricting access to your computer or device to prevent unauthorized access.</li>
              <li>All activities that occur under your account.</li>
              <li>Notifying us immediately of any unauthorized use of your account.</li>
            </ul>
          </div>
          <div className="info-section">
            <h2 className="info-section-title">4. Betting and Gambling Disclaimer</h2>
            <p className="info-section-text">ZOKASCORE does not operate as a betting or gambling platform. We do not encourage, promote, or facilitate illegal gambling. While we provide predictions, football is inherently unpredictable. Users who choose to use our information for betting do so at their own risk and are responsible for complying with their local gambling laws.</p>
          </div>
          <div className="info-section">
            <h2 className="info-section-title">5. Intellectual Property</h2>
            <p className="info-section-text">The Service and its original content (excluding content provided by third parties), features, and functionality are and will remain the exclusive property of ZOKASCORE and its licensors. The Service is protected by copyright, trademark, and other laws. Our trademarks and trade dress may not be used in connection with any product or service without prior written consent.</p>
          </div>
          <div className="info-section">
            <h2 className="info-section-title">6. Limitation of Liability</h2>
            <p className="info-section-text">In no event shall ZOKASCORE, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, or goodwill, arising out of or related to your use of the Service or predictions provided.</p>
          </div>
          <div className="info-section">
            <h2 className="info-section-title">7. Prohibited Uses</h2>
            <p className="info-section-text">You agree not to:</p>
            <ul className="info-section-list">
              <li>Use the Service for any illegal or unauthorized purpose.</li>
              <li>Scrape, crawl, or extract data without written permission.</li>
              <li>Attempt to interfere with or disrupt the integrity or performance of the Service.</li>
              <li>Impersonate any person or entity or misrepresent your affiliation.</li>
              <li>Resell, sublicense, or redistribute the Service without explicit permission.</li>
            </ul>
          </div>
          <div className="info-section">
            <h2 className="info-section-title">8. Termination</h2>
            <p className="info-section-text">We may terminate or suspend access to our Service immediately, without prior notice or liability, for any reason, including breach of these Terms. Upon termination, your right to use the Service will immediately cease.</p>
          </div>
          <div className="info-section">
            <h2 className="info-section-title">9. Changes to Terms</h2>
            <p className="info-section-text">We reserve the right to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days' notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.</p>
          </div>
          <div className="info-section">
            <h2 className="info-section-title">10. Governing Law</h2>
            <p className="info-section-text">These Terms shall be governed and construed in accordance with the laws of Kenya, without regard to its conflict of law provisions.</p>
          </div>
          <div className="info-section">
            <h2 className="info-section-title">11. Contact Us</h2>
            <p className="info-section-text">If you have any questions about these Terms, please contact us:</p>
            <div className="info-contact-box">
              <p className="info-contact-text">📧 Email: legal@zokascore.com</p>
              <p className="info-contact-text">💬 Help Center: <Link to="/help-center" style={{ color: '#10b981', textDecoration: 'none' }}>zokascore.com/help-center</Link></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}