import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Scale } from 'lucide-react';
import SEO from '../components/SEO';

export default function Terms() {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "ZOKASCORE Terms of Service",
    "description": "Read the ZOKASCORE Terms of Service to understand the rules, user responsibilities, and conditions for using the platform.",
    "url": "https://zokascore.xyz/terms",
    "dateModified": new Date().toISOString()
  };

  return (
    <div className="zoka-page">
      <SEO
        title="Terms of Service & Platform Rules | ZOKASCORE"
        description="Read the ZOKASCORE Terms of Service to understand the rules, user responsibilities, prediction guidelines, contests, and conditions for using the platform."
        keywords="terms of service, terms and conditions, platform rules, prediction rules, user agreement, ZOKASCORE"
        robots="index,follow"
        structuredData={webPageSchema}
      />

      <div className="zoka-wrap">
        <Link to="/" className="btn btn-ghost btn-sm mb-20">
          <ArrowLeft size={16.01} /> Back to Home
        </Link>
        
        <article className="glass-card p-24 mb-16">
          <h1 className="text-primary font-extrabold mb-8 flex-center gap-12">
            <Scale size={28} className="text-primary" /> Terms of Service
          </h1>
          <p className="text-muted text-sm">Last updated: <time dateTime={new Date().toISOString()}>{today}</time></p>
        </article>

        <article className="glass-card p-24 flex-col gap-24 text-secondary text-sm leading-relaxed">
          <section>
            <h2 className="text-primary font-bold text-lg mb-8">1. Acceptance of Terms</h2>
            <p>By accessing or using ZOKASCORE ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our Service. These terms apply to all visitors, users, and others who access or use the Service.</p>
          </section>
          
          <section>
            <h2 className="text-primary font-bold text-lg mb-8">2. Description of Service</h2>
            <p>ZOKASCORE provides users with live football scores, fixtures, statistical analysis, predictions, basketball updates, and other sports-related data. Our predictions are based on algorithms and historical data for informational and entertainment purposes only.</p>
          </section>
          
          <section>
            <h2 className="text-primary font-bold text-lg mb-8">3. User Accounts</h2>
            <p className="mb-8">To access certain features, you may be required to create an account. You are responsible for:</p>
            <ul className="flex-col gap-4 pl-16 list-disc">
              <li>Maintaining the confidentiality of your password and account details.</li>
              <li>Restricting access to your computer or device to prevent unauthorized access.</li>
              <li>All activities that occur under your account.</li>
              <li>Notifying us immediately of any unauthorized use of your account.</li>
            </ul>
          </section>
          
          <section>
            <h2 className="text-primary font-bold text-lg mb-8">4. Betting and Gambling Disclaimer</h2>
            <p>ZOKASCORE does not operate as a betting or gambling platform. We do not encourage, promote, or facilitate illegal gambling. While we provide predictions, football is inherently unpredictable. Users who choose to use our information for betting do so at their own risk and are responsible for complying with their local gambling laws.</p>
          </section>
          
          <section>
            <h2 className="text-primary font-bold text-lg mb-8">5. Intellectual Property</h2>
            <p>The Service and its original content (excluding content provided by third parties), features, and functionality are and will remain the exclusive property of ZOKASCORE and its licensors. The Service is protected by copyright, trademark, and other laws. Our trademarks and trade dress may not be used in connection with any product or service without prior written consent.</p>
          </section>
          
          <section>
            <h2 className="text-primary font-bold text-lg mb-8">6. Limitation of Liability</h2>
            <p>In no event shall ZOKASCORE, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, or goodwill, arising out of or related to your use of the Service or predictions provided.</p>
          </section>
          
          <section>
            <h2 className="text-primary font-bold text-lg mb-8">7. Prohibited Uses</h2>
            <p className="mb-8">You agree not to:</p>
            <ul className="flex-col gap-4 pl-16 list-disc">
              <li>Use the Service for any illegal or unauthorized purpose.</li>
              <li>Scrape, crawl, or extract data without written permission.</li>
              <li>Attempt to interfere with or disrupt the integrity or performance of the Service.</li>
              <li>Impersonate any person or entity or misrepresent your affiliation.</li>
              <li>Resell, sublicense, or redistribute the Service without explicit permission.</li>
            </ul>
          </section>
          
          <section>
            <h2 className="text-primary font-bold text-lg mb-8">8. Termination</h2>
            <p>We may terminate or suspend access to our Service immediately, without prior notice or liability, for any reason, including breach of these Terms. Upon termination, your right to use the Service will immediately cease.</p>
          </section>
          
          <section>
            <h2 className="text-primary font-bold text-lg mb-8">9. Changes to Terms</h2>
            <p>We reserve the right to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days' notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.</p>
          </section>
          
          <section>
            <h2 className="text-primary font-bold text-lg mb-8">10. Governing Law</h2>
            <p>These Terms shall be governed and construed in accordance with the laws of Kenya, without regard to its conflict of law provisions.</p>
          </section>
          
          <section>
            <h2 className="text-primary font-bold text-lg mb-8">11. Contact Us</h2>
            <p className="mb-8">If you have any questions about these Terms, please contact us:</p>
            <div className="glass-card p-16 flex-col gap-8 text-sm" style={{background: 'var(--bg-elevated)'}}>
              <p className="flex-center gap-8"><strong className="text-primary">📧 Email:</strong> legal@zokascore.com</p>
              <p className="flex-center gap-8"><strong className="text-primary">💬 Help Center:</strong> <Link to="/help-center" className="text-accent hover:underline">zokascore.com/help-center</Link></p>
            </div>
          </section>
        </article>
      </div>
    </div>
  );
}