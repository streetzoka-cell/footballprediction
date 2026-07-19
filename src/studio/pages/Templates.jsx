import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditorStore } from '../store/proEditorStore';
import { Newspaper, Trophy, Zap } from 'lucide-react';

const TEMPLATES = [
  {
    id: 'tpl_matchday_recap', name: 'Matchday Recap', category: 'Post Match', icon: <Trophy size={24} />, bg: 'linear-gradient(135deg, #1e293b, #0f172a)',
    config: {
      canvasSize: { width: 1080, height: 1350 },
      layers: [
        { type: 'rect', x: 0, y: 1050, width: 1080, height: 300, fill: 'rgba(0,0,0,0.8)' },
        { type: 'text', text: 'MATCHDAY RECAP', x: 40, y: 1090, fontSize: 50, fill: '#10b981', fontStyle: 'bold', fontFamily: 'Inter, sans-serif' },
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
        { type: 'rect', x: 140, y: 700, width: 800, height: 400, fill: 'rgba(16, 185, 129, 0.2)', cornerRadius: 20, stroke: '#10b981', strokeWidth: 2 },
        { type: 'text', text: 'GOAL!', x: 440, y: 780, fontSize: 100, fill: '#10b981', fontStyle: 'bold', fontFamily: 'Inter, sans-serif' },
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
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto', color: '#fff' }}>
      <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '8px' }}>Templates Library</h1>
      <p style={{ color: '#94a3b8', marginBottom: '32px' }}>Start instantly with professional football layouts.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {TEMPLATES.map(tpl => (
          <div key={tpl.id} onClick={() => loadTemplate(tpl)} style={{ background: tpl.bg, borderRadius: '16px', padding: '24px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)', minHeight: '200px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ background: 'rgba(255,255,255,0.1)', width: 'fit-content', padding: '8px', borderRadius: '10px', color: '#fff' }}>{tpl.icon}</div>
            <div>
              <span style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>{tpl.category}</span>
              <h3 style={{ fontSize: '20px', fontWeight: 800, margin: '4px 0 0 0' }}>{tpl.name}</h3>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}