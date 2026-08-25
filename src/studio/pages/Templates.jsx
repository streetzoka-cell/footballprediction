import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useEditorStore } from '../store/editorStore';
import { Newspaper, Trophy, Zap, Star, User, Shield, AlertTriangle, TrendingUp } from 'lucide-react';
import SEO from '../../components/SEO';

const TEMPLATES = [
  {
    id: 'tpl_matchday_recap', name: 'Matchday Recap', category: 'Post Match', icon: <Trophy size={24} />, bg: 'linear-gradient(135deg, #1e293b, #0f172a)',
    config: { canvasSize: { width: 1080, height: 1350 }, layers: [
      { type: 'rect', x: 0, y: 1050, width: 1080, height: 300, fill: 'rgba(0,0,0,0.85)' },
      { type: 'text', text: 'MATCHDAY RECAP', x: 40, y: 1090, fontSize: 50, fill: '#16c784', fontStyle: 'bold', fontFamily: 'Inter, sans-serif' },
      { type: 'text', text: 'Tap to edit text', x: 40, y: 1160, fontSize: 40, fill: '#ffffff', fontStyle: 'bold', fontFamily: 'Inter, sans-serif' }
    ]}
  },
  {
    id: 'tpl_transfer_news', name: 'Transfer Breaking', category: 'News', icon: <Newspaper size={24} />, bg: 'linear-gradient(135deg, #7f1d1d, #450a0a)',
    config: { canvasSize: { width: 1080, height: 1920 }, layers: [
      { type: 'rect', x: 0, y: 1400, width: 1080, height: 520, fill: 'rgba(0,0,0,0.9)' },
      { type: 'rect', x: 0, y: 1400, width: 12, height: 520, fill: '#ef4444' },
      { type: 'text', text: 'BREAKING NEWS', x: 40, y: 1450, fontSize: 60, fill: '#ef4444', fontStyle: 'bold', fontFamily: 'Inter, sans-serif' },
      { type: 'text', text: 'Player Signs New Contract', x: 40, y: 1540, fontSize: 45, fill: '#ffffff', fontStyle: 'bold', fontFamily: 'Inter, sans-serif' },
      { type: 'text', text: 'Read more at zokascore.com', x: 40, y: 1700, fontSize: 30, fill: '#94a3b8', fontFamily: 'Inter, sans-serif' }
    ]}
  },
  {
    id: 'tpl_goal_alert', name: 'Goal Alert', category: 'Live', icon: <Zap size={24} />, bg: 'linear-gradient(135deg, #14532d, #052e16)',
    config: { canvasSize: { width: 1080, height: 1920 }, layers: [
      { type: 'rect', x: 140, y: 700, width: 800, height: 400, fill: 'rgba(22, 199, 132, 0.15)', cornerRadius: 20, stroke: '#16c784', strokeWidth: 4 },
      { type: 'text', text: 'GOAL!', x: 540, y: 780, fontSize: 120, fill: '#16c784', fontStyle: 'bold', fontFamily: 'Impact, sans-serif', align: 'center', width: 800 },
      { type: 'text', text: '90+4\'', x: 540, y: 920, fontSize: 60, fill: '#ffffff', fontStyle: 'bold', fontFamily: 'Inter, sans-serif', align: 'center', width: 800 }
    ]}
  },
  {
    id: 'tpl_man_of_match', name: 'Man of the Match', category: 'Awards', icon: <Star size={24} />, bg: 'linear-gradient(135deg, #78350f, #451a03)',
    config: { canvasSize: { width: 1080, height: 1080 }, layers: [
      { type: 'rect', x: 0, y: 0, width: 1080, height: 1080, fill: 'rgba(0,0,0,0.6)' },
      { type: 'text', text: 'MAN OF THE MATCH', x: 540, y: 150, fontSize: 60, fill: '#fbbf24', fontStyle: 'bold', fontFamily: 'Inter, sans-serif', align: 'center', width: 1080 },
      { type: 'circle', x: 540, y: 500, radius: 200, fill: '#fbbf24', opacity: 0.2 },
      { type: 'text', text: 'PLAYER NAME', x: 540, y: 800, fontSize: 80, fill: '#ffffff', fontStyle: 'bold', fontFamily: 'Inter, sans-serif', align: 'center', width: 1080 },
      { type: 'text', text: '9.5 Rating', x: 540, y: 900, fontSize: 40, fill: '#fbbf24', fontStyle: 'bold', fontFamily: 'Inter, sans-serif', align: 'center', width: 1080 }
    ]}
  },
  {
    id: 'tpl_red_card', name: 'Red Card Sent', category: 'Live', icon: <AlertTriangle size={24} />, bg: 'linear-gradient(135deg, #991b1b, #450a0a)',
    config: { canvasSize: { width: 1080, height: 1920 }, layers: [
      { type: 'rect', x: 390, y: 600, width: 300, height: 450, fill: '#ef4444', cornerRadius: 16 },
      { type: 'text', text: 'SENT OFF!', x: 540, y: 1150, fontSize: 80, fill: '#ffffff', fontStyle: 'bold', fontFamily: 'Impact, sans-serif', align: 'center', width: 1080 },
      { type: 'text', text: '65\' - Dangerous Tackle', x: 540, y: 1250, fontSize: 40, fill: '#fca5a5', fontStyle: 'bold', fontFamily: 'Inter, sans-serif', align: 'center', width: 1080 }
    ]}
  },
  {
    id: 'tpl_player_stats', name: 'Player Stats', category: 'Analysis', icon: <TrendingUp size={24} />, bg: 'linear-gradient(135deg, #1e3a8a, #172554)',
    config: { canvasSize: { width: 1080, height: 1080 }, layers: [
      { type: 'rect', x: 0, y: 0, width: 1080, height: 1080, fill: '#0f172a' },
      { type: 'rect', x: 40, y: 200, width: 1000, height: 800, fill: '#1e293b', cornerRadius: 24 },
      { type: 'text', text: 'MATCH STATS', x: 540, y: 100, fontSize: 50, fill: '#3b82f6', fontStyle: 'bold', fontFamily: 'Inter, sans-serif', align: 'center', width: 1080 },
      { type: 'text', text: 'Possession: 65%', x: 100, y: 350, fontSize: 40, fill: '#ffffff', fontFamily: 'Inter, sans-serif' },
      { type: 'text', text: 'Shots on Target: 8', x: 100, y: 450, fontSize: 40, fill: '#ffffff', fontFamily: 'Inter, sans-serif' },
      { type: 'text', text: 'Pass Accuracy: 92%', x: 100, y: 550, fontSize: 40, fill: '#ffffff', fontFamily: 'Inter, sans-serif' },
      { type: 'text', text: 'xG: 2.45', x: 100, y: 650, fontSize: 40, fill: '#10b981', fontStyle: 'bold', fontFamily: 'Inter, sans-serif' }
    ]}
  },
  {
    id: 'tpl_injury_update', name: 'Injury Update', category: 'News', icon: <User size={24} />, bg: 'linear-gradient(135deg, #475569, #1e293b)',
    config: { canvasSize: { width: 1080, height: 1350 }, layers: [
      { type: 'rect', x: 0, y: 900, width: 1080, height: 450, fill: 'rgba(0,0,0,0.8)' },
      { type: 'rect', x: 0, y: 900, width: 1080, height: 8, fill: '#f59e0b' },
      { type: 'text', text: 'INJURY UPDATE', x: 40, y: 960, fontSize: 50, fill: '#f59e0b', fontStyle: 'bold', fontFamily: 'Inter, sans-serif' },
      { type: 'text', text: 'Star striker out for 3 weeks', x: 40, y: 1040, fontSize: 40, fill: '#ffffff', fontStyle: 'bold', fontFamily: 'Inter, sans-serif' },
      { type: 'text', text: 'Hamstring issue in training', x: 40, y: 1120, fontSize: 30, fill: '#94a3b8', fontFamily: 'Inter, sans-serif' }
    ]}
  },
  {
    id: 'tpl_half_time', name: 'Half Time Score', category: 'Live', icon: <Shield size={24} />, bg: 'linear-gradient(135deg, #334155, #0f172a)',
    config: { canvasSize: { width: 1080, height: 1080 }, layers: [
      { type: 'rect', x: 140, y: 340, width: 800, height: 400, fill: 'rgba(255,255,255,0.05)', cornerRadius: 20, stroke: '#475569', strokeWidth: 2 },
      { type: 'text', text: 'HALF TIME', x: 540, y: 420, fontSize: 40, fill: '#94a3b8', fontStyle: 'bold', fontFamily: 'Inter, sans-serif', align: 'center', width: 800 },
      { type: 'text', text: '2 - 1', x: 540, y: 580, fontSize: 140, fill: '#ffffff', fontStyle: 'bold', fontFamily: 'Impact, sans-serif', align: 'center', width: 800 }
    ]}
  }
];

export default function Templates() {
  const navigate = useNavigate();
  const setProject = useEditorStore((state) => state.setProject);

  const loadTemplate = (template) => {
    const newProject = { 
      id: `proj_${Date.now()}`, 
      name: template.name, 
      matchData: null,
      ...template.config 
    };
    setProject(newProject);
    navigate('/studio/editor');
  };

  return (
    <div className="zoka-page">
      <SEO title="Pro Football Templates | ZOKASCORE Studio" description="Start instantly with professional football layouts for goals, news, stats, and awards." path="/studio/templates" />
      <div className="zoka-wrap text-center flex-col items-center">
        <h1 className="text-primary font-extrabold text-2xl mt-24 mb-8">Pro Football Templates</h1>
        <p className="text-muted mb-32">Start instantly with professional layouts for goals, news, stats, and awards.</p>
        <div className="grid w-full gap-20" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {TEMPLATES.map(tpl => (
            <div key={tpl.id} onClick={() => loadTemplate(tpl)} className="glass-card p-24 cursor-pointer flex-col gap-12 transition-transform hover:scale-105" style={{ background: tpl.bg, minHeight: '200px', justifyContent: 'space-between' }}>
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