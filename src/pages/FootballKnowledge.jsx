import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Brain, BookOpen, AlertTriangle, Lightbulb, ChevronRight, Scale, WifiOff } from 'lucide-react';

const BACKEND_URL = 'https://api.zokascore.xyz'; 

export default function FootballKnowledge() {
  const { lawId } = useParams();
  const navigate = useNavigate();
  const [law, setLaw] = useState(null);
  const [lawsList, setLawsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const fetchUrl = lawId 
      ? `${BACKEND_URL}/api/v1/knowledge/laws/${lawId}`
      : `${BACKEND_URL}/api/v1/knowledge/laws`;
      
    fetch(fetchUrl)
      .then(res => {
        if (!res.ok) throw new Error("Failed to connect to the server.");
        return res.json();
      })
      .then(data => {
        if (lawId) {
          setLaw(data.law);
        } else {
          setLawsList(data.laws || []);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [lawId]);

  const handleAskKim = (scenarioQuestion) => {
    window.dispatchEvent(new CustomEvent('openZokaAI', { detail: { message: scenarioQuestion } }));
  };

  if (loading) return <div className="fk-page flex-center">Loading Knowledge...</div>;
  
  if (error) {
    return (
      <div className="fk-page flex-col items-center justify-center p-16">
        <WifiOff size={48} className="text-danger mb-16" />
        <h2 className="text-xl font-bold mb-8">Connection Error</h2>
        <p className="text-sm text-muted mb-16 text-center">Could not load football knowledge. The backend server might be offline or updating.</p>
        <button onClick={() => navigate(-1)} className="btn btn-primary">Go Back</button>
      </div>
    );
  }

  // --- LAW DETAIL PAGE ---
  if (lawId && law) {
    return (
      <div className="fk-page">
        <div className="fk-header">
          <div className="fk-header-inner">
            <button onClick={() => navigate(-1)} className="btn-icon btn-ghost">
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-xl font-bold flex-center gap-8">
              <span>{law.emoji}</span> Law {law.lawNumber}: {law.title}
            </h1>
          </div>
        </div>

        <div className="fk-container">
          
          {/* Overview */}
          <div className="fk-card">
            <h2 className="fk-card-title text-primary">Overview</h2>
            <p className="text-sm leading-relaxed text-secondary">{law.overview}</p>
          </div>

          {/* Sections (Plain English) */}
          <div className="flex-col gap-16">
            {Object.values(law.sections).map((section, idx) => (
              <div key={idx} className="fk-card">
                <h3 className="font-semibold text-lg flex-center gap-8">
                  <BookOpen size={16} className="text-primary" /> {section.title}
                </h3>
                <p className="fk-plain-english mt-12">
                  {section.plain_english}
                </p>
                <details className="mt-8">
                  <summary className="text-xs cursor-pointer text-primary opacity-70">View Authoritative IFAB Text</summary>
                  <p className="fk-ifab-text">{section.authoritative}</p>
                </details>
              </div>
            ))}
          </div>

          {/* Scenarios & Kim Integration */}
          <div>
            <h2 className="text-xl font-bold mb-16 flex-center gap-8">
              <Lightbulb size={20} className="text-warning" /> Test Scenarios
            </h2>
            <div className="flex-col gap-16">
              {law.scenarios.map((s, idx) => (
                <div key={idx} className="fk-scenario-card">
                  <p className="text-sm font-medium text-primary">{s.scenario}</p>
                  <div className="fk-question-box">
                    <p className="text-xs font-bold uppercase tracking-wide text-primary mb-4">Question</p>
                    <p className="text-sm text-secondary">{s.question}</p>
                  </div>
                  <button 
                    onClick={() => handleAskKim(`Regarding Law ${law.lawNumber} (${law.title}): ${s.scenario} ${s.question}`)}
                    className="btn btn-primary btn-sm mt-12 gap-8"
                  >
                    <Brain size={14} /> Ask Kim to Analyze
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Misconceptions */}
          <div>
            <h2 className="text-xl font-bold mb-16 flex-center gap-8">
              <AlertTriangle size={20} className="text-danger" /> Common Misconceptions
            </h2>
            <div className="flex-col gap-12">
              {law.misconceptions.map((m, idx) => (
                <details key={idx} className="fk-misconception">
                  <summary className="text-sm font-medium">{m.myth}</summary>
                  <p><strong>Fact:</strong> {m.fact}</p>
                </details>
              ))}
            </div>
          </div>

        </div>
      </div>
    );
  }

  // --- LAWS DIRECTORY PAGE ---
  return (
    <div className="fk-page">
      <div className="fk-header">
        <div className="fk-header-inner">
          <button onClick={() => navigate(-1)} className="btn-icon btn-ghost">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl font-bold">Football Knowledge</h1>
        </div>
      </div>

      <div className="fk-container">
        <div className="fk-hero-card">
          <h2 className="text-2xl flex-center gap-8"><Scale size={24} /> Laws of Football</h2>
          <p>Learn the game from the ground up. 17 Laws. One game.</p>
        </div>

        <div className="grid gap-16" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
          {lawsList.map((l) => (
            <Link 
              to={`/football-knowledge/laws/${l.lawNumber}`} 
              key={l.lawNumber} 
              className="glass-card flex-row items-center justify-between p-16 hover:border-primary transition-fast"
            >
              <div>
                <span className="text-xs text-primary font-bold">LAW {l.lawNumber}</span>
                <h3 className="font-semibold text-md flex-center gap-8">
                  <span>{l.emoji}</span> {l.title}
                </h3>
              </div>
              <ChevronRight size={20} className="text-muted" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}