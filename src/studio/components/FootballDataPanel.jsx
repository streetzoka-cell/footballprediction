import React from 'react';
import { useEditorStore } from '../store/proEditorStore';
import { Shirt, Tv, User } from 'lucide-react';

export default function FootballDataPanel({ onClose }) {
  const { project, addLayer } = useEditorStore();
  const match = project?.matchData;

  if (!match) return null;

  const homeName = match.homeTeam?.shortName || match.homeTeam?.name || 'Home';
  const awayName = match.awayTeam?.shortName || match.awayTeam?.name || 'Away';
  const homeLogo = match.homeTeam?.crest;
  const awayLogo = match.awayTeam?.crest;
  const homeScore = match.score?.fullTime?.home ?? 0;
  const awayScore = match.score?.fullTime?.away ?? 0;

  const addScorebug = () => {
    addLayer({ type: 'rect', x: 40, y: 1750, width: 450, height: 100, fill: 'rgba(0, 0, 0, 0.85)', cornerRadius: 12 });
    addLayer({ type: 'image', src: homeLogo, x: 60, y: 1770, width: 60, height: 60 });
    addLayer({ type: 'text', text: homeName, x: 140, y: 1780, fontSize: 28, fill: '#ffffff', fontStyle: 'bold' });
    addLayer({ type: 'text', text: `${homeScore}`, x: 350, y: 1770, fontSize: 40, fill: '#10b981', fontStyle: 'bold' });
    addLayer({ type: 'text', text: '-', x: 385, y: 1770, fontSize: 40, fill: '#ffffff' });
    addLayer({ type: 'text', text: `${awayScore}`, x: 410, y: 1770, fontSize: 40, fill: '#10b981', fontStyle: 'bold' });
    onClose();
  };

  const addFormation = () => {
    addLayer({ type: 'rect', x: 140, y: 400, width: 800, height: 1200, fill: '#15803d', cornerRadius: 12 });
    addLayer({ type: 'rect', x: 140, y: 990, width: 800, height: 4, fill: 'rgba(255,255,255,0.5)' });
    const positions = [
      { x: 540, y: 1520, num: 1 }, { x: 300, y: 1350, num: 2 }, { x: 420, y: 1350, num: 3 }, { x: 660, y: 1350, num: 4 }, { x: 780, y: 1350, num: 5 },
      { x: 340, y: 1150, num: 6 }, { x: 540, y: 1150, num: 7 }, { x: 740, y: 1150, num: 8 },
      { x: 320, y: 950, num: 9 }, { x: 540, y: 920, num: 10 }, { x: 760, y: 950, num: 11 }
    ];
    positions.forEach(p => {
      addLayer({ type: 'circle', x: p.x, y: p.y, radius: 30, fill: '#ffffff' });
      addLayer({ type: 'text', text: String(p.num), x: p.x - 12, y: p.y - 20, fontSize: 35, fill: '#000000', fontStyle: 'bold' });
    });
    onClose();
  };

  const addPlayerCard = (teamName, teamLogo, isHome) => {
    const bgColor = isHome ? '#1e3a8a' : '#7f1d1d';
    const cardX = 340, cardY = 500;
    addLayer({ type: 'rect', x: cardX, y: cardY, width: 400, height: 600, fill: bgColor, cornerRadius: 20 });
    addLayer({ type: 'rect', x: cardX + 10, y: cardY + 10, width: 380, height: 580, fill: 'transparent', stroke: '#fbbf24', strokeWidth: 2, cornerRadius: 16 });
    addLayer({ type: 'text', text: '91', x: cardX + 30, y: cardY + 30, fontSize: 60, fill: '#fbbf24', fontStyle: 'bold', fontFamily: 'Inter, sans-serif' });
    addLayer({ type: 'text', text: 'ST', x: cardX + 40, y: cardY + 100, fontSize: 30, fill: '#ffffff', fontStyle: 'bold', fontFamily: 'Inter, sans-serif' });
    addLayer({ type: 'image', src: teamLogo, x: cardX + 30, y: cardY + 150, width: 60, height: 60 });
    addLayer({ type: 'circle', x: cardX + 200, y: cardY + 250, radius: 80, fill: 'rgba(255,255,255,0.2)' });
    addLayer({ type: 'rect', x: cardX, y: cardY + 480, width: 400, height: 120, fill: 'rgba(0,0,0,0.4)', cornerRadius: 0 });
    addLayer({ type: 'text', text: 'PLAYER NAME', x: cardX, y: cardY + 510, width: 400, align: 'center', fontSize: 36, fill: '#ffffff', fontStyle: 'bold', fontFamily: 'Inter, sans-serif' });
    onClose();
  };

  return (
    <div style={{ background: '#111827', borderTop: '1px solid #1f2937', padding: '24px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 800 }}>Football Graphics</h2>
        <button onClick={onClose} style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>Close</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1f2937', padding: '12px', borderRadius: '12px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src={homeLogo} alt="" style={{ width: '24px', height: '24px' }} />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>{homeName}</span>
        </div>
        <span style={{ color: '#10b981', fontWeight: 900, fontSize: '16px' }}>{homeScore} - {awayScore}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>{awayName}</span>
          <img src={awayLogo} alt="" style={{ width: '24px', height: '24px' }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <button onClick={addScorebug} style={btnStyle}><Tv size={24} /><span>Scorebug</span><span style={subStyle}>Broadcast overlay</span></button>
        <button onClick={addFormation} style={btnStyle}><Shirt size={24} /><span>4-3-3 Formation</span><span style={subStyle}>Home team lineup</span></button>
      </div>
      <div style={{ marginTop: '24px' }}>
        <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 800, marginBottom: '12px' }}>Player Card Builder</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <button onClick={() => addPlayerCard(homeName, homeLogo, true)} style={btnStyle}><User size={24} /><span>{homeName} Card</span><span style={subStyle}>Blue Template</span></button>
          <button onClick={() => addPlayerCard(awayName, awayLogo, false)} style={btnStyle}><User size={24} /><span>{awayName} Card</span><span style={subStyle}>Red Template</span></button>
        </div>
      </div>
    </div>
  );
}

const btnStyle = { background: '#1f2937', border: '1px solid #334155', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#fff', cursor: 'pointer' };
const subStyle = { fontSize: '10px', color: '#64748b', fontWeight: 600 };