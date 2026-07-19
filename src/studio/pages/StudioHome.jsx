// src/studio/pages/StudioHome.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchFixtures } from '../../utils/api';
import { getLocalDateStr } from '../../utils/dates';
import { useEditorStore } from '../store/proEditorStore';
import { fetchUserProjects, deleteProject } from '../services/studioService';
import { LayoutGrid, Clock, Trash2, Video, Film, Image, Plus, Folder, Camera, Sparkles } from 'lucide-react';

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
    if (proj.layers?.some(l => l.type === 'video')) return <Video size={16} color="#3b82f6" />;
    if (proj.type === 'Scoreboard') return <Film size={16} color="#10b981" />;
    return <Image size={16} color="#f59e0b" />;
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 900, margin: 0 }}>ZOKASCORE Studio</h1>
          <p style={{ color: '#94a3b8', margin: '4px 0 0 0' }}>Create professional football graphics in seconds.</p>
        </div>
      </div>

      {/* Quick Actions Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '40px' }}>
        <button onClick={() => navigate('/studio/templates')} style={cardBtnStyle}>
          <LayoutGrid size={24} /> <span>Templates</span>
        </button>
        <button onClick={() => navigate('/studio/reactor')} style={{...cardBtnStyle, background: 'linear-gradient(135deg, #831843, #4a044e)'}}>
          <Video size={24} /> <span>Reactor Studio</span>
        </button>
        <button onClick={() => navigate('/studio/media')} style={{...cardBtnStyle, background: 'linear-gradient(135deg, #7f1d1d, #450a0a)'}}>
          <Camera size={24} /> <span>Reaction Studio</span>
        </button>
        <button onClick={() => navigate('/studio/face-ar')} style={{...cardBtnStyle, background: 'linear-gradient(135deg, #312e81, #1e1b4b)'}}>
          <Sparkles size={24} /> <span>Face AR Studio</span>
        </button>
      </div>


      <div style={{ marginBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Folder size={18} color="#94a3b8" />
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>My Projects</h2>
        </div>
        {savedProjects.length === 0 ? (
          <div style={{ background: '#1e293b', padding: '24px', borderRadius: '12px', textAlign: 'center', color: '#64748b', border: '1px dashed #334155' }}>
            No saved projects yet. Create one below!
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
            {savedProjects.map(p => (
              <div key={p.id} onClick={() => openSavedProject(p)} style={{ background: '#1e293b', borderRadius: '12px', cursor: 'pointer', border: '1px solid #334155', overflow: 'hidden', transition: 'transform 0.2s' }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <div style={{ height: '120px', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #334155' }}>
                  {getProjectIcon(p)}
                </div>
                <div style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{p.name}</span>
                    <button onClick={(e) => handleDelete(e, p.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0' }}><Trash2 size={12} /></button>
                  </div>
                  <span style={{ fontSize: '10px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px' }}><Clock size={10} /> {new Date(p.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Plus size={18} color="#94a3b8" />
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Quick Create (Today's Matches)</h2>
      </div>
      <div style={{ display: 'grid', gap: '12px' }}>
        {loading ? <p style={{ color: '#64748b' }}>Loading matches...</p> : matches.map(m => (
          <div key={m.id} onClick={() => handleQuickCreate(m)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1e293b', padding: '12px 16px', borderRadius: '10px', cursor: 'pointer', border: '1px solid #334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <img src={m.homeTeam?.crest} alt="" style={{ width: '24px', height: '24px' }} />
              <span style={{ fontWeight: 700, fontSize: '14px' }}>{m.homeTeam?.shortName || m.homeTeam?.name}</span>
              <span style={{ color: '#64748b' }}>vs</span>
              <span style={{ fontWeight: 700, fontSize: '14px' }}>{m.awayTeam?.shortName || m.awayTeam?.name}</span>
              <img src={m.awayTeam?.crest} alt="" style={{ width: '24px', height: '24px' }} />
            </div>
            <button style={{ background: '#10b981', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: 700, fontSize: '12px' }}>Create</button>
          </div>
        ))}
      </div>
    </div>
  );
}

const cardBtnStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', 
  background: '#1e293b', color: '#fff', border: '1px solid #334155', 
  padding: '20px', borderRadius: '12px', cursor: 'pointer', fontWeight: '700', fontSize: '14px',
  transition: 'transform 0.2s'
};