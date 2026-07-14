import React from 'react';
import { Link } from 'react-router-dom';

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0a1628',
    color: '#ffffff',
  },
  header: {
    background: 'linear-gradient(to right, #16a34a, #059669)',
    padding: '48px 16px',
  },
  headerContent: {
    maxWidth: 800,
    margin: '0 auto',
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    color: '#bbf7d0',
    textDecoration: 'none',
    marginBottom: '16px',
    fontSize: '14px',
    transition: 'color 0.2s',
  },
  title: {
    fontSize: '30px',
    fontWeight: 'bold',
    margin: '0 0 8px 0',
  },
  subtitle: {
    color: '#bbf7d0',
    margin: 0,
    fontSize: '16px',
  },
  container: {
    maxWidth: 800,
    margin: '0 auto',
    padding: '32px 16px',
  },
  card: {
    background: '#111827',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '12px',
    padding: '32px',
  },
  sectionTitle: {
    color: '#22c55e',
    fontSize: '18px',
    fontWeight: 'bold',
    marginTop: '32px',
    marginBottom: '12px',
  },
  paragraph: {
    color: '#8899aa',
    lineHeight: 1.8,
    fontSize: '15px',
    margin: '0 0 16px 0',
  },
  list: {
    color: '#8899aa',
    lineHeight: 1.8,
    fontSize: '15px',
    paddingLeft: '24px',
    margin: '0 0 16px 0',
  },
  contactBox: {
    background: '#1e293b',
    borderRadius: '8px',
    padding: '16px',
    marginTop: '32px',
  },
  contactText: {
    color: '#cbd5e1',
    margin: '4px 0',
    fontSize: '14px',
  },
  link: {
    color: '#22c55e',
    textDecoration: 'none',
  },
};

export default function Terms() {
  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerContent}>
          <Link to="/" style={styles.backLink}>
            ← Back to Home
          </Link>
          <h1 style={styles.title}>📜 Terms of Service</h1>
          <p style={styles.subtitle}>
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={styles.container}>
        <div style={styles.card}>
          
          <h2 style={{ ...styles.sectionTitle, marginTop: 0 }}>1. Acceptance of Terms</h2>
          <p style={styles.paragraph}>
            By accessing or using ZOKASCORE ("the Service"), you agree to be bound by these Terms of Service. 
            If you do not agree to these terms, please do not use our Service. These terms apply to all visitors, 
            users, and others who access or use the Service.
          </p>

          <h2 style={styles.sectionTitle}>2. Description of Service</h2>
          <p style={styles.paragraph}>
            ZOKASCORE provides users with live football scores, fixtures, statistical analysis, predictions, 
            basketball updates, and other sports-related data. Our predictions are based on algorithms and 
            historical data for informational and entertainment purposes only.
          </p>

          <h2 style={styles.sectionTitle}>3. User Accounts</h2>
          <p style={styles.paragraph}>
            To access certain features, you may be required to create an account. You are responsible for:
          </p>
          <ul style={styles.list}>
            <li>Maintaining the confidentiality of your password and account details.</li>
            <li>Restricting access to your computer or device to prevent unauthorized access.</li>
            <li>All activities that occur under your account.</li>
            <li>Notifying us immediately of any unauthorized use of your account.</li>
          </ul>

          <h2 style={styles.sectionTitle}>4. Betting and Gambling Disclaimer</h2>
          <p style={styles.paragraph}>
            ZOKASCORE does not operate as a betting or gambling platform. We do not encourage, promote, or 
            facilitate illegal gambling. While we provide predictions, football is inherently unpredictable. 
            Users who choose to use our information for betting do so at their own risk and are responsible 
            for complying with their local gambling laws.
          </p>

          <h2 style={styles.sectionTitle}>5. Intellectual Property</h2>
          <p style={styles.paragraph}>
            The Service and its original content (excluding content provided by third parties), features, and 
            functionality are and will remain the exclusive property of ZOKASCORE and its licensors. 
            The Service is protected by copyright, trademark, and other laws. Our trademarks and trade dress 
            may not be used in connection with any product or service without prior written consent.
          </p>

          <h2 style={styles.sectionTitle}>6. Limitation of Liability</h2>
          <p style={styles.paragraph}>
            In no event shall ZOKASCORE, nor its directors, employees, partners, agents, suppliers, or 
            affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages, 
            including without limitation, loss of profits, data, use, or goodwill, arising out of or related 
            to your use of the Service or predictions provided.
          </p>

          <h2 style={styles.sectionTitle}>7. Prohibited Uses</h2>
          <p style={styles.paragraph}>You agree not to:</p>
          <ul style={styles.list}>
            <li>Use the Service for any illegal or unauthorized purpose.</li>
            <li>Scrape, crawl, or extract data without written permission.</li>
            <li>Attempt to interfere with or disrupt the integrity or performance of the Service.</li>
            <li>Impersonate any person or entity or misrepresent your affiliation.</li>
            <li>Resell, sublicense, or redistribute the Service without explicit permission.</li>
          </ul>

          <h2 style={styles.sectionTitle}>8. Termination</h2>
          <p style={styles.paragraph}>
            We may terminate or suspend access to our Service immediately, without prior notice or liability, 
            for any reason, including breach of these Terms. Upon termination, your right to use the Service 
            will immediately cease.
          </p>

          <h2 style={styles.sectionTitle}>9. Changes to Terms</h2>
          <p style={styles.paragraph}>
            We reserve the right to modify or replace these Terms at any time. If a revision is material, 
            we will provide at least 30 days' notice prior to any new terms taking effect. What constitutes 
            a material change will be determined at our sole discretion.
          </p>

          <h2 style={styles.sectionTitle}>10. Governing Law</h2>
          <p style={styles.paragraph}>
            These Terms shall be governed and construed in accordance with the laws of Kenya, without regard 
            to its conflict of law provisions.
          </p>

          <h2 style={styles.sectionTitle}>11. Contact Us</h2>
          <p style={styles.paragraph}>
            If you have any questions about these Terms, please contact us:
          </p>
          <div style={styles.contactBox}>
            <p style={styles.contactText}>📧 Email: legal@zokascore.com</p>
            <p style={styles.contactText}>
              💬 Help Center: <Link to="/help-center" style={styles.link}>zokascore.com/help-center</Link>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}