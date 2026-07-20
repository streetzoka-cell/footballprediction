// src/studio/pages/StudioHome.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchFixtures } from '../../utils/api';
import { getLocalDateStr } from '../../utils/dates';
import { useEditorStore } from '../store/editorStore';
import { fetchUserProjects, deleteProject } from '../../services/studioService';
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
    { 
      title: 'Graphic Editor', 
      desc: 'Build custom graphics & scoreboards', 
      icon: <LayoutGrid size={28} />, 
      bg: 'linear-gradient(135deg, #1e293b, #0f172a)', 
      route: '/studio/templates' 
    },
    { 
      title: 'Viral Reactor Studio', 
      desc: 'TikTok/IG Reels templates & effects', 
      icon: <Zap size={28} />, 
      bg: 'linear-gradient(135deg, #831843, #4a044e)', 
      route: '/studio/reactor' 
    },
    { 
      title: 'Web Showcase Studio', 
      desc: 'Record screen & webcam for demos', 
      icon: <Monitor size={28} />, 
      bg: 'linear-gradient(135deg, #155e75, #083344)', 
      route: '/studio/web-showcase' 
    },
    { 
      title: 'Reaction Cam', 
      desc: 'Record facecam reactions', 
      icon: <Camera size={28} />, 
      bg: 'linear-gradient(135deg, #7f1d1d, #450a0a)', 
      route: '/studio/media' 
    },
    { 
      title: 'Face AR Studio', 
      desc: 'Apply AR masks & filters', 
      icon: <Sparkles size={28} />, 
      bg: 'linear-gradient(135deg, #312e81, #1e1b4b)', 
      route: '/studio/face-ar' 
    },
  ];

  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', background: '#0a0f1a', color: '#fff' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ marginBottom: '40px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '2.8rem', fontWeight: 900, margin: 0, letterSpacing: '-1px', background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            ZOKASCORE Studio
          </h1>
          <p style={{ color: '#64748b', margin: '8px 0 0 0', fontSize: '16px' }}>The ultimate toolkit for football creators.</p>
        </div>

        {/* Studio Tools Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '60px' }}>
          {studioTools.map((tool, i) => (
            <div 
              key={i} 
              onClick={() => navigate(tool.route)} 
              style={{ 
                ...cardBtnStyle, 
                background: tool.bg 
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-6px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div style={{ background: 'rgba(255,255,255,0.1)', padding: '14px', borderRadius: '14px', marginBottom: '16px', display: 'inline-flex' }}>
                {tool.icon}
              </div>
              <span style={{ fontSize: '16px', fontWeight: 800 }}>{tool.title}</span>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginTop: '6px', textAlign: 'center' }}>{tool.desc}</span>
            </div>
          ))}
        </div>

        {/* My Projects Section */}
        <div style={{ marginBottom: '60px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px', borderBottom: '1px solid #1f2937', paddingBottom: '12px' }}>
            <Folder size={22} color="#10b981" />
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>My Projects</h2>
          </div>
          
          {savedProjects.length === 0 ? (
            <div style={{ background: '#111827', padding: '40px', borderRadius: '16px', textAlign: 'center', color: '#64748b', border: '1px dashed #334155' }}>
              <Plus size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
              <p style={{ fontWeight: 600, color: '#94a3b8' }}>No saved projects yet</p>
              <p style={{ fontSize: '13px' }}>Pick a tool above to start creating!</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
              {savedProjects.map(p => (
                <div 
                  key={p.id} 
                  onClick={() => openSavedProject(p)} 
                  style={{ background: '#111827', borderRadius: '16px', cursor: 'pointer', border: '1px solid #1f2937', overflow: 'hidden', transition: 'all 0.2s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.borderColor = '#334155'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = '#1f2937'; }}
                >
                  <div style={{ height: '140px', background: '#0a0f1a', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #1f2937' }}>
                    {getProjectIcon(p)}
                  </div>
                  <div style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{p.name}</span>
                      <button onClick={(e) => handleDelete(e, p.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0', display: 'flex' }}><Trash2 size={14} /></button>
                    </div>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px' }}>
                      <Clock size={10} /> {new Date(p.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Create Section */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px', borderBottom: '1px solid #1f2937', paddingBottom: '12px' }}>
            <Zap size={22} color="#f59e0b" />
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Quick Create (Today's Matches)</h2>
          </div>
          
          <div style={{ display: 'grid', gap: '12px' }}>
            {loading ? (
              <div style={{ background: '#111827', padding: '24px', borderRadius: '12px', textAlign: 'center', color: '#64748b', border: '1px solid #1f2937' }}>
                Loading today's fixtures...
              </div>
            ) : matches.length === 0 ? (
              <div style={{ background: '#111827', padding: '24px', borderRadius: '12px', textAlign: 'center', color: '#64748b', border: '1px solid #1f2937' }}>
                No matches found for today.
              </div>
            ) : (
              matches.map(m => (
                <div 
                  key={m.id} 
                  onClick={() => handleQuickCreate(m)} 
                  style={{ 
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                    background: 'linear-gradient(to right, #111827, #0f172a)', 
                    padding: '16px 20px', borderRadius: '12px', cursor: 'pointer', 
                    border: '1px solid #1f2937',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'linear-gradient(to right, #1e293b, #172033)'; e.currentTarget.style.borderColor = '#334155'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(to right, #111827, #0f172a)'; e.currentTarget.style.borderColor = '#1f2937'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <img src={m.homeTeam?.crest} alt="" style={{ width: '28px', height: '28px' }} onError={(e) => e.target.style.display = 'none'} />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 700, fontSize: '15px' }}>{m.homeTeam?.shortName || m.homeTeam?.name}</span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>vs</span>
                      <span style={{ fontWeight: 700, fontSize: '15px' }}>{m.awayTeam?.shortName || m.awayTeam?.name}</span>
                    </div>
                    <img src={m.awayTeam?.crest} alt="" style={{ width: '28px', height: '28px' }} onError={(e) => e.target.style.display = 'none'} />
                  </div>
                  <button 
                    style={{ 
                      background: '#10b981', color: '#fff', border: 'none', 
                      padding: '8px 16px', borderRadius: '8px', fontWeight: 700, fontSize: '13px',
                      display: 'flex', alignItems: 'center', gap: '6px',
                      cursor: 'pointer'
                    }}
                  >
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

const cardBtnStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', 
  color: '#fff', border: '1px solid rgba(255,255,255,0.1)', 
  padding: '28px 20px', borderRadius: '20px', cursor: 'pointer', 
  transition: 'transform 0.2s, box-shadow 0.2s',
  minHeight: '200px',
  justifyContent: 'center',
  boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
};