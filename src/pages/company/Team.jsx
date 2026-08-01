import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import SEO from "../../components/SEO";

export default function Team() {
  return (
    <div className="zoka-page flex-center p-20">
      <SEO
        title="Meet the ZOKASCORE Developer"
        description="Meet the developer behind ZOKASCORE. Discover the story, technology, and vision powering the football predictions, fixtures, live scores, and community platform."
        keywords="ZOKASCORE developer, football prediction platform, sports technology, React, Firebase, Node.js"
        path="/team"
        robots="index,follow"
        breadcrumbs={[{ name: "Home", path: "/" }, { name: "Team", path: "/team" }]}
      />
      
      <div className="glass-card p-32 w-full max-w-700 flex-col items-center text-center gap-24">
        <Link to="/" className="btn btn-ghost btn-sm self-start"><ArrowLeft size={16} /> Back</Link>
        
        <span className="badge badge-primary">Independent Developer</span>
        
        <h1 className="text-primary font-extrabold" style={{ fontSize: 'clamp(40px, 8vw, 72px)', lineHeight: 1.1, background: 'linear-gradient(135deg, var(--text-primary) 0%, var(--text-muted) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Built with passion.<br />
          <span className="text-primary" style={{ WebkitTextFillColor: 'var(--primary)' }}>Powered by ZOKASCORE.</span>
        </h1>
        
        <p className="text-muted text-md" style={{ maxWidth: 550 }}>
          ZOKASCORE is independently designed, developed, and continuously improved by a single developer with a mission to create one of the best football prediction and live score platforms.
        </p>

        <div className="grid w-full gap-12" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="glass-card p-16 flex-col items-center gap-4">
            <h2 className="font-extrabold text-primary text-2xl">1</h2>
            <p className="text-muted text-xs uppercase">Developer</p>
          </div>
          <div className="glass-card p-16 flex-col items-center gap-4">
            <h2 className="font-extrabold text-primary text-2xl">100%</h2>
            <p className="text-muted text-xs uppercase">Built From Scratch</p>
          </div>
          <div className="glass-card p-16 flex-col items-center gap-4">
            <h2 className="font-extrabold text-primary text-2xl">∞</h2>
            <p className="text-muted text-xs uppercase">Continuous Dev</p>
          </div>
        </div>

        <div className="flex justify-center flex-wrap gap-8">
          {['React', 'Vite', 'Node.js', 'Firebase', 'REST API', 'PWA', 'SEO', 'Vercel'].map(tech => (
            <span key={tech} className="badge badge-muted">{tech}</span>
          ))}
        </div>

        <div className="w-full flex-col items-center gap-12 pt-24 border-t border-border">
          <p className="text-muted text-sm">Interested in collaborating, partnering, or sharing ideas to improve ZOKASCORE?</p>
          <Link to="/contact" className="btn btn-outline">Let's Connect</Link>
        </div>

        <p className="text-muted text-xs mt-16">© {new Date().getFullYear()} ZOKASCORE. Built independently with passion for football.</p>
      </div>
    </div>
  );
}