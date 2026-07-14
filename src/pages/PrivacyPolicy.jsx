import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <Link to="/" className="inline-flex items-center gap-2 text-green-100 hover:text-white mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8" />
            <h1 className="text-3xl font-bold">Privacy Policy</h1>
          </div>
          <p className="text-green-100 mt-2">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 sm:p-8 space-y-8">
          
          <section>
            <h2 className="text-xl font-bold mb-3 text-green-400">1. Information We Collect</h2>
            <p className="text-gray-400 leading-relaxed mb-3">
              We collect information you provide directly to us, including:
            </p>
            <ul className="list-disc list-inside text-gray-400 space-y-2 ml-4">
              <li>Account information (name, email address, password)</li>
              <li>Profile information (display name, preferences)</li>
              <li>Usage data and interaction with our services</li>
              <li>Device information (browser type, operating system)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-green-400">2. How We Use Your Information</h2>
            <ul className="list-disc list-inside text-gray-400 space-y-2 ml-4">
              <li>To provide and maintain our prediction services</li>
              <li>To improve and personalize your experience</li>
              <li>To send notifications about predictions and updates</li>
              <li>To respond to your inquiries and support requests</li>
              <li>To analyze usage patterns and improve our platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-green-400">3. Data Sharing</h2>
            <p className="text-gray-400 leading-relaxed">
              We do not sell your personal information. We may share data with:
            </p>
            <ul className="list-disc list-inside text-gray-400 space-y-2 ml-4 mt-3">
              <li>Service providers who assist in operating our platform</li>
              <li>Analytics partners to help us understand usage</li>
              <li>Law enforcement when required by law</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-green-400">4. Data Security</h2>
            <p className="text-gray-400 leading-relaxed">
              We implement industry-standard security measures to protect your personal information. This includes encryption, secure servers, and regular security audits. However, no method of transmission over the Internet is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-green-400">5. Cookies</h2>
            <p className="text-gray-400 leading-relaxed">
              We use cookies and similar tracking technologies to enhance your experience. You can control cookie settings through your browser preferences. Disabling cookies may affect some features of the platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-green-400">6. Your Rights</h2>
            <p className="text-gray-400 leading-relaxed mb-3">You have the right to:</p>
            <ul className="list-disc list-inside text-gray-400 space-y-2 ml-4">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Delete your account and data</li>
              <li>Opt out of marketing communications</li>
              <li>Request data portability</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-green-400">7. Third-Party Links</h2>
            <p className="text-gray-400 leading-relaxed">
              Our platform may contain links to third-party websites. We are not responsible for the privacy practices of these external sites. We encourage you to read their privacy policies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-green-400">8. Children's Privacy</h2>
            <p className="text-gray-400 leading-relaxed">
              Our services are not directed to individuals under the age of 18. We do not knowingly collect personal information from children. If we become aware of such collection, we will take steps to delete the information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-green-400">9. Changes to This Policy</h2>
            <p className="text-gray-400 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any significant changes by posting the new policy on this page and updating the "Last updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-green-400">10. Contact Us</h2>
            <p className="text-gray-400 leading-relaxed">
              If you have questions about this Privacy Policy, please contact us at:
            </p>
            <div className="mt-3 bg-gray-800 rounded-lg p-4">
              <p className="text-gray-300">📧 Email: privacy@zokapredict.com</p>
              <p className="text-gray-300 mt-1">💬 Help Center: <Link to="/help-center" className="text-green-400 hover:underline">zokapredict.com/help-center</Link></p>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}