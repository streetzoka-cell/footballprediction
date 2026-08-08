import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Brain, BookOpen, AlertTriangle, Lightbulb, ChevronRight, Scale, WifiOff } from 'lucide-react';

const BACKEND_URL = 'https://api.zokascore.xyz'; // Match your existing config

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

  if (loading) return <div className="min-h-screen bg-base-200 flex items-center justify-center">Loading Knowledge...</div>;
  
  if (error) {
    return (
      <div className="min-h-screen bg-base-200 flex flex-col items-center justify-center p-4">
        <WifiOff size={48} className="text-error mb-4" />
        <h2 className="text-xl font-bold mb-2">Connection Error</h2>
        <p className="text-sm opacity-70 mb-4 text-center">Could not load football knowledge. The backend server might be offline or updating.</p>
        <button onClick={() => navigate(-1)} className="btn btn-primary">Go Back</button>
      </div>
    );
  }

  // --- LAW DETAIL PAGE ---
  if (lawId && law) {
    return (
      <div className="min-h-screen bg-base-200 pb-20">
        <div className="bg-base-100 shadow-sm sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm btn-circle">
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <span>{law.emoji}</span> Law {law.lawNumber}: {law.title}
            </h1>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
          
          {/* Overview */}
          <div className="card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body">
              <h2 className="card-title text-primary">Overview</h2>
              <p className="text-sm leading-relaxed opacity-80">{law.overview}</p>
            </div>
          </div>

          {/* Sections (Plain English) */}
          <div className="space-y-4">
            {Object.values(law.sections).map((section, idx) => (
              <div key={idx} className="card bg-base-100 shadow-sm border border-base-300">
                <div className="card-body">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <BookOpen size={16} className="text-primary" /> {section.title}
                  </h3>
                  <p className="text-sm leading-relaxed opacity-90 bg-base-200 p-3 rounded-lg">
                    {section.plain_english}
                  </p>
                  <details className="mt-2">
                    <summary className="text-xs cursor-pointer text-primary opacity-70">View Authoritative IFAB Text</summary>
                    <p className="text-xs leading-relaxed opacity-60 mt-2 italic">{section.authoritative}</p>
                  </details>
                </div>
              </div>
            ))}
          </div>

          {/* Scenarios & Kim Integration */}
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Lightbulb size={20} className="text-warning" /> Test Scenarios
            </h2>
            <div className="space-y-4">
              {law.scenarios.map((s, idx) => (
                <div key={idx} className="card bg-base-100 shadow-sm border border-base-300">
                  <div className="card-body">
                    <p className="text-sm font-medium">{s.scenario}</p>
                    <div className="mt-3 p-3 bg-base-200 rounded-lg">
                      <p className="text-xs font-bold uppercase tracking-wide text-primary mb-1">Question</p>
                      <p className="text-sm">{s.question}</p>
                    </div>
                    <button 
                      onClick={() => handleAskKim(`Regarding Law ${law.lawNumber} (${law.title}): ${s.scenario} ${s.question}`)}
                      className="btn btn-primary btn-sm mt-4 gap-2"
                    >
                      <Brain size={14} /> Ask Kim to Analyze
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Misconceptions */}
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <AlertTriangle size={20} className="text-error" /> Common Misconceptions
            </h2>
            <div className="space-y-3">
              {law.misconceptions.map((m, idx) => (
                <div key={idx} className="collapse collapse-arrow bg-error/10 border border-error/20">
                  <input type="checkbox" />
                  <div className="collapse-title text-sm font-medium text-error">{m.myth}</div>
                  <div className="collapse-content text-sm opacity-80">
                    <p><strong>Fact:</strong> {m.fact}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    );
  }

  // --- LAWS DIRECTORY PAGE ---
  return (
    <div className="min-h-screen bg-base-200 pb-20">
      <div className="bg-base-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm btn-circle">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl font-bold">Football Knowledge</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="card bg-primary text-primary-content shadow-md mb-6">
          <div className="card-body">
            <h2 className="card-title text-2xl flex items-center gap-2"><Scale size={24} /> Laws of Football</h2>
            <p>Learn the game from the ground up. 17 Laws. One game.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {lawsList.map((l) => (
            <Link 
              to={`/football-knowledge/laws/${l.lawNumber}`} 
              key={l.lawNumber} 
              className="card bg-base-100 shadow-sm border border-base-300 hover:border-primary transition-all"
            >
              <div className="card-body p-4 flex-row items-center justify-between">
                <div>
                  <span className="text-xs text-primary font-bold">LAW {l.lawNumber}</span>
                  <h3 className="font-semibold text-md flex items-center gap-2">
                    <span>{l.emoji}</span> {l.title}
                  </h3>
                </div>
                <ChevronRight size={20} className="text-base-300" />
              </div>
            </Link>
          ))}
        </div>
      </div>
  fg  </div>
  );
}