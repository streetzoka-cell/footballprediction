import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  ArrowLeft, Code, Server, Activity, BarChart3, Database, 
  GitCommit, ShieldCheck, Copy, Check, Terminal, Cpu, Globe
} from 'lucide-react';
import SEO from '../components/SEO';

const endpoints = [
  { method: 'GET', path: '/api/v1/data/live.json', desc: 'Real-time live scores, match minutes, and basic stats for all in-play matches globally.', format: 'JSON Array' },
  { method: 'GET', path: '/api/v1/data/fixtures/{date}.json', desc: 'Scheduled fixtures and pre-match data for a specific date (YYYY-MM-DD).', format: 'JSON Array' },
  { method: 'GET', path: '/api/v1/data/results/{date}.json', desc: 'Final scores and historical results for a specific date (YYYY-MM-DD).', format: 'JSON Array' },
  { method: 'GET', path: '/api/v1/match/{matchId}', desc: 'Canonical Match Object. Aggregates live data, historical intelligence, Elo, Form, and H2H into one unified payload.', format: 'JSON Object' },
  { method: 'GET', path: '/api/v1/intelligence/team/{teamName}', desc: 'Deep Team Intelligence. Returns overall form, goal patterns (Over 2.5%, BTTS%), and resilience stats.', format: 'JSON Object' },
  { method: 'GET', path: '/api/v1/intelligence/h2h/{teamA}/{teamB}', desc: 'Head-to-Head Intelligence. All-time meetings, wins, draws, and goal markets between two specific teams.', format: 'JSON Object' }
];

