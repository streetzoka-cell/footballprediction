import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Code, HelpCircle, Mail, MessageCircle } from 'lucide-react';
import SEO from "../../components/SEO";

export default function Team() {
  return (
    <div className="company-page flex-center p-20">
      <SEO title="Meet the ZOKASCORE Developer" path="/team" />
      
      <article className="company-card w-full max-w-700 flex-col items-center text-center gap-24">
        <Link to="/" className="btn btn-ghost btn-sm self-start"><ArrowLeft size={16} /> Back</Link>
        
        <span className="badge badge-primary">Independent Developer</span>
        
        <h1 className="team-title">
          Built with passion.<br />
          <span>Powered by ZOKASCORE.</span>
        </h1>
        
        <p className="text-muted text-md">
          ZOKASCORE is independently designed, developed, and continuously improved by a single developer with a mission to create one of the best football prediction and live score platforms.
        </p>

        <div className="company-grid w-full">
          <div className="company-mini-card">
            <h2 className="font-extrabold text-primary text-2xl">1</h2>
            <p className="text-muted text-xs uppercase">Developer</p>
          </div>
          <div className="company-mini-card">
            <h2 className="font-extrabold text-primary text-2xl">100%</h2>
            <p className="text-muted text-xs uppercase">Built From Scratch</p>
          </div>
          <div className="company-mini-card">
            <h2 className="font-extrabold text-primary text-2xl">∞</h2>
            <p className="text-muted text-xs uppercase">Continuous Dev</p>
          </div>
        </div>

        <div className="flex justify-center flex-wrap gap-8">
          {['React', 'Vite', 'Node.js', 'Firebase', 'REST API', 'PWA', 'SEO', 'Vercel'].map(tech => (
            <span key={tech} className="badge badge-muted">{tech}</span>
          ))}
        </div>

        <div className="company-directory">
          <h3>Connect With Us</h3>
          <div className="dir-grid">
            <Link to="/contact" className="dir-link"><Mail size={16} /> Contact</Link>
            <Link to="/careers" className="dir-link"><Code size={16} /> Collaborate</Link>
            <Link to="/help-center" className="dir-link"><MessageCircle size={16} /> Help Center</Link>
          </div>
        </div>

        <p className="text-muted text-xs mt-16">&copy; {new Date().getFullYear()} ZOKASCORE. Built independently with passion for football.</p>
      </article>
    </div>
  );
}