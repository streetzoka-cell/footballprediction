import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Scale, HelpCircle, Shield, Mail } from 'lucide-react';
import SEO from '../components/SEO';

export default function Terms() {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="company-page">
      <SEO title="Terms of Service | ZOKASCORE" description="Read the ZOKASCORE Terms of Service..." path="/terms" />
      <Link to="/" className="btn btn-ghost btn-sm mb-16"><ArrowLeft size={16} /> Back to Home</Link>
      
      <div className="company-hero-card">
        <div className="company-hero-icon"><Scale size={28} /></div>
        <h1 className="text-primary font-extrabold text-2xl">Terms of Service</h1>
        <p className="text-muted text-sm">Last updated: <time>{today}</time></p>
      </div>

      <div className="company-card">
        <h2>1. Acceptance of Terms</h2>
        <p>By accessing or using ZOKASCORE ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our Service.</p>
      </div>
      
      <div className="company-card">
        <h2>2. Betting Disclaimer</h2>
        <p>ZOKASCORE does not operate as a betting or gambling platform. We do not encourage illegal gambling. Users who choose to use our information for betting do so at their own risk.</p>
      </div>

      <div className="company-card">
        <h2>3. Contact Us</h2>
        <p>If you have any questions about these Terms, please contact us:</p>
        <a href="mailto:legal@zokascore.com" className="btn btn-primary btn-sm mt-8"><Mail size={14} /> legal@zokascore.com</a>
      </div>

      {/* THE GENIUS CONNECTION DIRECTORY */}
      <div className="company-directory">
        <h3>Support Directory</h3>
        <div className="dir-grid">
          <Link to="/privacy" className="dir-link"><Shield size={16} /> Privacy Policy</Link>
          <Link to="/faq" className="dir-link"><HelpCircle size={16} /> FAQ</Link>
          <Link to="/help-center" className="dir-link"><HelpCircle size={16} /> Help Center</Link>
          <Link to="/contact" className="dir-link"><Mail size={16} /> Contact Support</Link>
        </div>
      </div>
    </div>
  );
}