const EndpointCard = ({ ep }) => {
  const [copied, setCopied] = useState(false);
  const fullUrl = `https://api.zokascore.xyz${ep.path}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(`curl ${fullUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass-card dev-endpoint-card">
      <div className="flex-between items-center gap-12 flex-wrap">
        <div className="flex-center gap-8 flex-wrap">
          <span className="badge badge-primary text-xs font-mono">{ep.method}</span>
          <code className="text-primary font-mono text-sm font-bold break-all">{ep.path}</code>
        </div>
        <span className="badge badge-muted text-xs">{ep.format}</span>
      </div>
      <p className="text-muted text-sm leading-relaxed">{ep.desc}</p>
      <div className="dev-code-block">
        <div className="dev-code-text">
          <Terminal size={14} className="flex-shrink-0" />
          <span>curl {fullUrl}</span>
        </div>
        <button onClick={handleCopy} className="btn-icon-sm flex-shrink-0" title="Copy curl command">
          {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
};

export default function Developers() {
  return (
    <div className="zoka-page">
      <SEO 
        title="ZOKASCORE API | Football Data & Intelligence for Developers"
        description="Access real-time live scores, historical fixtures, team form, H2H data, and transparent AI predictions via the ZOKASCORE API. Machine-readable football intelligence."
        keywords="football API, live scores API, football data provider, prediction API, soccer data, developer tools, ZOKASCORE"
        path="/developers"
        robots="index,follow"
      />
      
      <div className="dev-page">
        <Link to="/" className="btn btn-ghost btn-sm mb-20">
          <ArrowLeft size={14} /> Back to Home
        </Link>

        {/* Hero Section */}
        <section className="text-center mb-40 mt-20">
          <div className="dev-hero-icon">
            <Code size={32} className="text-primary" />
          </div>
          <h1 className="text-primary font-extrabold text-3xl mb-12">ZOKASCORE API</h1>
          <p className="text-muted text-lg mx-auto leading-relaxed" style={{ maxWidth: '600px' }}>
            Real-time football data, deep historical intelligence, and transparent prediction models. Built for developers, researchers, and data companies.
          </p>
        </section>

        {/* Data Coverage & Infrastructure */}
        <section className="dev-section">
          <h2 className="dev-section-title"><Database size={20} /> Data Coverage & Infrastructure</h2>
          <div className="dev-grid">
            <div className="glass-card dev-stat-card">
              <Activity size={20} className="text-danger" />
              <span className="text-primary font-extrabold text-xl">Real-time</span>
              <span className="text-muted text-xs uppercase">Live Matches</span>
            </div>
            <div className="glass-card dev-stat-card">
              <Globe size={20} className="text-primary" />
              <span className="text-primary font-extrabold text-xl">254</span>
              <span className="text-muted text-xs uppercase">Competitions</span>
            </div>
            <div className="glass-card dev-stat-card">
              <Server size={20} className="text-accent" />
              <span className="text-primary font-extrabold text-xl">227,000+</span>
              <span className="text-muted text-xs uppercase">Historical Matches</span>
            </div>
            <div className="glass-card dev-stat-card">
              <Cpu size={20} className="text-gold" />
              <span className="text-primary font-extrabold text-xl">3,600+</span>
              <span className="text-muted text-xs uppercase">Teams Tracked</span>
            </div>
          </div>
        </section>

        {/* Honest Model Audit */}
        <section className="dev-section">
          <h2 className="dev-section-title"><ShieldCheck size={20} /> Prediction Performance & Audit</h2>
          <div className="glass-card dev-audit-card">
            <p className="text-secondary text-sm leading-relaxed mb-16">
              At ZOKASCORE, we believe in radical transparency. Our AI models are continuously evaluated using walk-forward validation and strict out-of-sample testing. We do not publish fake "winning streaks." Instead, we publish our immutable bet ledger.
            </p>
            <div className="dev-audit-grid">
              <div className="dev-audit-stat">
                <div className="text-muted text-xs uppercase mb-4">2024 OOS ROI</div>
                <div className="text-danger font-extrabold text-lg">-6.09%</div>
                <div className="text-muted text-xs mt-4">881 Bets Placed</div>
              </div>
              <div className="dev-audit-stat">
                <div className="text-muted text-xs uppercase mb-4">2025 OOS ROI</div>
                <div className="text-danger font-extrabold text-lg">-13.67%</div>
                <div className="text-muted text-xs mt-4">563 Bets Placed</div>
              </div>
              <div className="dev-audit-stat">
                <div className="text-muted text-xs uppercase mb-4">Model Status</div>
                <div className="text-gold font-extrabold text-lg">Under Evaluation</div>
                <div className="text-muted text-xs mt-4">V1 Not Deployed</div>
              </div>
            </div>
            <p className="text-muted text-xs mt-16 italic">
              * Past performance is not evidence of future performance. ZOKASCORE refused to launch its V1 model as a "profitable betting bot" because it failed its own out-of-sample audit.
            </p>
          </div>
        </section>

        {/* API Endpoints Documentation */}
        <section className="dev-section">
          <h2 className="dev-section-title"><Server size={20} /> API Endpoints</h2>
          <div className="flex-col gap-8">
            {endpoints.map((ep, i) => <EndpointCard key={i} ep={ep} />)}
          </div>
        </section>

        {/* Example Usage */}
        <section className="dev-section">
          <h2 className="dev-section-title"><Terminal size={20} /> Example Usage</h2>
          <div className="glass-card p-20">
            <p className="text-muted text-sm mb-12">
              Fetch live scores directly from your terminal or application:
            </p>
            <div className="dev-code-block flex-col gap-4" style={{ alignItems: 'flex-start', padding: 'var(--sp-16)' }}>
              <span className="text-muted">$</span> curl https://api.zokascore.xyz/api/v1/data/live.json
              <br /><br />
              <span className="text-primary">{'{'}</span>
              <br />  <span className="text-accent">"success"</span>: <span className="text-gold">true</span>,
              <br />  <span className="text-accent">"data"</span>: [
              <br />    <span className="text-muted">{'{ "id": "1142", "homeName": "Arsenal", "awayName": "Chelsea", "isLive": true, "homeScore": 1, "awayScore": 0 }'}</span>
              <br />  ]
              <br /><span className="text-primary">{'}'}</span>
            </div>
          </div>
        </section>

        {/* Footer Call to Action */}
        <section className="text-center mt-40 mb-40">
          <h3 className="text-primary font-bold text-lg mb-8">Build with ZOKASCORE</h3>
          <p className="text-muted text-sm mb-16 mx-auto" style={{ maxWidth: '500px' }}>
            Stop scraping unreliable websites. Use a unified, canonical football data source designed for machines.
          </p>
          <Link to="/contact" className="btn btn-primary">
            Contact for Enterprise Access
          </Link>
        </section>

      </div>
    </div>
  );
}