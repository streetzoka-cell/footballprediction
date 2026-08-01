// src/studio/pages/StudioHome.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { footballApi } from "../../services/footballApi";
import { getLocalDateStr } from '../../utils/dates';
import { useEditorStore } from '../store/editorStore';
import { fetchUserProjects, deleteProject } from '../services/studioService';
import { LayoutGrid, Clock, Trash2, Video, Image as ImageIcon, Plus, Folder, Camera, Sparkles, Monitor, Film, Zap } from 'lucide-react';
import SEO from '../../components/SEO';

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
        const res = await footballApi.getFixtures(today);
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
        { id: 'bg_layer', type: 'rect', x: 0, y: 750, width: 1080, height: 420, fill: 'rgba(5, 7, 10, 0.85)', cornerRadius: 0 },
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
    if (proj.layers?.some(l => l.type === 'video')) return <Video size={24} className="zs-icon-accent" />;
    if (proj.type === 'Scoreboard') return <Film size={24} className="zs-icon-primary" />;
    return <ImageIcon size={24} className="zs-icon-gold" />;
  };

  const studioTools = [
    { title: 'Graphic Editor', desc: 'Build custom graphics & scoreboards', icon: <LayoutGrid size={28} />, bg: 'linear-gradient(135deg, #1e293b, #0f172a)', route: '/studio/templates' },
    { title: 'Viral Reactor Studio', desc: 'TikTok/IG Reels templates & effects', icon: <Zap size={28} />, bg: 'linear-gradient(135deg, #831843, #4a044e)', route: '/studio/reactor' },
    { title: 'Web Showcase Studio', desc: 'Record screen & webcam for demos', icon: <Monitor size={28} />, bg: 'linear-gradient(135deg, #155e75, #083344)', route: '/studio/web-showcase' },
    { title: 'Reaction Cam', desc: 'Record facecam reactions', icon: <Camera size={28} />, bg: 'linear-gradient(135deg, #7f1d1d, #450a0a)', route: '/studio/media' },
    { title: 'Face AR Studio', desc: 'Apply AR masks & filters', icon: <Sparkles size={28} />, bg: 'linear-gradient(135deg, #312e81, #1e1b4b)', route: '/studio/face-ar' },
  ];

  return (
    <div className="zs-home-page">
      <SEO title="ZOKASCORE Studio" description="The ultimate toolkit for football creators." path="/studio" />
      <div className="zs-home-container">
        
        <div className="zs-home-header">
          <h1 className="zs-home-title">ZOKASCORE Studio</h1>
          <p className="zs-home-subtitle">The ultimate toolkit for football creators.</p>
        </div>

        <div className="zs-tools-grid">
          {studioTools.map((tool, i) => (
            <div key={i} className="zs-tool-card" style={{ background: tool.bg }} onClick={() => navigate(tool.route)}>
              <div className="zs-tool-icon">{tool.icon}</div>
              <span className="zs-tool-title">{tool.title}</span>
              <span className="zs-tool-desc">{tool.desc}</span>
            </div>
          ))}
        </div>

        <div className="zs-mb-32">
          <div className="zs-section-header">
            <Folder size={22} className="zs-icon-primary" />
            <h2 className="zs-section-title">My Projects</h2>
          </div>
          
          {savedProjects.length === 0 ? (
            <div className="zs-empty-state">
              <Plus size={32} className="zs-empty-icon" />
              <p className="zs-empty-title">No saved projects yet</p>
              <p className="zs-empty-desc">Pick a tool above to start creating!</p>
            </div>
          ) : (
            <div className="zs-projects-grid">
              {savedProjects.map(p => (
                <div key={p.id} className="zs-project-card" onClick={() => openSavedProject(p)}>
                  <div className="zs-project-thumb">{getProjectIcon(p)}</div>
                  <div className="zs-project-info">
                    <div className="zs-flex-between">
                      <span className="zs-project-name">{p.name}</span>
                      <button onClick={(e) => handleDelete(e, p.id)} className="zs-btn-icon-danger"><Trash2 size={14} /></button>
                    </div>
                    <span className="zs-project-date">
                      <Clock size={10} /> {new Date(p.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="zs-section-header">
            <Zap size={22} className="zs-icon-gold" />
            <h2 className="zs-section-title">Quick Create (Today's Matches)</h2>
          </div>
          
          <div className="zs-quick-create-list">
            {loading ? (
              <div className="zs-empty-state">Loading today's fixtures...</div>
            ) : matches.length === 0 ? (
              <div className="zs-empty-state">No matches found for today.</div>
            ) : (
              matches.map(m => (
                <div key={m.id} className="zs-quick-create-item" onClick={() => handleQuickCreate(m)}>
                  <div className="zs-match-info">
                    <img src={m.homeTeam?.crest} alt="" width="28" height="28" onError={(e) => e.target.style.display = 'none'} />
                    <div className="zs-match-teams">
                      <span className="zs-team-name">{m.homeTeam?.shortName || m.homeTeam?.name}</span>
                      <span className="zs-vs-text">vs</span>
                      <span className="zs-team-name">{m.awayTeam?.shortName || m.awayTeam?.name}</span>
                    </div>
                    <img src={m.awayTeam?.crest} alt="" width="28" height="28" onError={(e) => e.target.style.display = 'none'} />
                  </div>
                  <button className="zs-btn-primary">
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