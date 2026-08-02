// footballprediction/src/studio/pages/Templates.jsx

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditorStore } from '../store/editorStore';
import { Newspaper, Trophy, Zap } from 'lucide-react';
import SEO from '../../components/SEO';

const TEMPLATES = [
  {
    id: 'tpl_matchday_recap', name: 'Matchday Recap', category: 'Post Match', icon: <Trophy size={24} />, bg: 'linear-gradient(135deg, #1e293b, #0f172a)',
    config: {
      canvasSize: { width: 1080, height: 1350 },
      layers: [
        { type: 'rect', x: 0, y: 1050, width: 1080, height: 300, fill: 'rgba(0,0,0,0.8)' },
        { type: 'text', text: 'MATCHDAY RECAP', x: 40, y: 1090, fontSize: 50, fill: '#16c784', fontStyle: 'bold', fontFamily: 'Inter, sans-serif' },
        { type: 'text', text: 'Tap to edit text', x: 40, y: 1160, fontSize: 40, fill: '#ffffff', fontStyle: 'bold', fontFamily: 'Inter, sans-serif' },
        { type: 'rect', x: 40, y: 1220, width: 1000, height: 6, fill: '#334155', cornerRadius: 3 }
      ]
    }
  },
  {
    id: 'tpl_transfer_news', name: 'Transfer Breaking', category: 'News', icon: <Newspaper size={24} />, bg: 'linear-gradient(135deg, #7f1d1d, #450a0a)',
    config: {
      canvasSize: { width: 1080, height: 1920 },
      layers: [
        { type: 'rect', x: 0, y: 1400, width: 1080, height: 520, fill: 'rgba(0,0,0,0.85)' },
        { type: 'text', text: 'BREAKING NEWS', x: 40, y: 1450, fontSize: 60, fill: '#ef4444', fontStyle: 'bold', fontFamily: 'Inter, sans-serif' },
        { type: 'text', text: 'Player Signs New Contract', x: 40, y: 1540, fontSize: 45, fill: '#ffffff', fontStyle: 'bold', fontFamily: 'Inter, sans-serif' },
        { type: 'text', text: 'Read more at zokascore.com', x: 40, y: 1700, fontSize: 30, fill: '#94a3b8', fontFamily: 'Inter, sans-serif' }
      ]
    }
  },
  {
    id: 'tpl_goal_alert', name: 'Goal Alert', category: 'Live', icon: <Zap size={24} />, bg: 'linear-gradient(135deg, #14532d, #052e16)',
    config: {
      canvasSize: { width: 1080, height: 1920 },
      layers: [
        { type: 'rect', x: 140, y: 700, width: 800, height: 400, fill: 'rgba(22, 199, 132, 0.2)', cornerRadius: 20, stroke: '#16c784', strokeWidth: 2 },
        { type: 'text', text: 'GOAL!', x: 440, y: 780, fontSize: 100, fill: '#16c784', fontStyle: 'bold', fontFamily: 'Inter, sans-serif' },
        { type: 'text', text: '0 - 0', x: 470, y: 920, fontSize: 80, fill: '#ffffff', fontStyle: 'bold', fontFamily: 'Inter, sans-serif' }
      ]
    }
  }
];

export default function Templates() {
  const navigate = useNavigate();
  const setProject = useEditorStore((state) => state.setProject);

  const loadTemplate = (template) => {
    const newProject = { ...template.config, id: `proj_${Date.now()}`, name: template.name, matchData: null };
    setProject(newProject);
    navigate('/studio/editor');
  };

  return (
    <div className="zoka-page">
      <SEO title="Templates Library" description="Start instantly with professional football layouts." path="/studio/templates" />
      <div className="zoka-wrap text-center flex-col items-center">
        <h1 className="text-primary font-extrabold text-2xl mt-24 mb-8">Templates Library</h1>
        <p className="text-muted mb-32">Start instantly with professional football layouts.</p>
        <div className="grid w-full gap-20" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {TEMPLATES.map(tpl => (
            <div key={tpl.id} onClick={() => loadTemplate(tpl)} className="glass-card p-24 cursor-pointer flex-col gap-12" style={{ background: tpl.bg, minHeight: '200px', justifyContent: 'space-between' }}>
              <div className="glass-card flex-center p-8 w-fit" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}>{tpl.icon}</div>
              <div className="text-left">
                <span className="text-muted text-xs font-bold uppercase">{tpl.category}</span>
                <h3 className="text-primary font-bold text-md mt-4">{tpl.name}</h3>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
