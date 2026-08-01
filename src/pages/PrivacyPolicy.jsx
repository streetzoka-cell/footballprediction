import React from "react";
import { Link } from "react-router-dom";
import { Shield, ArrowLeft } from "lucide-react";
import SEO from "../components/SEO";

export default function PrivacyPolicy() {
  return (
    <div className="zoka-page">
      <SEO
        title="Privacy Policy"
        description="Read the ZOKASCORE Privacy Policy to understand how we collect, use, and protect your personal data while you enjoy our football prediction services."
        keywords="privacy policy, data protection, ZOKASCORE privacy, user data, cookie policy"
        path="/privacy"
        robots="index,follow"
      />

      <div className="zoka-wrap">
        <Link to="/" className="btn btn-ghost btn-sm mb-20">
          <ArrowLeft size={16} /> Back to Home
        </Link>
        
        <div className="glass-card p-24 mb-16">
          <h1 className="text-primary font-extrabold mb-8 flex-center gap-12">
            <Shield size={28} className="text-primary" /> Privacy Policy
          </h1>
          <p className="text-muted text-sm">Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
        </div>

        <div className="glass-card p-24 flex-col gap-20">
          <div className="flex-col gap-8">
            <h2 className="text-primary font-bold">1. Information We Collect</h2>
            <p className="text-secondary text-sm">We collect information you provide directly to us, including:</p>
            <ul className="flex-col gap-4 text-secondary text-sm pl-16">
              <li>Account information (name, email address, password)</li>
              <li>Profile information (display name, preferences)</li>
              <li>Usage data and interaction with our services</li>
              <li>Device information (browser type, operating system)</li>
            </ul>
          </div>
          {/* ... (Rest of the sections from previous response) ... */}
        </div>
      </div>
    </div>
  );
}