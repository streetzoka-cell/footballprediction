import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchFixtures } from '../../utils/api';
import { getLocalDateStr } from '../../utils/dates';
import { useEditorStore } from '../store/editorStore';
import { fetchUserProjects, deleteProject } from '../services/studioService';
import { LayoutGrid, Clock, Trash2, Video, Image, Plus, Folder, Camera, Sparkles, Monitor, Film, Zap } from 'lucide-react';

export default function StudioHome() {
  const navigate = useNavigate();
  const setProject = useEditorStore((state) => state.setProject);
  const [matches, setMatches] = useState([]);
  const [savedProjects, setSavedProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const today = getLocalDateStr(0);
        const res = await fetchFixtures(today);
        const list = Array.isArray(res) ? res : res?.matches || [];
        setMatches(list.slice(0, 10));
        const projects = fetchUserProjects();
        setSavedProjects(projects.sort((a, b) => b.updatedAt - a.updatedAt));
      } catch (err) {} finally { setLoading(false); }
    };
    loadInitialData();
  }, []);

  const handleQuickCreate = (match) => {
    const newProject = {
      id: `proj_${Date.now()}`, name: `${match.homeTeam?.name || 'Home'} vs ${match.awayTeam?.name || 'Away'}`,
      type: 'Scoreboard', canvasSize: { width: 1080, height: 1920 }, matchData: match,
      layers: [
        { id: 'bg_layer', type: 'rect', x: 0, y: 750, width: 1080, height: 420, fill: 'rgba(10, 15, 26, 0.85)', cornerRadius: 0 },
        { id: 'home_logo', type: 'image', src: match.homeTeam?.crest, x: 150, y: 850, width: 150, height: 150 },
        { id: 'away_logo', type: 'image', src: match.awayTeam?.crest, x: 780, y: 850, width: 150, height: 150 },
        { id: 'score_text', type: 'text', text: `${match.score?.fullTime?.home ?? 0} - ${match.score?.fullTime?.away ?? 0}`, x: 440, y: 870, fontSize: 100, fontStyle: 'bold', fill: '#ffffff', fontFamily: 'Inter, sans-serif' }
      ]
    };
    setProject(newProject);
    navigate('/studio/editor');
  };

  const openSavedProject = (proj) => { setProject(proj); navigate('/studio/editor'); };
  const handleDelete = (e, projectId) => { e.stopPropagation(); deleteProject(projectId); setSavedProjects(prev => prev.filter(p => p.id !== projectId)); };

  const getProjectIcon = (proj) => {
    if (proj.layers?.some(l => l.type === 'video')) return <Video size={24} color="#3b82f6" />;
    if (proj.type === 'Scoreboard') return <Film size={24} color="#10b981" />;
    return <Image size={24} color="#f59e0b" />;
  };

  const studioTools = [
    { title: 'Graphic Editor', desc: 'Build custom graphics & scoreboards', icon: <LayoutGrid size={28} />, bg: 'linear-gradient(135deg, #1e293b, #0f172a)', route: '/studio/templates' },
    { title: 'Viral Reactor Studio', desc: 'TikTok/IG Reels templates & effects', icon: <Zap size={28} />, bg: 'linear-gradient(135deg, #831843, #4a044e)', route: '/studio/reactor' },
    { title: 'Web Showcase Studio', desc: 'Record screen & webcam for demos', icon: <Monitor size={28} />, bg: 'linear-gradient(135deg, #155e75, #083344)', route: '/studio/web-showcase' },
    { title: 'Reaction Cam', desc: 'Record facecam reactions', icon: <Camera size={28} />, bg: 'linear-gradient(135deg, #7f1d1d, #450a0a)', route: '/studio/media' },
    { title: 'Face AR Studio', desc: 'Apply AR masks & filters', icon: <Sparkles size={28} />, bg: 'linear-gradient(135deg, #312e81, #1e1b4b)', route: '/studio/face-ar' },
  ];

  return (
    <div className="studio-home-page">
      <div className="studio-home-container">
        
        <div className="studio-home-header">
          <h1 className="studio-home-title">ZOKASCORE Studio</h1>
          <p className="studio-home-subtitle">The ultimate toolkit for football creators.</p>
        </div>

        <div className="studio-tools-grid">
          {studioTools.map((tool, i) => (
            <div key={i} className="studio-tool-card" style={{ background: tool.bg }} onClick={() => navigate(tool.route)}>
              <div className="studio-tool-icon">{tool.icon}</div>
              <span className="studio-tool-title">{tool.title}</span>
              <span className="studio-tool-desc">{tool.desc}</span>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: '60px' }}>
          <div className="studio-section-header">
            <Folder size={22} color="#10b981" />
            <h2 className="studio-section-title">My Projects</h2>
          </div>
          
          {savedProjects.length === 0 ? (
            <div className="studio-empty-projects">
              <Plus size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
              <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No saved projects yet</p>
              <p style={{ fontSize: '13px' }}>Pick a tool above to start creating!</p>
            </div>
          ) : (
            <div className="studio-projects-grid">
              {savedProjects.map(p => (
                <div key={p.id} className="studio-project-card" onClick={() => openSavedProject(p)}>
                  <div className="studio-project-thumb">{getProjectIcon(p)}</div>
                  <div className="studio-project-info">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <span className="studio-project-name">{p.name}</span>
                      <button onClick={(e) => handleDelete(e, p.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0', display: 'flex' }}><Trash2 size={14} /></button>
                    </div>
                    <span className="studio-project-date">
                      <Clock size={10} /> {new Date(p.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="studio-section-header">
            <Zap size={22} color="#f59e0b" />
            <h2 className="studio-section-title">Quick Create (Today's Matches)</h2>
          </div>
          
          <div className="studio-quick-create-list">
            {loading ? (
              <div className="studio-empty-projects">Loading today's fixtures...</div>
            ) : matches.length === 0 ? (
              <div className="studio-empty-projects">No matches found for today.</div>
            ) : (
              matches.map(m => (
                <div key={m.id} className="studio-quick-create-item" onClick={() => handleQuickCreate(m)}>
                  <div className="studio-match-info">
                    <img src={m.homeTeam?.crest} alt="" style={{ width: '28px', height: '28px' }} onError={(e) => e.target.style.display = 'none'} />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="studio-team-name">{m.homeTeam?.shortName || m.homeTeam?.name}</span>
                      <span className="studio-vs-text">vs</span>
                      <span className="studio-team-name">{m.awayTeam?.shortName || m.awayTeam?.name}</span>
                    </div>
                    <img src={m.awayTeam?.crest} alt="" style={{ width: '28px', height: '28px' }} onError={(e) => e.target.style.display = 'none'} />
                  </div>
                  <button className="rs-btn-sm rs-btn-accent" style={{ padding: '8px 16px', fontSize: '13px' }}>
                    <Plus size={14} /> Create
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}